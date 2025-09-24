<?php
// Centralized config for DB/API keys, outside webroot for security
// chmod 600; never commit real keys - use .env or IONOS cPanel for production

return [
    'db' => [
        'host' => 'localhost',  // Or IONOS DB host like db123.ionos.com
        'dbname' => 'flare_db',
        'user' => 'app_user',   // From IONOS cPanel
        'pass' => 'apppass',    // Secure this
        'charset' => 'utf8mb4'
    ],
    'app' => [
        'url' => 'http://localhost:8080',  // Local dev; change to https://yourdomain.com for prod
        'cache_dir' => __DIR__ . '/../cache/',  // Absolute path outside webroot, e.g., /home/user/cache/
    ],
    'email' => [
        'smtp_host' => 'smtp.ionos.com',  // Or external like smtp.gmail.com
        'smtp_port' => 587,
        'smtp_user' => 'no-reply@yourdomain.com',
        'smtp_pass' => 'your_smtp_pass',  // Secure
        'from_email' => 'no-reply@yourdomain.com',
        'from_name' => 'FLARE Game Library'
    ],
    'apis' => [
        'steam' => [
            'key' => 'YOUR_STEAM_WEB_API_KEY',  // From https://steamcommunity.com/dev/apikey
        ],
        'epic' => [
            'client_id' => 'YOUR_EPIC_CLIENT_ID',  // From Epic Dev Portal
            'client_secret' => 'YOUR_EPIC_CLIENT_SECRET',
            'redirect_uri' => 'http://localhost:8080/api/connect/epic/complete',  // Match portal
        ],
        'gog' => [
            'private_key' => 'YOUR_GOG_PRIVATE_KEY',  // If using SDK; otherwise skip
        ],
        'itch' => [
            'client_id' => 'YOUR_ITCH_CLIENT_ID',  // From itch.io OAuth apps
            'redirect_uri' => 'http://localhost:8080/api/connect/itch/complete',
        ],
        'humble' => [
            'api_key' => 'YOUR_HUMBLE_PARTNER_KEY',  // If approved; otherwise fallback
        ]
    ]
];