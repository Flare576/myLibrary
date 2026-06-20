# MyLibrary Game Library Aggregator - Agent Guide

## Project Overview

MyLibrary is a web-based game library aggregator (v2 rebuild). Two interfaces, one app:

1. **Bundle Browser** — visit a page, see current Humble Bundle contents, immediately know which games you don't own and what the bundle is actually worth to you.
2. **Library View** — see your full cross-platform game library in one searchable/filterable place.

Target device: Steam Deck (1280×800, landscape, controller-friendly).

### Architecture
- **Backend**: PHP 8.5 + MariaDB (dev: local socket at `/tmp/mysql.sock`; prod: IONOS shared hosting)
- **Frontend**: Vanilla JavaScript ES modules, no frameworks, no build step
- **Auth model**: Username + passphrase → PBKDF2-derived AES key → client-side encrypted blob. Server stores opaque ciphertext it can never decrypt.
- **Deployment**: SFTP via `lftp` to IONOS. Use `./deploy` — it handles prod config and Apache entry point automatically.

### Key Principle
Server is a dumb proxy + blob store. All sensitive data (game libraries, OAuth tokens) lives client-side, encrypted with a key the server never sees (WebCrypto AES-GCM, PBKDF2-derived key).

### SessionStore (intentional tradeoff)
Steam's OpenID flow navigates away from the page, losing in-memory credentials. To survive the redirect, `index.html` saves `username` + `passphrase` to `sessionStorage` on login and restores them on page load. `sessionStorage` is tab-scoped and cleared on tab close — not persisted across sessions.

This stores credentials in plaintext in the browser. For this project (personal tool, no third-party scripts, no CDN) the risk is acceptable. Do not change this to `localStorage`. Do not "fix" it without understanding why it exists.

### APP_BASE (critical for prod)
The app is deployed at `https://flare576.com/myLibrary/` — a subdirectory, not a root domain. All JS fetch paths and `window.history.replaceState` calls MUST use `(window.APP_BASE || '') + '/api/...'`. `APP_BASE` is set at page load from `window.location.pathname`. Hardcoded `/api/` paths work locally but break on prod.

---

## Current Files (v2 — Phases 0-7 complete)

```
index.html          — single-page app shell (auth + library + bundle browser)
router.php          — PHP dev server router (deployed as index.php on prod via deploy script)
config.php          — Local dev config (NEVER COMMIT — gitignored)
config.prod.php     — Production config (NEVER COMMIT — gitignored, deployed as config.php)
deploy              — SFTP deploy script
.htaccess           — Apache routing (DirectorySlash Off, routes all non-files through index.php)
.vroomrc            — Vroom dev tool PATH config

api/
  sync.php          — GET/HEAD/POST blob store (ETag concurrency control)
  bundles.php       — Humble Bundle scraper + cache (webpack-json-data from /games page)
  bundles/
    detail.php      — Per-bundle tier/game detail via Parse.bot API
  steam/
    init.php        — OpenID redirect to Steam
    callback.php    — Assertion verification + SteamID extraction (no session nonce — unreliable on IONOS)
    games.php       — IPlayerService proxy (server holds API key)
  epic/
    exchange.php    — Code → token exchange + library fetch (one round-trip, tokens returned to client)
  itch/
    init.php        — OAuth redirect (implicit flow)
    callback.php    — Serves index.html with APP_BASE + base href injected for correct asset resolution
    library.php     — Owned-keys proxy (handles pagination + empty {} edge case)

classes/
  Cache.php         — File cache with locking, TTL, gzip

js/
  crypto.js         — WebCrypto: deriveKey, generateUserId, encrypt, decrypt (Ei pattern)
  auth.js           — AuthManager: login, logout, getState, saveState (ETag concurrency)
  steam.js          — SteamManager: connectSteam, handleCallback, disconnectSteam
  epic.js           — EpicManager: connectEpic, disconnectEpic
  itch.js           — ItchManager: handleCallback, fetchLibrary, disconnectItch
  bundles.js        — bundleManager: fetch, normalizeName, buildOwnedSet, computeDetailOwnership

css/
  styles.css        — CSS custom properties + full layout (dark-first, SteamDeck-optimized)

db/
  schema.sql        — 4-table schema: users, user_blobs, bundle_cache, rate_limits

tests/
  README.md         — test inventory + counts (UPDATE THIS when adding tests)
  crypto.test.js    — Bun unit — crypto.js (10 tests)
  auth.test.js      — Bun unit — auth.js (10 tests)
  bundles.test.js   — Bun unit — bundleManager normalizeName + computeOwnershipSummary (38 tests)
  bundles-detail.test.js — Bun unit — computeDetailOwnership (16 tests)
  sync.spec.js      — Playwright — sync.php HTTP (9 tests)
  browser.spec.js   — Playwright — auth state machine (10 tests)
  steam.spec.js     — Playwright — Steam API + callback (8 tests)
  epic.spec.js      — Playwright — Epic exchange + browser (8 tests)
  itch.spec.js      — Playwright — itch API (4 tests)
  itch-behavior.spec.js — Playwright browser — itch connect/disconnect/callback (9 tests)
  bundles.spec.js   — Playwright browser — bundle listing UI (8 tests)
  bundles-detail.spec.js — Playwright — bundle detail API + UI (16 tests)
  schema.spec.js    — Playwright — DB schema regression (3 tests)
  session.spec.js   — Playwright browser — SessionStore auto-login (3 tests)
  design.spec.js    — Playwright — Phase 6/7 design requirements (20 tests)

playwright.config.js — Playwright config (Chromium, --no-sandbox, port 8181, BASE_URL env support)
package.json         — test scripts
```

### Files That Must Never Be Committed
- `config.php`, `config.prod.php` — DB credentials, API keys (covered by `config*.php` gitignore rule)
- `logs/` — production PHP errors
- `tickets/` — may contain API keys or sensitive info
- `.sisyphus/` — local agent planning files

---

## Dev Environment

Running inside Distrobox (Arch) on a Steam Deck. PHP and MariaDB run directly — no containers.

### Starting the dev server
```bash
# PHP dev server (port 8181)
php -S 0.0.0.0:8181 router.php

# Check if already running
ps aux | grep "php -S" | grep -v grep
```

### Database
```bash
# MariaDB socket at /tmp/mysql.sock (start via tmux if not running)
tmux new-session -d -s mariadb "mariadbd --user=deck --datadir=/var/lib/mysql --socket=/tmp/mysql.sock"

# Load/reset schema (idempotent — drops and recreates all tables)
mariadb --socket=/tmp/mysql.sock mylibrary_db < db/schema.sql
mariadb --socket=/tmp/mysql.sock mylibrary_db -e "SHOW TABLES;"
# Expected: bundle_cache, rate_limits, user_blobs, users
```

### Dev config
`config.php` points at local MariaDB socket. `config.prod.php` has IONOS credentials. Both gitignored.

---

## Testing

**Prerequisite**: PHP dev server must be running on port 8181 for integration and browser tests.

```bash
npm test              # full local suite: 74 unit + 115 Playwright = 189 tests
npm run test:unit     # Bun only — no server needed (74 tests)
npm run test:prod     # 56 integration tests against https://flare576.com/myLibrary
```

### Test counts (update tests/README.md when adding tests)
- **Unit** (Bun): 74 tests across 4 files
- **Playwright** (local): 115 tests across 11 spec files
- **Playwright** (prod): 56 tests — API/integration only, no mocked-sync tests

### Test stack
- **Unit tests** (`*.test.js`): Bun runtime. WebCrypto available natively — no browser needed.
- **Playwright tests** (`*.spec.js`): Headless Chromium at `~/.cache/ms-playwright/`. `--no-sandbox` required (container environment).
- **Prod tests**: `BASE_URL=https://flare576.com/myLibrary npx playwright test ...` — hits real prod DB and APIs.

### When adding tests for a new phase
**Unit** (`*.test.js`): add to `test:unit` and `test` scripts in `package.json`.
**Playwright** (`*.spec.js`): auto-discovered by `playwright.config.js` — just create the file.

### Test IDs
Oracle-style comments: `// Oracle: reason this assertion is correct`. Cross-reference `.sisyphus/plans/rebuild.md`.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sync/{userId}` | Fetch encrypted blob — 200 + ETag or 404 |
| HEAD | `/api/sync/{userId}` | Check blob existence + ETag |
| POST | `/api/sync/{userId}` | Store encrypted blob — If-Match for concurrency |
| GET | `/api/steam/init` | Start Steam OpenID flow |
| GET | `/api/steam/callback` | Verify Steam assertion, redirect with steamid |
| GET | `/api/steam/games?steamid=X` | Proxy IPlayerService GetOwnedGames |
| POST | `/api/epic/exchange` | Exchange Epic auth code → tokens + games (one round-trip) |
| GET | `/api/itch/init` | Start itch.io OAuth implicit flow |
| GET | `/api/itch/callback` | Serves index.html with APP_BASE injected (token in hash) |
| POST | `/api/itch/library` | Proxy itch.io owned-keys API |
| GET | `/api/bundles` | Humble Bundle listing (scraped + cached) |
| GET | `/api/bundles/{slug}/detail` | Per-bundle tier/game detail (Parse.bot) |

**userId format**: URL-safe base64, no padding (`^[a-zA-Z0-9_\-]+$`).

---

## Auth Model (v2)

1. User enters username + passphrase
2. Browser derives AES-GCM-256 key via PBKDF2 (310k iterations, salt `"ei-the-answer-is-42"` — key never leaves RAM)
3. Browser computes `userId` = encrypt `"the_answer_is_42"` with zeroed IV → URL-safe base64
4. GET `/api/sync/{userId}` → 404 (new user) or 200 + encrypted blob
5. On 200: decrypt blob → success = correct credentials → app loads
6. On state change → re-encrypt → POST `/api/sync/{userId}` with If-Match ETag

No sessions. No JWTs. No passwords stored anywhere. Server maps `userId → opaque blob`.

### Encrypted blob schema
```json
{
  "steam": { "steamId": "...", "games": [...] },
  "epic":  { "accessToken": "...", "refreshToken": "...", "accountId": "...", "expiresAt": "...", "games": [...] },
  "itch":  { "token": "...", "games": [...] },
  "lastSync": { "steam": "ISO8601", "epic": "ISO8601", "itch": "ISO8601" }
}
```

---

## Platform Integration Status

| Platform | Status | Notes |
|----------|--------|-------|
| Steam | ✅ Complete | OpenID 2.0; session nonce removed (unreliable on IONOS — assertion verification sufficient) |
| Epic | ✅ Complete | User pastes auth code from epicgames.com/id/api/redirect; server exchanges + fetches library in one call |
| itch.io | ✅ Complete | Implicit OAuth; token in URL hash; `{}` empty library edge case handled; `#error=` denial handled |
| GOG | Not planned | No public API |
| Humble Bundle | ✅ Complete | Scraped from `humblebundle.com/games` (`webpack-json-data` tag, NOT homepage); game detail via Parse.bot |

### Epic auth flow (unusual)
No redirect URI. User visits `https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code`, copies `authorizationCode` from JSON, pastes into app. Server exchanges via `account-public-service-prod03.ol.epicgames.com`. Uses `launcherAppClient2` credentials.

### Humble Bundle scraping
- **List**: `humblebundle.com/games` page → `<script id="webpack-json-data">` → `data.data.games.mosaic[0].products`
- **Filter**: only `product_url` starting with `/games/` (excludes books/software)
- **Detail**: Parse.bot API `get_bundle_detail?bundle_slug={slug}` (free tier: 100 credits/month)
- **Cache**: TTL = bundle `end_date`; some slugs return 502 (Parse.bot can't scrape that bundle page structure)

---

## Database Schema (v2)

| Table | Purpose |
|-------|---------|
| `users` | Just an ID + timestamps. No PII. |
| `user_blobs` | `user_id → blob (MEDIUMTEXT, opaque ciphertext) + etag`. Server never decrypts. |
| `bundle_cache` | Humble bundle data + TTL. Public, no user data. |
| `rate_limits` | IP/userId hash → request count + window. |

**Note**: `user_blobs.blob` is `MEDIUMTEXT` (not `TEXT`) — encrypted libraries easily exceed TEXT's 64KB limit.

---

## Deployment

```bash
./deploy        # Commit current state and deploy to prod
./deploy -n     # Dry run
```

**What deploy does:**
- Uploads `config.prod.php` → `config.php` on server
- Uploads `router.php` → `index.php` on server (Apache entry point)
- Mirrors all other files (excludes: config*, node_modules/, tests/, screenshots/, .sisyphus/, logs/, dev dotfiles)

**For full deploy guidance**, load the `mylibrary-deploy` skill.

### Prod environment
- URL: `https://flare576.com/myLibrary/` (trailing slash required — bare path 403s due to Apache directory handling)
- Subdomain: `https://mylibrary.flare576.com` → redirects to above
- PHP error logs: `lftp` mirror on `logs/` dir

### IONOS gotchas
- **Apache sessions unreliable** — don't use `$_SESSION` for anything load-bearing
- **DB not externally accessible** — run migrations via temporary PHP script uploaded via SFTP
- **`php.ini` not hierarchical** — each `api/` subdir may need its own copy for error logging
- **SSL cert re-issue** — if subdomain loses cert after config changes, "Reissue SSL" in IONOS panel fixes immediately

---

## Git Strategy

- `main` — current release (v2); all production deployments from here
- `v2` — v2 base branch; feature branches merge here, then v2 merges to main for release
- `phase-N-name` — feature branches per phase (e.g. `phase-7-polish`)
- `grok-first-pass`, `feature/epic-library-fix` — historical v1/research branches

Branch naming: `phase-N-name` (NOT `v2/phase-N-name` — Git won't allow branch names that are prefixes of existing branch names).

---

## FTP Log Management

```bash
cd /home/deck/Projects/Personal/myLibrary
lftp -u "$MYLIB_FTP_USER","$MYLIB_FTP_PASS" "sftp://$MYLIB_FTP_HOST:22" <<EOF
mirror --verbose logs/
bye
EOF
```

Log files pulled to `logs/` (gitignored). `logs/php-errors.log` = production PHP errors.
