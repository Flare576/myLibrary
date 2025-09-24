<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$config = include __DIR__ . '/../config.php';

try {
    $pdo = new PDO(
        "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}",
        $config['db']['user'],
        $config['db']['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $auth = new App\Auth\PasswordlessAuth($pdo, $config['app']['url']);

    $input = json_decode(file_get_contents('php://input'), true);
    $method = $_SERVER['REQUEST_METHOD'];
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

    if ($method === 'POST' && $path === '/api/auth/init') {
        $email = $input['email'] ?? '';
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid email');
        }
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $userId = $auth->init($email, $ip, $ua);
        echo json_encode(['success' => true, 'message' => 'Token sent', 'user_id' => $userId]);
    } elseif ($method === 'POST' && $path === '/api/auth/validate') {
        $token = $input['token'] ?? '';
        if (empty($token)) {
            throw new InvalidArgumentException('Token required');
        }
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $userData = $auth->validate($token, $ip, $ua);
        session_start();
        $_SESSION['user_id'] = $userData['user_id'];
        echo json_encode(['success' => true, 'user' => $userData]);
    } elseif ($method === 'GET' && $path === '/api/auth/poll') {
        $sessionId = $_GET['sessionId'] ?? session_id();
        $status = $auth->poll($sessionId);
        echo json_encode($status);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint not found']);
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
}
