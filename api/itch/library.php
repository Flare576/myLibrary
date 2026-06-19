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

$rawBody = (string) file_get_contents('php://input');
if ($rawBody === '') {
    jsonError(400, 'Empty request body');
}

$body = json_decode($rawBody, true);
if (!is_array($body)) {
    jsonError(400, 'Invalid JSON body');
}

$token = $body['token'] ?? '';
if (!is_string($token) || $token === '') {
    jsonError(400, 'Missing required field: token');
}

$games = [];
$page  = 1;

do {
    $url = 'https://api.itch.io/profile/owned-keys?page=' . $page;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
    ]);
    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError !== '' || $response === false) {
        error_log("MyLibrary library.php: cURL error fetching itch.io library: {$curlError}");
        jsonError(502, 'Failed to reach itch.io API');
    }

    $data = json_decode((string) $response, true);

    if ($httpCode !== 200) {
        $itchError = is_array($data)
            ? ($data['errors'][0] ?? $data['error'] ?? "HTTP {$httpCode}")
            : "HTTP {$httpCode}";
        error_log("MyLibrary library.php: itch.io API returned HTTP {$httpCode}: {$itchError}");
        $forwardCode = ($httpCode >= 400 && $httpCode < 500) ? $httpCode : 502;
        jsonError($forwardCode, "itch.io API error: {$itchError}");
    }

    if (!is_array($data)) {
        error_log('MyLibrary library.php: unexpected response shape from itch.io API');
        jsonError(502, 'Unexpected response from itch.io API');
    }

    $ownedKeys = $data['owned_keys'] ?? [];

    if (empty($ownedKeys)) {
        break;
    }

    foreach ($ownedKeys as $entry) {
        $game = $entry['game'] ?? null;
        if (!$game || !isset($game['id'], $game['title'])) {
            continue;
        }
        $games[] = [
            'appid'    => $game['id'],
            'name'     => $game['title'],
            'platform' => 'itch',
        ];
    }

    $page++;
} while (true);

http_response_code(200);
echo json_encode(['games' => $games], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
