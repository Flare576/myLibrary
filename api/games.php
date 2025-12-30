<?php
session_start();

require_once __DIR__ . '/../classes/Cache.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$config = include __DIR__ . '/../config.php';
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
    
    // Remove subdirectory from path for routing (same as auth.php)
    $path = preg_replace('#^/[^/]+/#', '/', $path);
    
    $parts = explode('/', trim($path, '/'));
    if (count($parts) < 3 || $parts[0] !== 'api' || $parts[1] !== 'games') {
        http_response_code(404);
        echo json_encode(['error' => 'Invalid path']);
        exit;
    }

    $platform = $parts[2]; // Could be 'all' or a specific platform
    $method = $_SERVER['REQUEST_METHOD'];

    if ($platform === 'all') {
        // Handle aggregation for all platforms
        if ($method === 'GET') {
            $result = fetchAllPlatforms($pdo, $cache, $userId, $config);
            echo json_encode($result);
        } elseif ($method === 'POST') {
            $result = refreshAllPlatforms($pdo, $cache, $userId, $config);
            echo json_encode($result);
        } else {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
        }
    } else {
        // Handle individual platform (existing functionality)
        $stmt = $pdo->prepare('SELECT ext_id FROM user_accounts WHERE user_id = ? AND ext_system = ?');
        $stmt->execute([$userId, $platform]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || empty($row['ext_id'])) {
            echo json_encode(['status' => 404, 'errorMessage' => 'Platform not connected']);
            exit;
        }
        $extId = $row['ext_id'];

        $key = "{$userId}_{$platform}";

        if ($method === 'GET') {
            $games = $cache->get($key);
            $cached = true;
            if ($games === null) {
                $games = fetchFromPlatform($platform, $extId, $config);
                $cache->set($key, $games);
                $cached = false;
            }
            echo json_encode(['status' => 200, 'games' => $games, 'cached' => $cached]);
        } elseif ($method === 'POST') {
            $cache->delete($key);
            $games = fetchFromPlatform($platform, $extId, $config);
            $cache->set($key, $games);
            echo json_encode(['status' => 200, 'games' => $games, 'refreshed' => true]);
        } else {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function fetchAllPlatforms(PDO $pdo, Cache $cache, string $userId, array $config): array
{
    // Get all connected platforms for user
    $stmt = $pdo->prepare('SELECT ext_system, ext_id FROM user_accounts WHERE user_id = ?');
    $stmt->execute([$userId]);
    $connectedPlatforms = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $platformMap = [];
    foreach ($connectedPlatforms as $platform) {
        $platformMap[$platform['ext_system']] = $platform['ext_id'];
    }
    
    $supportedPlatforms = ['steam', 'epic', 'itch', 'gog', 'humble'];
    $result = [];
    
    foreach ($supportedPlatforms as $platform) {
        if (isset($platformMap[$platform])) {
            // Platform is connected, fetch games
            $key = "{$userId}_{$platform}";
            $games = $cache->get($key);
            $cached = true;
            
            if ($games === null) {
                try {
                    $games = fetchFromPlatform($platform, $platformMap[$platform], $config);
                    $cache->set($key, $games);
                    $cached = false;
                    $result[$platform] = ['status' => 200, 'games' => $games, 'cached' => $cached];
                } catch (Exception $e) {
                    $result[$platform] = ['status' => 500, 'errorMessage' => 'Failed to fetch games: ' . $e->getMessage()];
                }
            } else {
                $result[$platform] = ['status' => 200, 'games' => $games, 'cached' => $cached];
            }
        } else {
            // Platform not connected
            $result[$platform] = ['status' => 404, 'errorMessage' => 'Platform not connected'];
        }
    }
    
    return $result;
}

function refreshAllPlatforms(PDO $pdo, Cache $cache, string $userId, array $config): array
{
    // Get all connected platforms for user
    $stmt = $pdo->prepare('SELECT ext_system, ext_id FROM user_accounts WHERE user_id = ?');
    $stmt->execute([$userId]);
    $connectedPlatforms = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $platformMap = [];
    foreach ($connectedPlatforms as $platform) {
        $platformMap[$platform['ext_system']] = $platform['ext_id'];
    }
    
    $supportedPlatforms = ['steam', 'epic', 'itch', 'gog', 'humble'];
    $result = [];
    
    foreach ($supportedPlatforms as $platform) {
        if (isset($platformMap[$platform])) {
            // Platform is connected, clear cache and fetch fresh data
            $key = "{$userId}_{$platform}";
            $cache->delete($key);
            
            try {
                $games = fetchFromPlatform($platform, $platformMap[$platform], $config);
                $cache->set($key, $games);
                $result[$platform] = ['status' => 200, 'games' => $games, 'refreshed' => true];
            } catch (Exception $e) {
                $result[$platform] = ['status' => 500, 'errorMessage' => 'Failed to refresh games: ' . $e->getMessage()];
            }
        } else {
            // Platform not connected
            $result[$platform] = ['status' => 404, 'errorMessage' => 'Platform not connected'];
        }
    }
    
    return $result;
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
