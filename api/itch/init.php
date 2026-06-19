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

$params = [
    'client_id' => (string) ($config['apis']['itch']['client_id'] ?? ''),
    'scope' => 'profile:owned',
    'response_type' => 'token',
    'redirect_uri' => (string) ($config['apis']['itch']['redirect_uri'] ?? ($appUrl . '/api/itch/callback')),
];

$redirectUrl = 'https://itch.io/user/oauth?' . http_build_query($params);

header("Location: {$redirectUrl}");
http_response_code(302);
exit;
