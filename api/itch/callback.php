<?php
declare(strict_types=1);

// itch.io implicit OAuth callback
// Token arrives in URL hash fragment — server never sees it.
// Serve index.html with <base href="/"> injected so relative paths
// (./js/auth.js, css/styles.css, etc.) resolve correctly from /api/itch/.

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

// Inject <base href="/"> immediately after <head> so all relative URLs resolve from root.
$html = str_replace('<head>', '<head><base href="/">', $html);

header('Content-Type: text/html; charset=utf-8');
echo $html;
