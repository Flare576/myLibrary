<?php
// Forward to the main connect.php handler
$_SERVER['REQUEST_URI'] = '/api/connect/steam/complete';
require_once __DIR__ . '/../../connect.php';