<?php
session_start();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../classes/Cache.php';
require_once __DIR__ . '/../classes/GamesManager.php';
require_once __DIR__ . '/../classes/Encryption.php';

$config = include __DIR__ . '/../config.php';
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}
$userId = $_SESSION['user_id'];

try {
    $dsn = isset($config['db']['socket'])
        ? "mysql:unix_socket={$config['db']['socket']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}"
        : "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";
    $pdo = new PDO(
        $dsn,
        $config['db']['user'],
        $config['db']['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    
    $cache = new Cache($config['app']['cache_dir'], 86400 * 365);
    $gamesManager = new GamesManager($pdo, $cache, $config);

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
        // Set callback URL based on platform - unified callback system
        $callbackPages = [
            'steam' => 'callback.html',
            'epic' => 'callback.html',
            'itch' => 'callback.html'
        ];
        $callbackPage = $callbackPages[$platform] ?? 'callback.html';
        $redirectUri = rtrim($config['app']['url'], '/') . '/' . $callbackPage;
        switch ($platform) {
            case 'steam':
                // Generate nonce
                $nonce = bin2hex(random_bytes(16));
                $stmt = $pdo->prepare('INSERT INTO user_accounts (user_id, ext_system, nonce) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nonce = ?');
                $stmt->execute([$userId, 'steam', $nonce, $nonce]);
                $authUrl = 'https://steamcommunity.com/openid/login?' . http_build_query([
                    'openid.claimed_id' => 'http://specs.openid.net/auth/2.0/identifier_select',
                    'openid.identity' => 'http://specs.openid.net/auth/2.0/identifier_select',
                    'openid.mode' => 'checkid_setup',
                    'openid.ns' => 'http://specs.openid.net/auth/2.0',
                    'openid.ns.sreg' => 'http://openid.net/extensions/sreg/1.1',
                    'openid.ns.ui' => 'http://specs.openid.net/auth/2.0/identifier_select',
'openid.return_to' => $redirectUri . '?nonce=' . $nonce,
                    'openid.realm' => $config['app']['url']
                ]);
                echo json_encode(['authUrl' => $authUrl]);
                exit;
            case 'epic':
                // Use Epic launcher client flow (same as Heroic/legendary/Playnite)
                // This uses Epic's internal launcherAppClient2 credentials, not the dev portal
                $stateData = [
                    'platform' => 'epic',
                    'nonce' => bin2hex(random_bytes(16)),
                    'timestamp' => time()
                ];
                $_SESSION['oauth_state'] = $stateData;

                // Redirect user to Epic login; after login Epic redirects back with ?code=
                // The launcherAppClient2 client ID is the same one Epic's own launcher uses
                $authUrl = 'https://www.epicgames.com/id/api/redirect?' . http_build_query([
                    'clientId' => '34a02cf8f4414e29b15921876da36f9a',
                    'responseType' => 'code'
                ]);
                echo json_encode(['authUrl' => $authUrl, 'state' => base64_encode(json_encode($stateData))]);
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
                echo json_encode(['authUrl' => $authUrl]);
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
        // Get input data from POST body or GET fallback
        $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
        
        switch ($platform) {
            case 'steam':
                // Handle Steam callback - extract SteamID and complete connection
                $claimedId = $input['claimedId'] ?? '';
                $nonce = $input['nonce'] ?? '';
                
                if (empty($claimedId) || empty($nonce)) {
                    throw new InvalidArgumentException('Missing required Steam parameters');
                }

                if (!str_contains($claimedId, 'steamcommunity.com/openid/id/')) {
                    throw new InvalidArgumentException('Invalid Steam claimed_id format');
                }

                // Extract SteamID from claimed_id
                $extId = basename($claimedId);
                
                // Start transaction for atomic connection + games fetch
                $pdo->beginTransaction();
                
                try {
                    // Verify nonce and store connection
                    $stmt = $pdo->prepare('SELECT id FROM user_accounts WHERE user_id = ? AND ext_system = ? AND nonce = ?');
                    $stmt->execute([$userId, 'steam', $nonce]);
                    
                    if (!$stmt->fetch()) {
                        throw new InvalidArgumentException('Invalid nonce');
                    }
                    
                    // Update connection with external ID
                    $updateStmt = $pdo->prepare('UPDATE user_accounts SET ext_id = ?, nonce = NULL WHERE user_id = ? AND ext_system = ?');
                    $updateStmt->execute([$extId, $userId, 'steam']);
                    
                    // Auto-fetch games using GamesManager
                    $games = $gamesManager->autoFetchGames($userId, 'steam', $extId);
                    
                    // Commit transaction
                    $pdo->commit();
                    
                    echo json_encode(['success' => true, 'platform' => 'steam', 'ext_id' => $extId, 'games' => $games, 'gamesCount' => count($games)]);
                } catch (Exception $e) {
                    // Rollback connection if games fetch fails
                    $pdo->rollback();
                    
                    // Clean up partial connection
                    $cleanupStmt = $pdo->prepare('UPDATE user_accounts SET ext_id = NULL WHERE user_id = ? AND ext_system = ?');
                    $cleanupStmt->execute([$userId, 'steam']);
                    
                    // Return appropriate error response
                    if (str_contains($e->getMessage(), 'Please wait')) {
                        http_response_code(429);
                        echo json_encode(['status' => 429, 'errorMessage' => $e->getMessage()]);
                    } else {
                        http_response_code(500);
                        echo json_encode(['status' => 500, 'errorMessage' => 'Connection successful but failed to fetch games list. Please try connecting again.']);
                    }
                    exit;
                }
                break;
            case 'epic':
                $code = $input['code'] ?? '';
                $state = $input['state'] ?? '';
                
                if (empty($code)) {
                    throw new InvalidArgumentException('No code provided');
                }
                
                // Verify state parameter
                if (empty($state) || !isset($_SESSION['oauth_state'])) {
                    throw new InvalidArgumentException('Invalid state parameter');
                }
                
                $stateData = json_decode(base64_decode($state), true);
                if (!$stateData || $stateData['platform'] !== 'epic') {
                    throw new InvalidArgumentException('Invalid state data');
                }
                
                // Verify nonce for security
                if ($stateData['nonce'] !== $_SESSION['oauth_state']['nonce']) {
                    throw new InvalidArgumentException('State verification failed');
                }
                
                // Clean up session state
                unset($_SESSION['oauth_state']);
                
                // Start transaction for atomic connection + games fetch
                $pdo->beginTransaction();
                
                try {
                    // Use Epic's internal launcher endpoint (same as Heroic/legendary/Playnite)
                    // launcherAppClient2 credentials - Epic's own launcher uses these
                    $tokenUrl = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
                    $launcherClientId = '34a02cf8f4414e29b15921876da36f9a';
                    $launcherClientSecret = 'daafbccc737745039dffe53d94fc76cf';

                    $data = http_build_query([
                        'grant_type' => 'authorization_code',
                        'code' => $code,
                        'token_type' => 'eg1'
                    ]);

                    $authHeader = 'Basic ' . base64_encode($launcherClientId . ':' . $launcherClientSecret);
                    
                    $ch = curl_init($tokenUrl);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_POST, true);
                    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, [
                        'Content-Type: application/x-www-form-urlencoded',
                        'Authorization: ' . $authHeader,
                        'User-Agent: EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live'
                    ]);
                    $response = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);
                    
                    if ($httpCode !== 200) {
                        error_log("Epic token exchange HTTP $httpCode: " . $response);
                        throw new InvalidArgumentException('Token exchange failed: ' . $response);
                    }
                    
                    $tokens = json_decode($response, true);
                    error_log("Epic token response: " . json_encode($tokens));
                    $extId = $tokens['account_id'] ?? '';
                    $accessToken = $tokens['access_token'] ?? '';
                    $refreshToken = $tokens['refresh_token'] ?? '';
                    $expiresIn = $tokens['expires_in'] ?? 3600;
                    
                    if (!$extId || !$accessToken) {
                        throw new InvalidArgumentException('Missing required token data');
                    }
                    
                    // Encrypt tokens before storage
                    $encryption = new Encryption($config['app']['encryption_key']);
                    $encryptedAccessToken = $encryption->encrypt($accessToken);
                    $encryptedRefreshToken = $refreshToken ? $encryption->encrypt($refreshToken) : null;
                    $tokenExpiresAt = date('Y-m-d H:i:s', time() + $expiresIn);
                    
                    // Store Epic tokens and connection
                    $stmt = $pdo->prepare('
                        INSERT INTO user_accounts (user_id, ext_system, ext_id, access_token, refresh_token, token_expires_at, epic_account_id) 
                        VALUES (?, ?, ?, ?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        ext_id = VALUES(ext_id), 
                        access_token = VALUES(access_token),
                        refresh_token = VALUES(refresh_token),
                        token_expires_at = VALUES(token_expires_at),
                        epic_account_id = VALUES(epic_account_id)
                    ');
                    $stmt->execute([$userId, 'epic', $extId, $encryptedAccessToken, $encryptedRefreshToken, $tokenExpiresAt, $extId]);
                    
                    // Auto-fetch games using GamesManager
                    try {
                        $games = $gamesManager->autoFetchGames($userId, 'epic', $extId);
                        error_log("Epic games fetch successful: " . count($games) . " games");
                    } catch (Exception $gameError) {
                        error_log("Epic games fetch error: " . $gameError->getMessage());
                        throw new Exception('Games fetch failed: ' . $gameError->getMessage());
                    }
                    
                    // Commit transaction
                    $pdo->commit();
                    
                    echo json_encode(['success' => true, 'platform' => 'epic', 'ext_id' => $extId, 'games' => $games, 'gamesCount' => count($games)]);
                } catch (Exception $e) {
                    // Rollback connection if games fetch fails
                    $pdo->rollback();
                    
                    // Clean up partial connection
                    $cleanupStmt = $pdo->prepare('DELETE FROM user_accounts WHERE user_id = ? AND ext_system = ?');
                    $cleanupStmt->execute([$userId, 'epic']);
                    
                    // Return appropriate error response
                    if (str_contains($e->getMessage(), 'Please wait')) {
                        http_response_code(429);
                        echo json_encode(['status' => 429, 'errorMessage' => $e->getMessage()]);
                    } else {
                        http_response_code(500);
                        echo json_encode(['status' => 500, 'errorMessage' => 'Connection successful but failed to fetch games list. Please try connecting again.']);
                    }
                    exit;
                }
                break;
            case 'itch':
                $token = $input['access_token'] ?? '';
                $state = $input['state'] ?? '';
                if ($_SESSION['oauth_state'] !== $state) {
                    throw new InvalidArgumentException('Invalid state');
                }
                if (empty($token)) {
                    throw new InvalidArgumentException('No token provided');
                }
                
                // Start transaction for atomic connection + games fetch
                $pdo->beginTransaction();
                
                try {
                    // Fetch /me to get user ID
                    $meUrl = 'https://itch.io/api/1/bearer/' . $token . '/me';
                    $ch = curl_init($meUrl);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
                    $response = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);
                    
                    if ($httpCode !== 200) {
                        throw new InvalidArgumentException('Itch API call failed: ' . $response);
                    }
                    
                    $userData = json_decode($response, true);
                    $extId = $userData['user']['id'] ?? '';
                    if (!$extId) {
                        throw new InvalidArgumentException('No user ID in response');
                    }
                    
                    // Store connection
                    $stmt = $pdo->prepare('INSERT INTO user_accounts (user_id, ext_system, ext_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ext_id = ?');
                    $stmt->execute([$userId, 'itch', $extId, $extId]);
                    
                    // Store token temporarily for games fetch
                    $_SESSION['temp_itch_token'] = $token;
                    
                    // Auto-fetch games using GamesManager
                    $games = $gamesManager->autoFetchGames($userId, 'itch', $extId);
                    
                    // Clean up temporary token
                    unset($_SESSION['temp_itch_token']);
                    
                    // Commit transaction
                    $pdo->commit();
                    
                    echo json_encode(['success' => true, 'platform' => 'itch', 'ext_id' => $extId, 'games' => $games, 'gamesCount' => count($games)]);
                } catch (Exception $e) {
                    // Log the actual error for debugging
                    error_log("Epic connection error: " . $e->getMessage());
                    
                    // Rollback connection if games fetch fails
                    $pdo->rollback();
                    
                    // Clean up partial connection
                    unset($_SESSION['oauth_state']);
                    $cleanupStmt = $pdo->prepare('DELETE FROM user_accounts WHERE user_id = ? AND ext_system = ?');
                    $cleanupStmt->execute([$userId, 'epic']);
                    
                    // Return appropriate error response
                    if (str_contains($e->getMessage(), 'Please wait')) {
                        http_response_code(429);
                        echo json_encode(['status' => 429, 'errorMessage' => $e->getMessage()]);
                    } else {
                        http_response_code(500);
                        echo json_encode(['status' => 500, 'errorMessage' => 'Connection successful but failed to fetch games list. Please try connecting again.']);
                    }
                    exit;
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
