<?php
declare(strict_types=1);

// itch.io implicit OAuth callback
// Token arrives in URL hash fragment — server never sees it.
// Serve index.html with APP_BASE overridden to the app root so JS resolves
// API paths correctly despite being served from /api/itch/callback.

$config = require __DIR__ . '/../../config.php';
$appUrl = rtrim((string) ($config['app']['url'] ?? ''), '/');
$basePath = rtrim((string) (parse_url($appUrl, PHP_URL_PATH) ?? ''), '/');

$indexPath = __DIR__ . '/../../index.html';

if (!file_exists($indexPath)) {
    http_response_code(500);
    echo 'index.html not found';
    exit;
}

$html = file_get_contents($indexPath);
if ($html === false) {
    http_response_code(500);
    echo 'index.html unreadable';
    exit;
}

// Override APP_BASE to the real app root — window.location.pathname would resolve
// to /api/itch/callback here, giving the wrong base path.
$html = str_replace(
    'window.APP_BASE = window.location.pathname.replace(/\/$/, \'\') || \'\';',
    'window.APP_BASE = ' . json_encode($basePath) . ';',
    $html
);

header('Content-Type: text/html; charset=utf-8');
echo $html;
