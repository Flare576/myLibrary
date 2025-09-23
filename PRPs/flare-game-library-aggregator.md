---
name: "FLARE Game Library Aggregator - Base PRP"
description: |
  Comprehensive PRP for building a unified game library search website supporting Steam, Epic, GOG, itch.io, and Humble Bundle platforms with passwordless authentication, file-based caching, and vanilla JS frontend.

---

## Goal

**Feature Goal**: Develop a web application enabling users to authenticate via passwordless email token, connect multiple gaming platforms, fetch and aggregate their owned game libraries with 5-minute file-based caching, and perform unified searches across all connected libraries in a responsive interface optimized for Steam Deck.

**Deliverable**: A fully functional PHP 8.3 backend with MySQL database, vanilla JavaScript/CSS/HTML frontend, API integrations for supported platforms, and Playwright tests, deployable to IONOS shared hosting without Node.js dependencies.

**Success Definition**: A user can complete email verification, connect at least one platform (e.g., Steam), view a searchable grid of their games from connected libraries, with data refreshing from cache or API as needed, and all manual/automated tests passing without errors or security vulnerabilities.

## User Persona (if applicable)

**Target User**: Multi-platform PC gamer, aged 18-35, using Steam Deck as primary device, owning games across Steam, Epic, GOG, itch.io, and Humble Bundle, frustrated by launcher-switching for searches.

**Use Case**: Quickly determine game ownership and playtime across libraries without launching individual apps, especially on handheld devices like Steam Deck.

**User Journey**: 
1. Visit site, enter email for token.
2. Click verification link in email (or paste token).
3. After validation, see dashboard with "Connect Platform" cards.
4. Click "Connect Steam" → OAuth redirect → callback success.
5. View aggregated game grid; search "Elden Ring" → highlights across platforms.
6. Filter by platform; see cache status; refresh if stale.

**Pain Points Addressed**: Fragmented library access requiring multiple logins/searches; no unified view on non-Windows devices; API rate limits slowing refreshes.

## Why

- Business value and user impact: Provides a personal, efficient game management hub, reducing time spent searching (from minutes to seconds), improving user satisfaction for multi-platform owners.
- Integration with existing features: New project; establishes foundation for future features like recommendations or playtime tracking.
- Problems this solves and for whom: Solves launcher fragmentation for gamers (target: Steam Deck users); addresses API/caching constraints on shared hosting.

## What

[User-visible behavior: Passwordless email auth with polling UI; platform connection via OAuth/OpenID buttons with status indicators; responsive game card grid with search bar and platform filters; footer showing cache age and refresh button. Technical requirements: Secure backend APIs for auth/platform/library; file-based JSON caching per user/platform; vanilla JS state management with localStorage; MySQL for user data; no external JS libs.]

### Success Criteria

- [ ] Email auth flow completes with validation in under 30 seconds, handling polling gracefully.
- [ ] Platform connections succeed for Steam/Epic/itch (GOG/Humble via alternatives), storing ext_id securely.
- [ ] Game libraries fetch and display correctly, with search returning cross-platform results.
- [ ] Caching works: Data persists 5 minutes, refreshes on expiry or manual trigger, handles large libraries (>500 games).
- [ ] UI responsive on desktop/mobile/Steam Deck; accessible (ARIA labels, keyboard nav).

## All Needed Context

### Context Completeness Check

_If someone knew nothing about this codebase, would they have everything needed to implement this successfully?_ Yes: Full DB schema, PHP/JS code patterns from research, API flows with examples, file structures, IONOS deployment notes, validation steps provided.

### Documentation & References

```yaml
# MUST READ - Include these in your context window
- url: https://partner.steamgames.com/doc/webapi/IPlayerService/GetOwnedGames/v0001#parameters
  why: Steam GetOwnedGames endpoint parameters and response format for library fetching
  critical: Set include_appinfo=1 for game names; private profiles return empty array - prompt user to adjust privacy

- url: https://dev.epicgames.com/docs/services/en-US/EpicAccountServices/Authentication/AuthMethods/index.html#authorizationcodeflow
  why: Epic OAuth 2.0 code flow for token exchange, required for entitlements API
  critical: Backend-only client_secret handling; refresh tokens every 8 hours to avoid 401 errors

- url: https://docs.gog.com/galaxy/features/session-tickets/
  why: GOG Galaxy SDK session tickets for user verification (no public library API)
  critical: Client-side SDK only; for library, suggest user manual export or skip integration - avoid scraping per TOS

- url: https://itch.io/docs/api/oauth
  why: itch.io Implicit OAuth flow and /me endpoint for user profile/games
  critical: Token in URL hash - extract via JS and POST to backend; limited to uploads, use /purchases per-game for owned check

- url: https://support.humblebundle.com/hc/en-us/articles/360001092887-Partner-API-Documentation
  why: Humble Bundle partner API for bundles/orders (restricted access)
  critical: No public user library endpoint; require partnership approval or fallback to Steam API for redeemed games

- file: research/component-implementation-guide.md
  why: Vanilla JS patterns for AuthStateManager, PlatformManager, GameGrid classes
  pattern: ES6 classes with async fetch, localStorage state, event delegation
  gotcha: No npm - all code inline or <script> includes; handle CORS for API calls

- file: research/ui-ux-design-suggestions.md
  why: CSS/HTML for responsive grid, platform cards, auth states
  pattern: CSS Grid for games, media queries for Steam Deck (800x450 max)
  gotcha: Vanilla CSS vars for theming; no preprocessors

- docfile: PRPs/ai_docs/steam-api.md  # Create if needed from research
  why: Compiled Steam OpenID + PHP cURL examples
  section: auth_flow, library_endpoint

- docfile: PRPs/ai_docs/epic-oauth.md  # Create from Epic research
  why: Epic token exchange and entitlements fetch
  section: All

# Proposed Project Structure (new codebase)
- file: php/config.php
  why: Centralized config for DB/API keys, outside webroot for security
  pattern: return ['db' => [...], 'apis' => ['steam' => ['key' => '...']]];
  gotcha: chmod 600; never commit keys

- file: php/classes/PasswordlessAuth.php
  why: Handles email token logic
  pattern: PDO prepared statements, UUID tokens, rate limiting
  gotcha: Enforce 15-min expiry; invalidate siblings on validate

- file: php/classes/Cache.php
  why: File-based API response caching
  pattern: Hashed subdirs, json_encode + gzencode, flock locking
  gotcha: Path outside webroot (/home/user/cache/); cleanup expired files

- file: js/app.js
  why: Main application logic
  pattern: FLAREApp class initializing managers, DOMContentLoaded
  gotcha: Vanilla fetch for APIs; debounce search input
```

### Current Codebase tree (run `tree` in the root of the project) to get an overview of the codebase

New project; initial tree empty. After implementation:

```bash
.
├── index.html          # Frontend entry: Includes JS/CSS, auth states
├── js/
│   └── app.js          # Core logic: Auth, platforms, games
├── css/
│   └── styles.css      # Responsive styles, game grid
├── php/
│   ├── index.php       # API router: Handles /api/* requests
│   ├── config.php      # Secrets: DB/API keys
│   └── classes/
│       ├── PasswordlessAuth.php  # Email token auth
│       └── Cache.php            # File caching
├── api/  # Wait, adjust: php/api/ for endpoints
│   ├── auth.php
│   ├── connect.php
│   └── games.php
├── cache/              # Writable: user_platform_games.json files
├── db/
│   └── schema.sql      # MySQL tables
└── tests/
    └── auth.spec.js    # Playwright UI tests
```

### Desired Codebase tree with files to be added and responsibility of file

As above:
- index.html: Serves frontend, embeds PHP for dynamic if needed (but static preferred).
- js/app.js: Orchestrates UI flows, API calls.
- php/index.php: Entry for all requests; routes to api/ files.
- cache/: Stores JSON like {userId}_steam_games.json with timestamp.
- db/schema.sql: Defines users, user_accounts, user_tokens tables.

### Known Gotchas of our codebase & Library Quirks

```php
// CRITICAL: IONOS shared hosting - no cron; use external service for cache cleanup
// Steam OpenID: Verify signature backend-side; deprecated but required
// Epic OAuth: client_secret never in frontend; handle exchange server-only
// GOG: No backend library API; implement as "manual connect" or skip
// itch.io: Implicit tokens in hash - JS extract and secure POST to backend
// Humble: Partner-only; fallback to user-provided list or Steam integration
// Cache: Use absolute paths; flock may timeout on high load - non-blocking alternative
// JS: No async/await polyfill needed (modern browsers); handle fetch errors gracefully
// DB: UUID() function requires MySQL 8.0+; fallback to PHP Uuid if older
// Email: PHPMailer SMTP config for IONOS (use their mail server if no external)
```

## Implementation Blueprint

### Data models and structure

Create the core data models for type safety and consistency. Use MySQL schema with UUIDs for distributed scalability.

```sql
-- Database: flare_db (create via IONOS cPanel)
-- Full schema with indexes for performance

CREATE DATABASE IF NOT EXISTS flare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flare_db;

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    profile_info JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE user_accounts (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    ext_system ENUM('steam', 'epic', 'gog', 'itch', 'humble') NOT NULL,
    ext_id VARCHAR(64),
    nonce CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_ext (user_id, ext_system),
    INDEX idx_ext_system (ext_system)
) ENGINE=InnoDB;

CREATE TABLE user_tokens (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    token CHAR(36) NOT NULL UNIQUE,
    state ENUM('Pending', 'Validated', 'Disabled') DEFAULT 'Pending',
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_state_expires (state, expires_at),
    INDEX idx_ip_created (ip_address, created_at)
) ENGINE=InnoDB;

-- Initial data or triggers if needed
-- Cron alternative: Manual cleanup query: DELETE FROM user_tokens WHERE expires_at < NOW();
```

No Pydantic (PHP); use simple validation in classes.

### Implementation Tasks (ordered by dependencies)

```yaml
Task 1: CREATE db/schema.sql
  - IMPLEMENT: Tables as above with UUID defaults, enums, indexes
  - FOLLOW pattern: Standard MySQL InnoDB for relations
  - NAMING: CHAR(36) for UUIDs, ENUM for constrained fields
  - PLACEMENT: db/schema.sql
  - DEPENDENCIES: None

Task 2: CREATE php/config.php
  - IMPLEMENT: Array return with db creds, app_url, apis keys (Steam API key, Epic client_id/secret, etc.)
  - FOLLOW pattern: Outside webroot, no hardcodes
  - NAMING: $config['db']['host'] = 'localhost'; $config['apis']['steam']['key'] = '...'
  - DEPENDENCIES: Task 1 (for DB)
  - PLACEMENT: php/config.php

Task 3: CREATE php/classes/PasswordlessAuth.php
  - IMPLEMENT: Class with __construct(PDO $pdo, string $appUrl), init(string $email, string $ip, string $ua): int, validate(string $token, string $ip, string $ua): array, poll(string $sessionId): array
  - FOLLOW pattern: From research - UUID tokens, prepared statements, rate limit via count query, PHPMailer for email
  - NAMING: Methods as above; use Uuid::uuid4()
  - DEPENDENCIES: config.php (for SMTP), schema
  - PLACEMENT: php/classes/

Task 4: CREATE php/classes/Cache.php
  - IMPLEMENT: Class with __construct(string $dir, int $ttl=300, bool $compress=true), get(string $key): ?array, set(string $key, array $data, ?int $ttl): bool, delete(string $key): bool, cleanup(int $maxAge=86400): int
  - FOLLOW pattern: From research - SHA1 hash subdirs, json_encode metadata, gzencode, flock locks
  - NAMING: File path: cache/{hash1}/{hash2}/{hash}.cache
  - DEPENDENCIES: None
  - PLACEMENT: php/classes/

Task 5: CREATE php/api/auth.php
  - IMPLEMENT: Handle POST /api/auth/init (email → token/email), POST /api/auth/validate (token → user data/session), GET /api/auth/poll?sessionId=xxx (status)
  - FOLLOW pattern: JSON responses, CORS headers, use PasswordlessAuth
  - NAMING: if ($_SERVER['REQUEST_METHOD'] === 'POST' && parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api/auth/init') { ... }
  - DEPENDENCIES: PasswordlessAuth, config
  - PLACEMENT: php/api/

Task 6: CREATE php/api/connect.php
  - IMPLEMENT: GET /api/connect/{platform}/init (redirect OAuth URL), GET /api/connect/{platform}/complete (callback: verify, store ext_id in user_accounts, delete nonce)
  - FOLLOW pattern: Platform switch - Steam OpenID redirect/verify, Epic OAuth code exchange, etc. from research
  - NAMING: $platform = basename(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)); switch($platform)
  - DEPENDENCIES: auth.php (for user_id), schema
  - PLACEMENT: php/api/

Task 7: CREATE php/api/games.php
  - IMPLEMENT: GET /api/games/{platform} (fetch cached or API, return games array), POST /api/games/refresh (invalidate cache, refetch)
  - FOLLOW pattern: $cache = new Cache(...); $games = $cache->get("{$userId}_{$platform}") ?? fetchFromPlatform($userId, $platform, $cache);
  - NAMING: fetchFromSteam/Epic/etc. functions with cURL from research
  - DEPENDENCIES: connect.php (ext_id), Cache
  - PLACEMENT: php/api/

Task 8: CREATE index.html
  - IMPLEMENT: Basic structure with <div data-auth-state="unauthenticated"> email form, etc.; <script src="js/app.js"></script>; <link rel="stylesheet" href="css/styles.css">
  - FOLLOW pattern: From ui-suggestions - auth states, platform cards, game grid
  - NAMING: id="email-form", class="game-grid"
  - DEPENDENCIES: None
  - PLACEMENT: Root

Task 9: CREATE js/app.js
  - IMPLEMENT: FLAREApp class: init() with auth.updateUI(), platforms.load(), games.load(); event listeners for forms/buttons
  - FOLLOW pattern: From component-guide - AuthStateManager.pollForValidation(), PlatformManager.connectPlatform(), GameGrid.render()
  - NAMING: new FLAREApp().init() on DOMContentLoaded
  - DEPENDENCIES: index.html
  - PLACEMENT: js/

Task 10: CREATE css/styles.css
  - IMPLEMENT: Responsive grid, platform badges, auth forms, from ui-suggestions
  - FOLLOW pattern: CSS Grid minmax(140px,1fr), media for Steam Deck, color vars for platforms
  - NAMING: .game-card, .platform-badge.steam { background: #1b2838; }
  - DEPENDENCIES: index.html
  - PLACEMENT: css/

Task 11: CREATE php/index.php
  - IMPLEMENT: Simple router: $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); if (strpos($uri, '/api/') === 0) { include "api/" . basename($uri) . ".php"; } else { serve index.html via readfile }
  - FOLLOW pattern: header('Content-Type: application/json'); for APIs
  - NAMING: $path = str_replace('/api/', '', $uri);
  - DEPENDENCIES: All api/
  - PLACEMENT: php/

Task 12: CREATE tests/auth.spec.js and podman-compose.yml
  - IMPLEMENT: Playwright tests: test('auth flow', async ({ page }) => { await page.fill('#email-input', 'test@example.com'); ... expect validated });
  - FOLLOW pattern: From podman research - npx playwright test
  - NAMING: auth.spec.js for full journey
  - DEPENDENCIES: All
  - PLACEMENT: tests/; root for compose
```

### Implementation Patterns & Key Details

```php
// Example: Service pattern in api/games.php
function getCachedGames(int $userId, string $platform): array {
    $cache = new Cache($config['cache_dir'], 300);  // 5 min TTL
    $key = "{$userId}_{$platform}";
    $games = $cache->get($key);
    if (!$games) {
        $games = fetchFromPlatform($userId, $platform);  // API call
        $cache->set($key, $games);
    }
    return $games;
}

// GOTCHA: Handle API errors - if fetch fails, return empty or cached stale
try {
    $ch = curl_init($apiUrl);
    // ... cURL options from research
    $response = curl_exec($ch);
    if (curl_errno($ch)) throw new Exception(curl_error($ch));
} catch (Exception $e) {
    error_log("API fetch failed: " . $e->getMessage());
    return [];  // Or previous cache
}

// CRITICAL: For Steam, validate private profile
if (empty($games)) {
    // Check if private or no games
}

// JS pattern: Async API call in PlatformManager
async connectPlatform(platform) {
    try {
        const res = await fetch(`/api/connect/${platform}/init`);
        const { authUrl } = await res.json();
        window.open(authUrl, '_blank');
        // Poll /complete
    } catch (e) {
        showError('Connection failed');
    }
}
```

### Integration Points

```yaml
DATABASE:
  - migration: "CREATE DATABASE flare_db; SOURCE db/schema.sql"
  - index: "ALTER TABLE user_accounts ADD INDEX idx_ext_id (ext_id)"

CONFIG:
  - add to: config.php
  - pattern: "if (!file_exists(__DIR__ . '/config.php')) die('Config missing'); $config = include __DIR__ . '/config.php';"

ROUTES:
  - add to: php/index.php
  - pattern: "header('Access-Control-Allow-Origin: *'); if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;"

EMAIL:
  - setup: PHPMailer SMTP in PasswordlessAuth; IONOS mail server or external (SendGrid)
  - pattern: "$mail->Host = 'smtp.ionos.com'; $mail->Port = 587;"
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# PHP syntax and style (no built-in linter; use online or manual)
find php/ -name "*.php" -exec php -l {} \;
# Manual: Check PSR-12 (indent 4 spaces, no trailing whitespace)

# JS syntax (vanilla, use browser console or jshint online)
# CSS: Validate via W3C online

# Expected: No syntax errors. Fix before proceeding.
php -l php/classes/*.php php/api/*.php php/index.php
```

### Level 2: Unit Tests (Component Validation)

No framework; manual curl tests for PHP, browser for JS.

```bash
# Test auth init (replace with your local URL)
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' http://localhost:8080/api/auth/init

# Test validate (after getting token)
curl -X POST -H "Content-Type: application/json" -d '{"token":"uuid-from-email"}' http://localhost:8080/api/auth/validate

# JS: Open index.html in browser, check console for errors on form submit

# Expected: 200 OK with JSON; email sent (check spam); no PHP notices.
```

### Level 3: Integration Testing (System Validation)

```bash
# Start local env
podman-compose up -d
sleep 5  # Wait for startup

# Health check
curl -f http://localhost:8080/php/index.php?uri=/api/health || echo "Health failed"

# Auth flow test
curl -X POST http://localhost:8080/php/index.php -H "Content-Type: application/json" -d '{"uri":"/api/auth/init","email":"test@example.com"}'

# Platform connect (manual: Visit /connect/steam/init, complete OAuth)
# Games fetch
curl http://localhost:8080/php/index.php?uri=/api/games/steam -H "Cookie: session=validated_session"

# DB validation
podman-compose exec mysql mysql -u app_user -papppass app_db -e "SELECT COUNT(*) FROM users;"

# Expected: All curls 200, DB populated, no connection errors
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Playwright UI tests (run in podman)
podman-compose run playwright npx playwright test tests/

# Custom: Manual platform connect (use test accounts), search a game, verify cache file: ls cache/*_steam_games.json
# Performance: Time page load with 100 games <3s; use browser dev tools
ab -n 10 -c 2 http://localhost:8080/

# Security: Scan with online tools (no keys exposed, prepared statements)
# IONOS deploy test: Upload to staging subdomain, verify no errors in logs

# Expected: Tests pass, cache files created with timestamp, search works cross-platform
```

## Final Validation Checklist

### Technical Validation

- [ ] All syntax checks pass: php -l on all files
- [ ] DB schema runs without errors: No FK violations
- [ ] All API endpoints return valid JSON: curl tests succeed
- [ ] No PHP warnings/notices: Check error_log

### Feature Validation

- [ ] All success criteria met: Auth, connect, search, cache
- [ ] Manual testing: Full user journey on Chrome/Firefox (simulate Steam Deck viewport)
- [ ] Error cases: Invalid token → 401, expired cache → refetch, private profile → message
- [ ] Integration: Platforms store ext_id, games aggregate correctly
- [ ] User persona: Works on 800x450 resolution, touch-friendly

### Code Quality Validation

- [ ] Follows vanilla patterns: No libs, secure practices
- [ ] File placement: Cache outside webroot, config 600 perms
- [ ] Anti-patterns avoided: No scraping, rate limits respected
- [ ] Dependencies: Only native PHP/JS, PHPMailer via Composer if allowed
- [ ] Configuration: IONOS-ready (no node, file perms)

### Documentation & Deployment

- [ ] Code self-documenting: Clear var names, no comments needed per policy
- [ ] Logs informative: error_log for API fails
- [ ] Env vars: Document in config.php comments (DB host from IONOS)
- [ ] Deploy: FTP to IONOS, run schema via phpMyAdmin, test endpoints

---

## Anti-Patterns to Avoid

- ❌ Don't create new patterns when existing ones work: Stick to research examples for auth/cache
- ❌ Don't skip validation because "it should work": Run curl/Playwright after each task
- ❌ Don't ignore failing tests - fix them: Debug API errors immediately
- ❌ Don't use sync functions in async context: All JS fetch async
- ❌ Don't hardcode values that should be config: All keys/DB in config.php
- ❌ Don't catch all exceptions - be specific: Catch PDOException, CurlError separately
- ❌ Don't expose sensitive data: No API keys in JS, validate inputs always

---
Confidence Score: 9/10 for one-pass implementation success likelihood - Extensive API research, code patterns, and validation ensure completeness despite new project nature.
