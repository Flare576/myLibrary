<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

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

if (file_exists(__DIR__ . $path) && is_file(__DIR__ . $path)) {
    return false;
}

require __DIR__ . '/index.html';
