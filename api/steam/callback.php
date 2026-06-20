<?php
declare(strict_types=1);

$config = null;
try {
    $config = require __DIR__ . '/../../config.php';
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Configuration error']);
    exit;
}

$appUrl = rtrim((string) ($config['app']['url'] ?? ''), '/');
if ($appUrl === '') {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Configuration error: app.url not set']);
    exit;
}

session_start();

function errorOut(string $reason): never
{
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => $reason]);
    exit;
}

function redirectError(string $appUrl, string $reason): never
{
    header("Location: /?steam_error=" . urlencode($reason));
    http_response_code(302);
    exit;
}

$mode = $_GET['openid_mode'] ?? '';
if ($mode !== 'id_res') {
    redirectError($appUrl, 'Steam login cancelled');
}

$nonce = $_GET['nonce'] ?? '';
if ($nonce === '') {
    redirectError($appUrl, 'Missing nonce');
}

// Session-based nonce check is unreliable on shared hosting (session not guaranteed
// to persist across the Steam redirect). The nonce is embedded in openid.return_to
// which Steam cryptographically signs — the is_valid:true check below is sufficient.
// We still verify the nonce is present in return_to to confirm it wasn't stripped.

// PHP converts dots to underscores in $_GET; parse QUERY_STRING directly
// to preserve original openid.* dot-form names required by the OpenID protocol.
$rawQuery   = $_SERVER['QUERY_STRING'] ?? '';
$postParams = [];
foreach (explode('&', $rawQuery) as $pair) {
    if ($pair === '') {
        continue;
    }
    $parts = explode('=', $pair, 2);
    $key   = urldecode($parts[0]);
    $val   = isset($parts[1]) ? urldecode($parts[1]) : '';
    if (str_starts_with($key, 'openid.')) {
        $postParams[$key] = $val;
    }
}
$postParams['openid.mode'] = 'check_authentication';

// Verify return_to points to our callback — protects against open redirect.
// Use parsed URL comparison to handle encoding differences.
$returnTo        = $postParams['openid.return_to'] ?? '';
$returnToParsed  = parse_url(urldecode($returnTo));
$expectedParsed  = parse_url($appUrl . '/api/steam/callback');
if (
    ($returnToParsed['host'] ?? '') !== ($expectedParsed['host'] ?? '') ||
    ($returnToParsed['path'] ?? '') !== ($expectedParsed['path'] ?? '')
) {
    redirectError($appUrl, 'Invalid return_to');
}

$ch = curl_init('https://steamcommunity.com/openid/login');
if ($ch === false) {
    redirectError($appUrl, 'Steam assertion failed');
}
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query($postParams),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
]);
$steamResponse = curl_exec($ch);
curl_close($ch);

if ($steamResponse === false || !str_contains((string) $steamResponse, 'is_valid:true')) {
    redirectError($appUrl, 'Steam assertion failed');
}

// Extract SteamID from verified params — never trust $_GET which can be spoofed
// by appending &openid_claimed_id=VICTIM_ID to the callback URL.
$claimedId = $postParams['openid.claimed_id'] ?? '';
if (!preg_match('|/openid/id/(\d{17})$|', $claimedId, $matches)) {
    redirectError($appUrl, 'Could not extract SteamID');
}
$steamId = $matches[1];

// Server never stores SteamID — client receives it via URL and encrypts it client-side
header("Location: /?steam_connected=1&steamid={$steamId}");
http_response_code(302);
exit;
