<?php
session_start();

require_once __DIR__ . '/../../classes/Cache.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$config = include __DIR__ . '/../../config.php';
if (!$config) {
    http_response_code(500);
    echo json_encode(['error' => 'Config not found']);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

$userId = $_SESSION['user_id'];
$platform = $_POST['platform'] ?? 'steam';

try {
    $pdo = new PDO(
        "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}",
        $config['db']['user'],
        $config['db']['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $cache = new Cache($config['app']['cache_dir'], 86400 * 365);

    // Start transaction for atomic cleanup
    $pdo->beginTransaction();

    try {
        // 1. Destroy cache for the platform
        $cacheKey = "{$userId}_{$platform}";
        $cache->delete($cacheKey);

        // 2. Delete all refresh history from rate_limits table
        $stmt = $pdo->prepare('DELETE FROM rate_limits WHERE user_id = ? AND platform = ?');
        $stmt->execute([$userId, $platform]);

        // 3. Delete all tokens for the user (user_tokens doesn't have platform column)
        $stmt = $pdo->prepare('DELETE FROM user_tokens WHERE user_id = ?');
        $stmt->execute([$userId]);

        // 4. Delete platform connection
        $stmt = $pdo->prepare('DELETE FROM user_accounts WHERE user_id = ? AND ext_system = ?');
        $stmt->execute([$userId, $platform]);

        // 5. If 'reset_all' is specified, delete the user entirely
        if (isset($_POST['reset_all']) && $_POST['reset_all'] === 'true') {
            // Delete all user accounts
            $stmt = $pdo->prepare('DELETE FROM user_accounts WHERE user_id = ?');
            $stmt->execute([$userId]);
            
            // Delete all user tokens
            $stmt = $pdo->prepare('DELETE FROM user_tokens WHERE user_id = ?');
            $stmt->execute([$userId]);
            
            // Delete all rate limits
            $stmt = $pdo->prepare('DELETE FROM rate_limits WHERE user_id = ?');
            $stmt->execute([$userId]);
            
            // Delete the user
            $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            
            // Clear session
            session_destroy();
            
            $message = "Complete reset performed - user deleted";
        } else {
            $message = "Platform {$platform} reset completed";
        }

        $pdo->commit();

        echo json_encode([
            'status' => 200,
            'message' => $message,
            'actions_performed' => [
                'cache_cleared' => true,
                'rate_limits_deleted' => true,
                'tokens_deleted' => true,
                'accounts_deleted' => true,
                'user_deleted' => isset($_POST['reset_all']) && $_POST['reset_all'] === 'true'
            ]
        ]);

    } catch (Exception $e) {
        $pdo->rollback();
        throw $e;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Reset failed: ' . $e->getMessage()]);
}
?>