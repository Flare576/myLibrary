<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

function jsonError(int $code, string $message): never
{
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$config = require __DIR__ . '/../config.php';

$dsn = isset($config['db']['socket'])
    ? "mysql:unix_socket={$config['db']['socket']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}"
    : "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";

try {
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    error_log('MyLibrary bundles.php: DB connection error: ' . $e->getMessage());
    jsonError(500, 'Database connection failed');
}

try {
    $stmt = $pdo->query('SELECT slug, data, expires_at FROM bundle_cache WHERE expires_at > NOW()');
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    error_log('MyLibrary bundles.php: cache query error: ' . $e->getMessage());
    $rows = [];
}

if (!empty($rows)) {
    header('X-Cache: HIT');
    $bundles = array_map(fn(array $row): array => json_decode($row['data'], true), $rows);
    http_response_code(200);
    echo json_encode($bundles, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$humbleUrl = 'https://www.humblebundle.com/games';
$ch = curl_init($humbleUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER     => [
        'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.5',
    ],
]);
$html     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr !== '' || $html === false) {
    error_log("MyLibrary bundles.php: cURL error fetching Humble: {$curlErr}");
    jsonError(502, 'Failed to reach Humble Bundle');
}

if ($httpCode !== 200) {
    error_log("MyLibrary bundles.php: Humble returned HTTP {$httpCode}");
    jsonError(502, "Humble Bundle error: HTTP {$httpCode}");
}

// Parse <script id="landingPage-json-data"> from the /games listing page
if (!preg_match('/<script[^>]+id=["\']landingPage-json-data["\'][^>]*>(.*?)<\/script>/s', (string) $html, $matches)) {
    error_log('MyLibrary bundles.php: landingPage-json-data script tag not found in Humble response');
    jsonError(502, 'Humble Bundle page structure changed: landingPage-json-data not found');
}

$pageData = json_decode($matches[1], true);
if (!is_array($pageData)) {
    error_log('MyLibrary bundles.php: failed to JSON-decode landingPage-json-data content');
    jsonError(502, 'Failed to parse Humble Bundle page data');
}

// Path: data.data.games.mosaic[0].products
$mosaic   = $pageData['data']['games']['mosaic'] ?? [];
$products = $mosaic[0]['products'] ?? [];
$bundles = [];
foreach ($products as $product) {
    if (!str_starts_with($product['product_url'] ?? '', '/games/')) {
        continue;
    }

    $endDate   = $product['end_date|datetime']   ?? '';
    $startDate = $product['start_date|datetime'] ?? '';
    $slug      = $product['machine_name']        ?? '';

    if ($slug === '' || $endDate === '') {
        // Can't cache without a primary key or TTL — skip
        continue;
    }

    $bundles[] = [
        'name'       => $product['tile_name']    ?? '',
        'slug'       => $slug,
        'url'        => 'https://www.humblebundle.com' . ($product['product_url'] ?? ''),
        'end_date'   => $endDate,
        'start_date' => $startDate,
        'category'   => $product['category']     ?? '',
        'highlights' => $product['highlights']   ?? [],
    ];
}

if (!empty($bundles)) {
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO bundle_cache (slug, data, expires_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at), cached_at = NOW()'
        );

        foreach ($bundles as $bundle) {
            // ISO8601 "2026-07-09T18:00:00" → MySQL DATETIME "2026-07-09 18:00:00"
            $expiresAt = str_replace('T', ' ', $bundle['end_date']);
            $stmt->execute([$bundle['slug'], json_encode($bundle, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $expiresAt]);
        }

        $pdo->exec('DELETE FROM bundle_cache WHERE expires_at <= NOW()');
    } catch (PDOException $e) {
        error_log('MyLibrary bundles.php: cache write error: ' . $e->getMessage());
        // Non-fatal: still return the fresh scraped data
    }
}

header('X-Cache: MISS');
http_response_code(200);
echo json_encode($bundles, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
