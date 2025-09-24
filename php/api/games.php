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

    $cache = new Cache($config['app']['cache_dir'], 300);  // 5 min TTL

    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $parts = explode('/', trim($path, '/'));
    if (count($parts) < 3 || $parts[0] !== 'api' || $parts[1] !== 'games') {
        http_response_code(404);
        echo json_encode(['error' => 'Invalid path']);
        exit;
    }

    $platform = $parts[2];
    $method = $_SERVER['REQUEST_METHOD'];

    // Get ext_id
    $stmt = $pdo->prepare('SELECT ext_id FROM user_accounts WHERE user_id = ? AND ext_system = ?');
    $stmt->execute([$userId, $platform]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['ext_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Platform not connected']);
        exit;
    }
    $extId = $row['ext_id'];

    $key = "{$userId}_{$platform}";

    if ($method === 'GET') {
        $games = $cache->get($key);
        if ($games === null) {
            $games = $this->fetchFromPlatform($platform, $extId, $config);
            $cache->set($key, $games);
        }
        echo json_encode(['success' => true, 'games' => $games, 'cached' => true]);
    } elseif ($method === 'POST' && $path === '/api/games/refresh') {
        $cache->delete($key);
        $games = $this->fetchFromPlatform($platform, $extId, $config);
        $cache->set($key, $games);
        echo json_encode(['success' => true, 'games' => $games, 'refreshed' => true]);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function fetchFromPlatform(string $platform, string $extId, array $config): array
{
    switch ($platform) {
        case 'steam':
            $url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?' . http_build_query([
                'key' => $config['apis']['steam']['key'],
                'steamid' => $extId,
                'include_appinfo' => 1,
                'include_played_free_games' => 1,
                'format' => 'json'
            ]);
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($httpCode !== 200) {
                throw new RuntimeException('Steam API error: ' . $response);
            }
            $data = json_decode($response, true);
            if (isset($data['response']['error'])) {
                throw new RuntimeException('Steam error: ' . $data['response']['error']['errordesc']);
            }
            return $data['response']['games'] ?? [];
        case 'epic':
            // Get access token if needed; assume stored or refresh
            // For simplicity, assume token in session or fetch
            // Placeholder: Use entitlements
            $accessToken = 'DUMMY_TOKEN';  // Implement refresh from session or DB
            $url = "https://api.epicgames.com/account/api/epic/v1/account/{$extId}/products?entitlementType=product";
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Bearer ' . $accessToken,
                'Accept: application/json'
            ]);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($httpCode !== 200) {
                throw new RuntimeException('Epic API error: ' . $response);
            }
            $data = json_decode($response, true);
            $games = [];
            foreach ($data['data'] ?? [] as $item) {
                if ($item['status'] === 'FULFILLED') {
                    $games[] = ['id' => $item['catalogItemId'], 'platform' => 'epic'];
                }
            }
            return $games;
        case 'itch':
            $token = 'DUMMY_TOKEN';  // From connect
            $url = 'https://itch.io/api/1/bearer/' . $token . '/my-games';
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($httpCode !== 200) {
                throw new RuntimeException('Itch API error: ' . $response);
            }
            $data = json_decode($response, true);
            return $data['games'] ?? [];
        case 'gog':
            // Placeholder - no API
            return [];
        case 'humble':
            // Placeholder
            return [];
        default:
            throw new InvalidArgumentException('Unsupported platform');
    }
}
