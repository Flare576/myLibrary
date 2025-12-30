<?php
session_start();

require_once __DIR__ . '/../classes/Cache.php';
require_once __DIR__ . '/../classes/GamesManager.php';

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

    $cache = new Cache($config['app']['cache_dir'], 86400 * 365);  // Indefinite cache (1 year)
    $gamesManager = new GamesManager($pdo, $cache, $config);

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
    
    // Handle refresh endpoint: POST /api/games/refresh/{platform}
    if (count($parts) === 4 && $parts[2] === 'refresh' && $method === 'POST') {
        $platform = $parts[3];
        $result = $gamesManager->refreshPlatform($userId, $platform);
        
        if ($result['status'] === 429) {
            http_response_code(429);
        } elseif ($result['status'] === 500) {
            http_response_code(500);
        }
        
        echo json_encode($result);
        exit;
    }

    if ($platform === 'all') {
        // Handle aggregation for all platforms
        if ($method === 'GET') {
            $result = $gamesManager->getAllPlatforms($userId);
            echo json_encode($result);
        } elseif ($method === 'POST') {
            $result = $gamesManager->refreshAllPlatforms($userId);
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

        if ($method === 'GET') {
            $games = $gamesManager->getCachedGames($userId, $platform);
            if ($games === null) {
                // If no cached data, serve empty but indicate need for refresh
                echo json_encode(['status' => 404, 'errorMessage' => 'No cached data. Please use POST /api/games/refresh/' . $platform . ' to fetch fresh data.']);
                exit;
            }
            echo json_encode(['status' => 200, 'games' => $games, 'cached' => true]);
        } else {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed. Use GET /api/games/' . $platform . ' for cached data or POST /api/games/refresh/' . $platform . ' to refresh.']);
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
