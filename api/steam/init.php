<?php
declare(strict_types=1);

header('Content-Type: text/html');

$config = null;
try {
    $config = require __DIR__ . '/../../config.php';
} catch (Throwable $e) {
    http_response_code(500);
    echo 'Configuration error: unable to load config.';
    exit;
}

$appUrl = rtrim((string) ($config['app']['url'] ?? ''), '/');
if ($appUrl === '') {
    http_response_code(500);
    echo 'Configuration error: app.url is not set.';
    exit;
}

session_start();

$nonce = time() . ':' . bin2hex(random_bytes(8));
$_SESSION['steam_nonce'] = $nonce;

$params = [
    'openid.ns'         => 'http://specs.openid.net/auth/2.0',
    'openid.mode'       => 'checkid_setup',
    'openid.return_to'  => $appUrl . '/api/steam/callback?nonce=' . urlencode($nonce),
    'openid.realm'      => $appUrl . '/',
    'openid.identity'   => 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id' => 'http://specs.openid.net/auth/2.0/identifier_select',
];

$redirectUrl = 'https://steamcommunity.com/openid/login?' . http_build_query($params);

header("Location: {$redirectUrl}");
http_response_code(302);
exit;
