<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$config = include __DIR__ . '/../config.php';

session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}
$userId = $_SESSION['user_id'];

try {
    $pdo = new PDO(
        "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}",
        $config['db']['user'],
        $config['db']['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $parts = explode('/', trim($path, '/'));
    if (count($parts) < 4 || $parts[0] !== 'api' || $parts[1] !== 'connect') {
        http_response_code(404);
        echo json_encode(['error' => 'Invalid path']);
        exit;
    }

    $platform = $parts[2];
    $action = $parts[3];  // init or complete

    if ($action === 'init') {
        $redirectUri = $config['app']['url'] . '/api/connect/' . $platform . '/complete';
        switch ($platform) {
            case 'steam':
                // Generate nonce
                $nonce = bin2hex(random_bytes(16));
                $stmt = $pdo->prepare('INSERT INTO user_accounts (user_id, ext_system, nonce) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nonce = ?');
                $stmt->execute([$userId, 'steam', $nonce, $nonce]);
                $authUrl = 'https://steamcommunity.com/openid/login?' . http_build_query([
                    'openid.claimed_id' => 'http://steamcommunity.com/openid/id/76561197960265728',
                    'openid.identity' => 'http://steamcommunity.com/openid/id/76561197960265728',
                    'openid.mode' => 'checkid_setup',
                    'openid.ns' => 'http://specs.openid.net/auth/2.0',
                    'openid.ns.sreg' => 'http://openid.net/extensions/sreg/1.1',
                    'openid.ns.ui' => 'http://specs.openid.net/auth/2.0/identifier_select',
                    'openid.return_to' => $redirectUri . '?nonce=' . $nonce,
                    'openid.realm' => $config['app']['url']
                ]);
                header('Location: ' . $authUrl);
                exit;
            case 'epic':
                $authUrl = 'https://www.epicgames.com/id/authorize?' . http_build_query([
                    'client_id' => $config['apis']['epic']['client_id'],
                    'response_type' => 'code',
                    'redirect_uri' => $redirectUri,
                    'scope' => 'basicProfile account entitlements'
                ]);
                header('Location: ' . $authUrl);
                exit;
            case 'itch':
                $state = bin2hex(random_bytes(32));
                $_SESSION['oauth_state'] = $state;
                $authUrl = 'https://itch.io/user/oauth?' . http_build_query([
                    'client_id' => $config['apis']['itch']['client_id'],
                    'scope' => 'profile:me',
                    'redirect_uri' => $redirectUri,
                    'state' => $state
                ]);
                header('Location: ' . $authUrl);
                exit;
            case 'gog':
                // Placeholder: No public API; manual or skip
                echo json_encode(['error' => 'GOG integration not supported yet - manual connect']);
                exit;
            case 'humble':
                // Placeholder: Partner-only
                echo json_encode(['error' => 'Humble Bundle requires partnership - fallback to manual']);
                exit;
            default:
                http_response_code(400);
                echo json_encode(['error' => 'Unsupported platform']);
        }
    } elseif ($action === 'complete') {
        switch ($platform) {
            case 'steam':
                // Basic OpenID verify (full impl needs library; here extract SteamID)
                $claimedId = $_GET['openid.claimed_id'] ?? '';
                if (strpos($claimedId, 'http://steamcommunity.com/openid/id/') === 0) {
                    $extId = substr($claimedId, strlen('http://steamcommunity.com/openid/id/'));
                    $nonce = $_GET['nonce'] ?? '';
                    // Verify nonce
                    $stmt = $pdo->prepare('SELECT id FROM user_accounts WHERE user_id = ? AND ext_system = ? AND nonce = ?');
                    $stmt->execute([$userId, 'steam', $nonce]);
                    if ($stmt->fetch()) {
                        $updateStmt = $pdo->prepare('UPDATE user_accounts SET ext_id = ?, nonce = NULL WHERE user_id = ? AND ext_system = ?');
                        $updateStmt->execute([$extId, $userId, 'steam']);
                        echo json_encode(['success' => true, 'platform' => 'steam', 'ext_id' => $extId]);
                    } else {
                        throw new InvalidArgumentException('Invalid nonce');
                    }
                } else {
                    throw new InvalidArgumentException('Invalid Steam response');
                }
                break;
            case 'epic':
                $code = $_GET['code'] ?? '';
                if (empty($code)) {
                    throw new InvalidArgumentException('No code provided');
                }
                $tokenUrl = 'https://www.epicgames.com/id/api/epic/token';
                $data = http_build_query([
                    'grant_type' => 'authorization_code',
                    'client_id' => $config['apis']['epic']['client_id'],
                    'client_secret' => $config['apis']['epic']['client_secret'],
                    'redirect_uri' => $config['app']['url'] . '/api/connect/epic/complete',
                    'code' => $code
                ]);
                $ch = curl_init($tokenUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($httpCode === 200) {
                    $tokens = json_decode($response, true);
                    $extId = $tokens['account_id'] ?? '';
                    if ($extId) {
                        $stmt = $pdo->prepare('INSERT INTO user_accounts (user_id, ext_system, ext_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ext_id = ?');
                        $stmt->execute([$userId, 'epic', $extId, $extId]);
                        echo json_encode(['success' => true, 'platform' => 'epic', 'ext_id' => $extId]);
                    } else {
                        throw new InvalidArgumentException('No account ID in response');
                    }
                } else {
                    throw new InvalidArgumentException('Token exchange failed: ' . $response);
                }
                break;
            case 'itch':
                $token = $_GET['access_token'] ?? '';
                $state = $_GET['state'] ?? '';
                if ($_SESSION['oauth_state'] !== $state) {
                    throw new InvalidArgumentException('Invalid state');
                }
                if (empty($token)) {
                    throw new InvalidArgumentException('No token provided');
                }
                // Fetch /me to get user ID
                $meUrl = 'https://itch.io/api/1/bearer/' . $token . '/me';
                $ch = curl_init($meUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($httpCode === 200) {
                    $userData = json_decode($response, true);
                    $extId = $userData['user']['id'] ?? '';
                    if ($extId) {
                        $stmt = $pdo->prepare('INSERT INTO user_accounts (user_id, ext_system, ext_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ext_id = ?');
                        $stmt->execute([$userId, 'itch', $extId, $extId]);
                        echo json_encode(['success' => true, 'platform' => 'itch', 'ext_id' => $extId]);
                    } else {
                        throw new InvalidArgumentException('No user ID in response');
                    }
                } else {
                    throw new InvalidArgumentException('Itch API call failed: ' . $response);
                }
                break;
            case 'gog':
                // Placeholder
                echo json_encode(['success' => false, 'message' => 'GOG not implemented']);
                break;
            case 'humble':
                // Placeholder
                echo json_encode(['success' => false, 'message' => 'Humble not implemented']);
                break;
            default:
                http_response_code(400);
                echo json_encode(['error' => 'Unsupported platform']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
}
