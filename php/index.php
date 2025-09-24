<?php
// Simple router for FLARE API and static frontend
// Handles /api/* by including api files, else serves index.html

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Parse URI
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = trim($uri, '/');

if (strpos($path, 'api/') === 0) {
    // API route
    header('Content-Type: application/json');
    $apiPath = substr($path, 4);  // Remove 'api/'
    $fileName = basename($apiPath) . '.php';
    $includePath = __DIR__ . '/api/' . $fileName;
    
    if (file_exists($includePath)) {
        // Pass URI for internal routing in api files
        $_SERVER['FLARE_API_PATH'] = $apiPath;
        include $includePath;
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'API endpoint not found']);
    }
} else {
    // Serve frontend
    header('Content-Type: text/html');
    readfile(__DIR__ . '/../index.html');
}
