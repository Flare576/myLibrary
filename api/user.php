<?php
// Start session first before any output
session_start();

// Enable error reporting but don't display errors (log them instead)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$config = include __DIR__ . '/../config.php';

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

    $method = $_SERVER['REQUEST_METHOD'];
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    
    // Remove subdirectory prefix only when running under a subdir (e.g. production /myLibrary/)
    if (!str_starts_with($path, '/api/')) {
        $path = preg_replace('#^/[^/]+/#', '/', $path);
    }

    // Check if user is authenticated
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $userId = $_SESSION['user_id'];

    if ($method === 'GET' && $path === '/api/user/platforms') {
        // Get connected platforms for the user
        $stmt = $pdo->prepare("
            SELECT ext_system as platform, ext_id, created_at 
            FROM user_accounts 
            WHERE user_id = ? AND ext_id IS NOT NULL
            ORDER BY created_at DESC
        ");
        $stmt->execute([$userId]);
        $platforms = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Return array of platform names
        $platformNames = array_map(function($row) {
            return $row['platform'];
        }, $platforms);
        
        echo json_encode($platformNames);
    } elseif ($method === 'GET' && $path === '/api/user/profile') {
        // Get user profile information
        $stmt = $pdo->prepare("
            SELECT id, email, nickname, profile_info, created_at 
            FROM users 
            WHERE id = ?
        ");
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit;
        }
        
        echo json_encode($user);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint not found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}