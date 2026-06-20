<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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

$rawBody = (string) file_get_contents('php://input');
if ($rawBody === '') {
    jsonError(400, 'Empty request body');
}

$body = json_decode($rawBody, true);
if (!is_array($body)) {
    jsonError(400, 'Invalid JSON body');
}

$code = $body['code'] ?? '';
if (!is_string($code) || $code === '') {
    jsonError(400, 'Missing required field: code');
}

$clientId     = $config['apis']['epic']['client_id'];
$clientSecret = $config['apis']['epic']['client_secret'];
$userAgent    = 'EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live';

$tokenUrl   = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
$basicAuth  = base64_encode($clientId . ':' . $clientSecret);
$postFields = http_build_query([
    'grant_type' => 'authorization_code',
    'code'       => $code,
    'token_type' => 'eg1',
]);

$ch = curl_init($tokenUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $postFields,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Basic ' . $basicAuth,
        'Content-Type: application/x-www-form-urlencoded',
        'User-Agent: ' . $userAgent,
        'Accept: application/json',
    ],
]);
$tokenResponse  = curl_exec($ch);
$tokenHttpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$tokenCurlError = curl_error($ch);
curl_close($ch);

if ($tokenCurlError !== '' || $tokenResponse === false) {
    error_log("MyLibrary exchange.php: cURL error during token exchange: {$tokenCurlError}");
    jsonError(502, 'Failed to reach Epic OAuth endpoint');
}

$tokenData = json_decode((string) $tokenResponse, true);

if ($tokenHttpCode !== 200) {
    $epicError = is_array($tokenData)
        ? ($tokenData['errorMessage'] ?? $tokenData['error_description'] ?? $tokenData['error'] ?? "HTTP {$tokenHttpCode}")
        : "HTTP {$tokenHttpCode}";
    error_log("MyLibrary exchange.php: Epic OAuth returned HTTP {$tokenHttpCode}: {$epicError}");
    $forwardCode = ($tokenHttpCode >= 400 && $tokenHttpCode < 500) ? $tokenHttpCode : 502;
    jsonError($forwardCode, "Epic OAuth error: {$epicError}");
}

if (!is_array($tokenData) || !isset($tokenData['access_token'])) {
    error_log('MyLibrary exchange.php: unexpected token response shape from Epic');
    jsonError(502, 'Unexpected response from Epic OAuth endpoint');
}

$accessToken  = $tokenData['access_token'];
$refreshToken = $tokenData['refresh_token'] ?? '';
$accountId    = $tokenData['account_id'] ?? '';
$expiresIn    = $tokenData['expires_in'] ?? 7200;

// library-service has no CORS headers — must be fetched server-side
$games  = [];
$cursor = null;

do {
    $libraryUrl = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true&platform=Windows';
    if ($cursor !== null) {
        $libraryUrl .= '&cursor=' . urlencode((string) $cursor);
    }

    $ch = curl_init($libraryUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Authorization: bearer ' . $accessToken,
            'User-Agent: ' . $userAgent,
            'Accept: application/json',
        ],
    ]);
    $libResponse  = curl_exec($ch);
    $libHttpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $libCurlError = curl_error($ch);
    curl_close($ch);

    if ($libCurlError !== '' || $libResponse === false) {
        error_log("MyLibrary exchange.php: cURL error fetching Epic library: {$libCurlError}");
        jsonError(502, 'Failed to reach Epic library service');
    }

    $libData = json_decode((string) $libResponse, true);

    if ($libHttpCode !== 200) {
        $libError = is_array($libData)
            ? ($libData['errorMessage'] ?? $libData['error'] ?? "HTTP {$libHttpCode}")
            : "HTTP {$libHttpCode}";
        error_log("MyLibrary exchange.php: Epic library service returned HTTP {$libHttpCode}: {$libError}");
        jsonError(502, "Epic library error: {$libError}");
    }

    if (!is_array($libData) || !isset($libData['records'])) {
        error_log('MyLibrary exchange.php: unexpected library response shape from Epic');
        jsonError(502, 'Unexpected response from Epic library service');
    }

    foreach ($libData['records'] as $record) {
        if (($record['recordType'] ?? '') !== 'APPLICATION') {
            continue;
        }
        $games[] = [
            'appid'    => $record['catalogItemId'] ?? $record['appName'] ?? 'unknown',
            'name'     => $record['sandboxName'] ?? $record['appName'] ?? 'Unknown Epic Game',
            'platform' => 'epic',
        ];
    }

    $cursor = $libData['responseMetadata']['nextCursor'] ?? null;
} while ($cursor !== null);

http_response_code(200);
echo json_encode([
    'access_token'  => $accessToken,
    'refresh_token' => $refreshToken,
    'account_id'    => $accountId,
    'expires_in'    => $expiresIn,
    'games'         => $games,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
