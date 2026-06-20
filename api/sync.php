<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, If-Match');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function jsonResponse(int $code, array $body, ?string $etag = null): never
{
    http_response_code($code);
    if ($etag !== null) {
        header("ETag: \"{$etag}\"");
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$config = require __DIR__ . '/../config.php';
$dsn = isset($config['db']['socket'])
    ? "mysql:unix_socket={$config['db']['socket']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}"
    : "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";

try {
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
        PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    error_log("MyLibrary sync.php connection error: " . $e->getMessage());
    jsonResponse(500, ['error' => 'Database connection failed']);
}

$uri    = $_SERVER['REQUEST_URI'] ?? '';
$path   = parse_url($uri, PHP_URL_PATH) ?? $uri;
$prefix = '/api/sync/';

if (!str_starts_with($path, $prefix)) {
    jsonResponse(400, ['error' => 'Invalid request path']);
}

$userId = rtrim(substr($path, strlen($prefix)), '/');

if ($userId === '' || !preg_match('/^[a-zA-Z0-9_\-]+$/', $userId)) {
    jsonResponse(400, ['error' => 'Invalid userId']);
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    match ($method) {
        'GET'  => handleGet($pdo, $userId),
        'HEAD' => handleHead($pdo, $userId),
        'POST' => handlePost($pdo, $userId),
        default => jsonResponse(405, ['error' => 'Method not allowed']),
    };
} catch (PDOException $e) {
    error_log("MyLibrary sync.php query error: " . $e->getMessage());
    jsonResponse(500, ['error' => 'Database error']);
}

function handleGet(PDO $pdo, string $userId): never
{
    $stmt = $pdo->prepare('SELECT `blob`, etag FROM user_blobs WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        jsonResponse(404, ['error' => 'Not found']);
    }

    jsonResponse(200, ['data' => $row['blob']], $row['etag']);
}

function handleHead(PDO $pdo, string $userId): never
{
    $stmt = $pdo->prepare('SELECT etag FROM user_blobs WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        http_response_code(404);
        exit;
    }

    http_response_code(200);
    header("ETag: \"{$row['etag']}\"");
    exit;
}

function handlePost(PDO $pdo, string $userId): never
{
    $rawBody = (string) file_get_contents('php://input');
    if ($rawBody === '') {
        jsonResponse(400, ['error' => 'Empty request body']);
    }

    $body = json_decode($rawBody, true);
    if (!is_array($body) || !array_key_exists('data', $body)) {
        jsonResponse(400, ['error' => 'Missing data field']);
    }

    $blobContent = $body['data'];
    if (!is_string($blobContent) || $blobContent === '') {
        jsonResponse(400, ['error' => 'data field must be a non-empty string']);
    }

    $ifMatch = isset($_SERVER['HTTP_IF_MATCH'])
        ? trim($_SERVER['HTTP_IF_MATCH'], '"')
        : null;

    if ($ifMatch !== null) {
        $stmt = $pdo->prepare('SELECT etag FROM user_blobs WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $currentEtag = ($row !== false) ? $row['etag'] : null;

        if ($currentEtag !== $ifMatch) {
            jsonResponse(412, ['error' => 'ETag mismatch']);
        }
    }

    $etag = md5($blobContent);

    $stmt = $pdo->prepare(
        'INSERT INTO users (id) VALUES (?) ON DUPLICATE KEY UPDATE last_seen = NOW()'
    );
    $stmt->execute([$userId]);

    $stmt = $pdo->prepare(
        'INSERT INTO user_blobs (user_id, `blob`, etag) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `blob` = VALUES(`blob`), etag = VALUES(etag), updated_at = NOW()'
    );
    $stmt->execute([$userId, $blobContent, $etag]);

    jsonResponse(200, ['success' => true], $etag);
}
