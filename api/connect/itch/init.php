<?php
// Forward to the main connect.php handler
$_SERVER['REQUEST_URI'] = '/api/connect/itch/init';
require_once __DIR__ . '/../connect.php';