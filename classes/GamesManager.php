<?php

class GamesManager
{
    private PDO $pdo;
    private Cache $cache;
    private array $config;
    private string $cacheDir;

    public function __construct(PDO $pdo, Cache $cache, array $config)
    {
        $this->pdo = $pdo;
        $this->cache = $cache;
        $this->config = $config;
        $this->cacheDir = $config['app']['cache_dir'];
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
    public function fetchFromPlatform(string $platform, string $extId): array
    {
        switch ($platform) {
            case 'steam':
                return $this->fetchSteamGames($extId);
            case 'epic':
                return $this->fetchEpicGames($extId);
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
            $games = $this->fetchFromPlatform($platform, $extId);
            $this->setCachedGames($userId, $platform, $games);
            
            // Record this request for rate limiting
            $this->recordRefreshRequest($userId, $platform);
            
            return ['status' => 200, 'games' => $games, 'refreshed' => true];
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
                    $result[$platform] = ['status' => 200, 'games' => $games, 'cached' => true];
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
                    $games = $this->fetchFromPlatform($platform, $platformMap[$platform]);
                    $this->setCachedGames($userId, $platform, $games);
                    
                    // Record this request for rate limiting
                    $this->recordRefreshRequest($userId, $platform);
                    
                    $result[$platform] = ['status' => 200, 'games' => $games, 'refreshed' => true];
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
        $games = $this->fetchFromPlatform($platform, $extId);
        $this->setCachedGames($userId, $platform, $games);
        
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
     * Fetch Epic games from API
     */
    private function fetchEpicGames(string $extId): array
    {
        // Get access token from temporary session storage or fallback
        $accessToken = $_SESSION['temp_epic_token'] ?? 'DUMMY_TOKEN';
        $url = "https://api.epicgames.com/account/api/epic/v1/account/{$extId}/products?entitlementType=product";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $accessToken,
            'Accept: application/json'
        ]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new RuntimeException('Epic API error: ' . $response);
        }
        
        $data = json_decode($response, true);
        $games = [];
        foreach ($data['data'] ?? [] as $item) {
            if ($item['status'] === 'FULFILLED') {
                $games[] = ['id' => $item['catalogItemId'], 'platform' => 'epic'];
            }
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