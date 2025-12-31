<?php

require_once __DIR__ . '/Encryption.php';

class GamesManager
{
    private PDO $pdo;
    private Cache $cache;
    private array $config;
    private Encryption $encryption;

    public function __construct(PDO $pdo, Cache $cache, array $config)
    {
        $this->pdo = $pdo;
        $this->cache = $cache;
        $this->config = $config;
        $this->encryption = new Encryption($config['app']['encryption_key']);
    }

    /**
     * Get cached games for a specific platform
     */
    public function getCachedGames(string $userId, string $platform): ?array
    {
        $key = "{$userId}_{$platform}";
        return $this->cache->get($key);
    }

    /**
     * Set cached games for a specific platform
     */
    public function setCachedGames(string $userId, string $platform, array $games): void
    {
        $key = "{$userId}_{$platform}";
        $this->cache->set($key, $games, 86400 * 365); // Indefinite cache (1 year)
    }

    /**
     * Clear cached games for a specific platform
     */
    public function clearCachedGames(string $userId, string $platform): void
    {
        $key = "{$userId}_{$platform}";
        $this->cache->delete($key);
    }

    /**
     * Get last refresh timestamp for a specific platform
     */
    public function getLastRefresh(string $userId, string $platform): string
    {
        $key = "{$userId}_{$platform}_timestamp";
        $data = $this->cache->get($key);
        return $data['lastRefresh'] ?? '1970-01-01T00:00:00Z';
    }

    /**
     * Set last refresh timestamp for a specific platform
     */
    public function setLastRefresh(string $userId, string $platform): void
    {
        $key = "{$userId}_{$platform}_timestamp";
        $data = ['lastRefresh' => gmdate('Y-m-d\TH:i:s\Z')];
        $this->cache->set($key, $data, 86400 * 365); // Same TTL as game data
    }

    /**
     * Clear last refresh timestamp for a specific platform
     */
    public function clearLastRefresh(string $userId, string $platform): void
    {
        $key = "{$userId}_{$platform}_timestamp";
        $this->cache->delete($key);
    }

    /**
     * Check if user is rate limited for platform
     */
    public function checkRateLimit(string $userId, string $platform): ?array
    {
        // Clean up old entries (older than 1 hour)
        $cleanupStmt = $this->pdo->prepare('DELETE FROM rate_limits WHERE user_id = ? AND platform = ? AND request_timestamp < DATE_SUB(NOW(), INTERVAL 1 HOUR)');
        $cleanupStmt->execute([$userId, $platform]);
        
        // Get recent requests in the last hour
        $stmt = $this->pdo->prepare('SELECT COUNT(*) as count, MAX(request_timestamp) as last_request FROM rate_limits WHERE user_id = ? AND platform = ? AND request_timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)');
        $stmt->execute([$userId, $platform]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $requestCount = (int)$result['count'];
        $lastRequest = $result['last_request'];
        
        // Define wait times based on request count
        $waitTimes = [
            0 => 0,    // 0 calls: no wait
            1 => 60,   // 1 call: wait 60 seconds
            2 => 120,  // 2 calls: wait 120 seconds  
            3 => 240,  // 3 calls: wait 240 seconds
            4 => 480,  // 4 calls: wait 480 seconds
            5 => 960,  // 5 calls: wait 960 seconds
        ];
        
        // If 6 or more calls, use 20 minutes (1200 seconds)
        $requiredWait = $requestCount >= 6 ? 1200 : ($waitTimes[$requestCount] ?? 0);
        
        if ($requiredWait === 0) {
            return null; // No rate limit
        }
        
        // Check if enough time has passed since last request
        if ($lastRequest) {
            $timeSinceLast = time() - strtotime($lastRequest);
            if ($timeSinceLast >= $requiredWait) {
                return null; // Enough time has passed
            }
            
            $remainingWait = $requiredWait - $timeSinceLast;
            return [
                'status' => 429,
                'errorMessage' => "Please wait {$remainingWait} seconds before refreshing {$platform} games again",
                'retryAfter' => $remainingWait
            ];
        }
        
        return null; // No recent requests, allow
    }

    /**
     * Record a refresh request for rate limiting
     */
    public function recordRefreshRequest(string $userId, string $platform): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO rate_limits (user_id, platform, request_timestamp) VALUES (?, ?, NOW())');
        $stmt->execute([$userId, $platform]);
    }

    /**
     * Fetch games from platform API
     */
    public function fetchFromPlatform(string $platform, string $extId, string $userId = ''): array
    {
        switch ($platform) {
            case 'steam':
                return $this->fetchSteamGames($extId);
            case 'epic':
                return $this->fetchEpicGames($extId, $userId);
            case 'itch':
                return $this->fetchItchGames($extId);
            case 'gog':
                return []; // Placeholder - no API
            case 'humble':
                return []; // Placeholder
            default:
                throw new InvalidArgumentException("Unsupported platform: {$platform}");
        }
    }

    /**
     * Refresh games for a specific platform
     */
    public function refreshPlatform(string $userId, string $platform): array
    {
        // Check rate limiting
        $rateLimitResult = $this->checkRateLimit($userId, $platform);
        if ($rateLimitResult) {
            return $rateLimitResult;
        }
        
        // Verify platform is connected
        $stmt = $this->pdo->prepare('SELECT ext_id FROM user_accounts WHERE user_id = ? AND ext_system = ?');
        $stmt->execute([$userId, $platform]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || empty($row['ext_id'])) {
            return ['status' => 404, 'errorMessage' => 'Platform not connected'];
        }
        
        try {
            $extId = $row['ext_id'];
            $this->clearCachedGames($userId, $platform);
            $games = $this->fetchFromPlatform($platform, $extId, $userId);
            $this->setCachedGames($userId, $platform, $games);
            $this->setLastRefresh($userId, $platform);
            
            // Record this request for rate limiting
            $this->recordRefreshRequest($userId, $platform);
            
            return [
                'status' => 200, 
                'games' => $games, 
                'refreshed' => true,
                'lastRefresh' => $this->getLastRefresh($userId, $platform)
            ];
        } catch (Exception $e) {
            return ['status' => 500, 'errorMessage' => 'Failed to refresh games: ' . $e->getMessage()];
        }
    }

    /**
     * Get all platforms games (cached only)
     */
    public function getAllPlatforms(string $userId): array
    {
        // Get all connected platforms for user
        $stmt = $this->pdo->prepare('SELECT ext_system, ext_id FROM user_accounts WHERE user_id = ?');
        $stmt->execute([$userId]);
        $connectedPlatforms = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $platformMap = [];
        foreach ($connectedPlatforms as $platform) {
            $platformMap[$platform['ext_system']] = $platform['ext_id'];
        }
        
        $supportedPlatforms = ['steam', 'epic', 'itch', 'gog', 'humble'];
        $result = [];
        
        foreach ($supportedPlatforms as $platform) {
            if (isset($platformMap[$platform])) {
                // Platform is connected, only serve cached data
                $games = $this->getCachedGames($userId, $platform);
                
                if ($games === null) {
                    // If no cached data, indicate need for refresh
                    $result[$platform] = ['status' => 404, 'errorMessage' => 'No cached data. Please use POST /api/games/refresh/' . $platform . ' to fetch fresh data.'];
                } else {
                    $result[$platform] = [
                        'status' => 200, 
                        'games' => $games, 
                        'cached' => true,
                        'lastRefresh' => $this->getLastRefresh($userId, $platform)
                    ];
                }
            } else {
                // Platform not connected
                $result[$platform] = ['status' => 404, 'errorMessage' => 'Platform not connected'];
            }
        }
        
        return $result;
    }

    /**
     * Refresh all platforms
     */
    public function refreshAllPlatforms(string $userId): array
    {
        // Get all connected platforms for user
        $stmt = $this->pdo->prepare('SELECT ext_system, ext_id FROM user_accounts WHERE user_id = ?');
        $stmt->execute([$userId]);
        $connectedPlatforms = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $platformMap = [];
        foreach ($connectedPlatforms as $platform) {
            $platformMap[$platform['ext_system']] = $platform['ext_id'];
        }
        
        $supportedPlatforms = ['steam', 'epic', 'itch', 'gog', 'humble'];
        $result = [];
        
        foreach ($supportedPlatforms as $platform) {
            if (isset($platformMap[$platform])) {
                // Check rate limiting for this platform
                $rateLimitResult = $this->checkRateLimit($userId, $platform);
                if ($rateLimitResult) {
                    $result[$platform] = $rateLimitResult;
                    continue;
                }
                
                // Platform is connected, clear cache and fetch fresh data
                try {
                    $games = $this->fetchFromPlatform($platform, $platformMap[$platform], $userId);
                    $this->setCachedGames($userId, $platform, $games);
                    $this->setLastRefresh($userId, $platform);
                    
                    // Record this request for rate limiting
                    $this->recordRefreshRequest($userId, $platform);
                    
                    $result[$platform] = [
                        'status' => 200, 
                        'games' => $games, 
                        'refreshed' => true,
                        'lastRefresh' => $this->getLastRefresh($userId, $platform)
                    ];
                } catch (Exception $e) {
                    $result[$platform] = ['status' => 500, 'errorMessage' => 'Failed to refresh games: ' . $e->getMessage()];
                }
            } else {
                // Platform not connected
                $result[$platform] = ['status' => 404, 'errorMessage' => 'Platform not connected'];
            }
        }
        
        return $result;
    }

    /**
     * Auto-fetch games after successful OAuth connection
     */
    public function autoFetchGames(string $userId, string $platform, string $extId): array
    {
        // Check rate limiting
        $rateLimitResult = $this->checkRateLimit($userId, $platform);
        if ($rateLimitResult) {
            throw new RuntimeException($rateLimitResult['errorMessage']);
        }
        
        // Clear any existing cache and fetch fresh games
        $this->clearCachedGames($userId, $platform);
        $games = $this->fetchFromPlatform($platform, $extId, $userId);
        $this->setCachedGames($userId, $platform, $games);
        $this->setLastRefresh($userId, $platform);
        
        // Record this request for rate limiting
        $this->recordRefreshRequest($userId, $platform);
        
        return $games;
    }

    /**
     * Fetch Steam games from API
     */
    private function fetchSteamGames(string $extId): array
    {
        $url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?' . http_build_query([
            'key' => $this->config['apis']['steam']['key'],
            'steamid' => $extId,
            'include_appinfo' => 1,
            'include_played_free_games' => 1,
            'format' => 'json'
        ]);
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new RuntimeException('Steam API error: ' . $response);
        }
        
        $data = json_decode($response, true);
        if (isset($data['response']['error'])) {
            throw new RuntimeException('Steam error: ' . $data['response']['error']['errordesc']);
        }
        
        return $data['response']['games'] ?? [];
    }

    /**
     * Fetch Epic games from API with token management
     */
    private function fetchEpicGames(string $extId, string $userId): array
    {
        // Get current user ID for token lookup
        // This is a limitation - we need user context for proper token management
        // For now, we'll assume it's passed in or use a session variable
        $userId = $userId ?? $_SESSION['user_id'];
        if (!$userId) {
            throw new RuntimeException('User context required for Epic token management');
        }
        
        // Get valid access token (refresh if needed)
        $tokenData = $this->getValidEpicToken($userId);
        
        // Call Epic Entitlements API instead (should work with web client tokens)
        // Get account ID from token data for API call
        $tokenData = $this->getValidEpicToken($userId);
        $accountId = $tokenData['account_id'] ?? 'unknown-account-id';
        $url = "https://entitlement-public-service-prod08.ol.epicgames.com/entitlement/api/account/{$accountId}/entitlements?start=0&count=1000";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenData['access_token'],
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit',
            'X-Epic-Correlation-ID: UE4-c176f7154c2cda1061cc43ab52598e2b-93AFB486488A22FDF70486BD1D883628-BFCD88F649E997BA203FF69F07CE578C'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
         if ($httpCode !== 200) {
            throw new RuntimeException('Epic Entitlements API error: ' . $response);
        }
        
        $data = json_decode($response, true);
        return $this->formatEpicGames($data);
    }
    
    /**
     * Get valid Epic access token, refresh if needed
     */
    private function getValidEpicToken(string $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT access_token, token_expires_at FROM user_accounts WHERE user_id = ? AND ext_system = ?');
        $stmt->execute([$userId, 'epic']);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Check if token is still valid (with 5-minute buffer)
        if ($result && $result['access_token'] && strtotime($result['token_expires_at']) > time() + 300) {
            // Return the stored valid token (don't fall back to refresh)
            return [
                'access_token' => $this->encryption->decrypt($result['access_token']),
                'expires_at' => $result['token_expires_at']
            ];
        }
        
        // Token expired or invalid, refresh it
        return $this->refreshEpicToken($userId);
    }
    
    /**
     * Refresh Epic access token
     */
    private function refreshEpicToken(string $userId): array
    {
        // Get current refresh token
        $stmt = $this->pdo->prepare('SELECT refresh_token FROM user_accounts WHERE user_id = ? AND ext_system = ?');
        $stmt->execute([$userId, 'epic']);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result || !$result['refresh_token']) {
            throw new RuntimeException('No refresh token available for Epic account. Please reconnect your account.');
        }
        
        $refreshToken = $this->encryption->decrypt($result['refresh_token']);
        
        // Call Epic token refresh endpoint
        $tokenUrl = 'https://api.epicgames.dev/epic/oauth/v2/token';
        $data = http_build_query([
            'grant_type' => 'refresh_token',
            'refresh_token' => $refreshToken
        ]);
        
        $authHeader = 'Basic ' . base64_encode($this->config['apis']['epic']['client_id'] . ':' . $this->config['apis']['epic']['client_secret']);
        
        $ch = curl_init($tokenUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-www-form-urlencoded',
            'Authorization: ' . $authHeader
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new RuntimeException('Epic token refresh failed: ' . $response);
        }
        
        $tokens = json_decode($response, true);
        $newAccessToken = $tokens['access_token'] ?? '';
        $newRefreshToken = $tokens['refresh_token'] ?? '';
        $expiresIn = $tokens['expires_in'] ?? 3600;
        
        if (!$newAccessToken) {
            throw new RuntimeException('Invalid token refresh response from Epic');
        }
        
        // Update database with new tokens
        $encryptedAccessToken = $this->encryption->encrypt($newAccessToken);
        $encryptedRefreshToken = $newRefreshToken ? $this->encryption->encrypt($newRefreshToken) : null;
        $tokenExpiresAt = date('Y-m-d H:i:s', time() + $expiresIn);
        
        $updateStmt = $this->pdo->prepare('
            UPDATE user_accounts 
            SET access_token = ?, refresh_token = ?, token_expires_at = ?
            WHERE user_id = ? AND ext_system = ?
        ');
        $updateStmt->execute([$encryptedAccessToken, $encryptedRefreshToken, $tokenExpiresAt, $userId, 'epic']);
        
        return [
            'access_token' => $newAccessToken,
            'expires_at' => $tokenExpiresAt
        ];
    }
    
    /**
     * Format Epic entitlements response to our game format
     */
    private function formatEpicGames(array $epicData): array
    {
        $games = [];
        
        // Handle Epic Entitlements API response structure
        if (is_array($epicData)) {
            foreach ($epicData as $entitlement) {
                // Extract game info from entitlement
                $namespace = $entitlement['namespace'] ?? '';
                $catalogItemId = $entitlement['catalogItemId'] ?? '';
                $appName = $entitlement['appName'] ?? '';
                
                // Basic game info from entitlement
                $games[] = [
                    'appid' => $catalogItemId ?: $entitlement['id'] ?? 'unknown',
                    'name' => $appName ?: 'Unknown Epic Game',
                    'image' => '/placeholder.jpg', // Entitlements don't include images
                    'playtime' => 0,
                    'platform' => 'epic'
                ];
            }
        } else {
            // Fallback for unexpected response structure
            error_log('Unexpected Epic Entitlements API response structure: ' . json_encode($epicData));
        }
        
        return $games;
    }

    /**
     * Fetch itch.io games from API
     */
    private function fetchItchGames(string $extId): array
    {
        $token = $_SESSION['temp_itch_token'] ?? 'DUMMY_TOKEN';
        $url = 'https://itch.io/api/1/bearer/' . $token . '/my-games';
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new RuntimeException('Itch API error: ' . $response);
        }
        
        $data = json_decode($response, true);
        return $data['games'] ?? [];
    }
}
