<?php
// Dev router for PHP built-in server
// Maps clean URLs to the API files that handle routing internally

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Serve static files directly
if ($uri !== '/' && file_exists(__DIR__ . $uri) && !is_dir(__DIR__ . $uri)) {
    return false;
}

// Route API calls to the appropriate handler
if (preg_match('#^/api/auth#', $uri)) {
    require __DIR__ . '/api/auth.php';
} elseif (preg_match('#^/api/connect#', $uri)) {
    require __DIR__ . '/api/connect.php';
} elseif (preg_match('#^/api/games#', $uri)) {
    require __DIR__ . '/api/games.php';
} elseif (preg_match('#^/api/user#', $uri)) {
    require __DIR__ . '/api/user.php';
} elseif (preg_match('#^/api/debug#', $uri)) {
    require __DIR__ . '/api/debug/reset.php';
} else {
    // Serve index.html for everything else
    require __DIR__ . '/index.html';
}
