<?php

$config  = require __DIR__ . '/config.php';
$appUrl  = rtrim((string) ($config['app']['url'] ?? ''), '/');
$basePath = parse_url($appUrl, PHP_URL_PATH) ?? '';
$basePath = rtrim($basePath, '/');

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip subdirectory prefix so routes match regardless of install location
if ($basePath !== '' && str_starts_with($path, $basePath)) {
    $path = substr($path, strlen($basePath));
}
if ($path === '' || $path[0] !== '/') {
    $path = '/' . $path;
}

if (str_starts_with($path, '/api/sync/')) {
    require __DIR__ . '/api/sync.php';
    exit;
}

if (str_starts_with($path, '/api/steam/init')) {
    require __DIR__ . '/api/steam/init.php';
    exit;
}

if (str_starts_with($path, '/api/steam/callback')) {
    require __DIR__ . '/api/steam/callback.php';
    exit;
}

if (str_starts_with($path, '/api/steam/games')) {
    require __DIR__ . '/api/steam/games.php';
    exit;
}

if (str_starts_with($path, '/api/epic/exchange')) {
    require __DIR__ . '/api/epic/exchange.php';
    exit;
}

if (str_starts_with($path, '/api/itch/init')) {
    require __DIR__ . '/api/itch/init.php';
    exit;
}

if (str_starts_with($path, '/api/itch/callback')) {
    require __DIR__ . '/api/itch/callback.php';
    exit;
}

if (str_starts_with($path, '/api/itch/library')) {
    require __DIR__ . '/api/itch/library.php';
    exit;
}

if (preg_match('#^/api/bundles/([^/]+)/detail$#', $path, $m)) {
    $_SERVER['BUNDLE_SLUG'] = $m[1];
    require __DIR__ . '/api/bundles/detail.php';
    exit;
}

if (str_starts_with($path, '/api/bundles')) {
    require __DIR__ . '/api/bundles.php';
    exit;
}

if (file_exists(__DIR__ . $path) && is_file(__DIR__ . $path)) {
    return false;
}

require __DIR__ . '/index.html';
