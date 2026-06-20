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

$config = require __DIR__ . '/../../config.php';

$steamId = $_GET['steamid'] ?? '';

if ($steamId === '') {
    error_log('MyLibrary games.php: missing steamid parameter');
    jsonError(400, 'Missing required parameter: steamid');
}

if (!preg_match('/^\d{17}$/', $steamId)) {
    error_log("MyLibrary games.php: invalid steamid format: {$steamId}");
    jsonError(400, 'Invalid steamid format: must be a 17-digit integer');
}

$apiKey = $config['apis']['steam']['key'];

$queryParams = http_build_query([
    'key'                       => $apiKey,
    'steamid'                   => $steamId,
    'include_appinfo'           => 1,
    'include_played_free_games' => 1,
    'format'                    => 'json',
]);

$url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?' . $queryParams;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError !== '' || $response === false) {
    error_log("MyLibrary games.php: cURL error for steamid {$steamId}: {$curlError}");
    jsonError(502, 'Failed to reach Steam API');
}

if ($httpCode !== 200) {
    error_log("MyLibrary games.php: Steam API returned HTTP {$httpCode} for steamid {$steamId}");
    jsonError(502, "Steam API error: HTTP {$httpCode}");
}

$data = json_decode((string) $response, true);

if (!is_array($data) || !isset($data['response'])) {
    error_log("MyLibrary games.php: unexpected Steam API response shape for steamid {$steamId}");
    jsonError(502, 'Unexpected response from Steam API');
}

$rawGames = $data['response']['games'] ?? null;

if (empty($rawGames)) {
    error_log("MyLibrary games.php: no games returned for steamid {$steamId} (profile may be private)");
    jsonError(404, 'No games found (profile may be private)');
}

$games = array_map(function (array $game): array {
    return [
        'appid'            => $game['appid'],
        'name'             => $game['name'] ?? '',
        'img_icon_url'     => $game['img_icon_url'] ?? '',
        'playtime_forever' => $game['playtime_forever'] ?? 0,
    ];
}, $rawGames);

http_response_code(200);
echo json_encode(['games' => $games], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
