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

$slug = $_SERVER['BUNDLE_SLUG'] ?? '';
if ($slug === '') {
    jsonError(400, 'Missing bundle slug');
}

$config = require __DIR__ . '/../../config.php';

$dsn = isset($config['db']['socket'])
    ? "mysql:unix_socket={$config['db']['socket']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}"
    : "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";

try {
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    error_log('MyLibrary detail.php: DB connection error: ' . $e->getMessage());
    jsonError(500, 'Database connection failed');
}

try {
    $stmt = $pdo->prepare('SELECT data, detail, expires_at FROM bundle_cache WHERE slug = ?');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
} catch (PDOException $e) {
    error_log('MyLibrary detail.php: cache query error: ' . $e->getMessage());
    jsonError(500, 'Database query failed');
}

if ($row === false) {
    jsonError(404, 'Bundle not found');
}

if ($row['detail'] !== null && strtotime($row['expires_at']) > time()) {
    header('X-Cache: HIT');
    http_response_code(200);
    echo $row['detail'];
    exit;
}

$listingData = json_decode($row['data'], true);
$bundleUrl   = $listingData['url'] ?? '';
if ($bundleUrl === '') {
    error_log("MyLibrary detail.php: no URL in bundle_cache.data for slug={$slug}");
    jsonError(502, 'Bundle listing data has no URL');
}

$ch = curl_init($bundleUrl);
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
    error_log("MyLibrary detail.php: cURL error fetching {$bundleUrl}: {$curlErr}");
    jsonError(502, 'Failed to reach Humble Bundle');
}

if ($httpCode !== 200) {
    error_log("MyLibrary detail.php: Humble returned HTTP {$httpCode} for {$bundleUrl}");
    jsonError(502, "Humble Bundle error: HTTP {$httpCode}");
}

preg_match_all('/<script[^>]+type=["\']application\/json["\'][^>]*>(.*?)<\/script>/s', (string) $html, $scriptMatches);

$bundleData = null;
foreach ($scriptMatches[1] as $scriptContent) {
    $decoded = json_decode($scriptContent, true);
    if (is_array($decoded) && isset($decoded['bundleData'])) {
        $bundleData = $decoded['bundleData'];
        break;
    }
}

if ($bundleData === null) {
    error_log("MyLibrary detail.php: bundleData not found in any script tag for {$bundleUrl}");
    jsonError(502, 'Humble Bundle page structure changed: bundleData not found');
}

$tierOrder       = $bundleData['tier_order']        ?? [];
$tierDisplayData = $bundleData['tier_display_data'] ?? [];
$tierItemData    = $bundleData['tier_item_data']    ?? [];

$ascendingTiers = array_reverse($tierOrder);

$seen  = [];
$tiers = [];

foreach ($ascendingTiers as $tierId) {
    $display      = $tierDisplayData[$tierId] ?? [];
    $priceLabel   = $display['header'] ?? '';
    $machineNames = $display['tier_item_machine_names'] ?? [];

    $items = [];
    foreach ($machineNames as $machineName) {
        if (in_array($machineName, $seen, true)) {
            continue;
        }

        $itemData        = $tierItemData[$machineName] ?? [];
        $contentType     = $itemData['item_content_type'] ?? null;

        if ($contentType !== 'game') {
            continue;
        }

        $seen[] = $machineName;

        $msrpMoney = $itemData['msrp_price|money'] ?? [];
        $msrp      = isset($msrpMoney['amount']) ? (float) $msrpMoney['amount'] : 0.0;

        $items[] = [
            'human_name' => $itemData['human_name'] ?? $machineName,
            'msrp'       => $msrp,
        ];
    }

    $tiers[] = [
        'price_label' => $priceLabel,
        'items'       => $items,
    ];
}

$result     = ['slug' => $slug, 'tiers' => $tiers];
$resultJson = json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

try {
    $update = $pdo->prepare('UPDATE bundle_cache SET detail = ? WHERE slug = ?');
    $update->execute([$resultJson, $slug]);
} catch (PDOException $e) {
    error_log('MyLibrary detail.php: detail cache write error: ' . $e->getMessage());
}

header('X-Cache: MISS');
http_response_code(200);
echo $resultJson;
