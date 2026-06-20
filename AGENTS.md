# MyLibrary Game Library Aggregator - Agent Guide

## Project Overview

MyLibrary is a web-based game library aggregator (v2 rebuild). Two interfaces, one app:

1. **Bundle Browser** — visit a page, see current Humble Bundle contents, immediately know which games you don't own and what the bundle is actually worth to you.
2. **Library View** — see your full cross-platform game library in one searchable/filterable place.

Target device: Steam Deck (1280×800, landscape, controller-friendly).

### Architecture
- **Backend**: PHP 8.5 + MariaDB (dev: local socket at `/tmp/mysql.sock`; prod: IONOS shared hosting)
- **Frontend**: Vanilla JavaScript ES modules, no frameworks, no build step
- **Auth model**: Passwordless, client-side crypto only — server stores an opaque encrypted blob it can never decrypt
- **Deployment**: SFTP via `lftp` to IONOS

### Key Principle
Server is a dumb proxy + blob store. All sensitive data (game libraries, OAuth tokens) lives client-side, encrypted with a key the server never sees (WebCrypto AES-GCM, PBKDF2-derived key).

### SessionStore (intentional tradeoff)
Steam's OpenID flow navigates away from the page, losing in-memory credentials. To survive the redirect, `index.html` saves `username` + `passphrase` to `sessionStorage` on login and restores them on page load. `sessionStorage` is tab-scoped and cleared on tab close — not persisted across sessions.

This stores credentials in plaintext in the browser. For this project (personal tool, no third-party scripts, no CDN) the risk is acceptable. Do not change this to `localStorage`. Do not "fix" it without understanding why it exists.

---

## Current Files (v2 — Phase 0 complete)

```
index.html          — single-page app shell (auth state machine)
router.php          — PHP dev server router
config.php          — DB credentials, API keys (NEVER COMMIT — gitignored)
deploy              — SFTP deployment script

api/
  sync.php          — GET/HEAD/POST blob store (ETag concurrency control)

classes/
  Cache.php         — file cache with locking, TTL, gzip (kept from v1)

js/
  crypto.js         — WebCrypto module: deriveKey, generateUserId, encrypt, decrypt
  auth.js           — AuthManager class: login, logout, getState, saveState

css/
  styles.css        — CSS custom properties + auth state visibility rules

db/
  schema.sql        — minimal 4-table schema (idempotent, drops + recreates)

tests/
  README.md         — test inventory + counts (update this when adding tests)
  crypto.test.js    — Bun unit tests for js/crypto.js (10 tests)
  auth.test.js      — Bun unit tests for js/auth.js (10 tests)
  sync.spec.js      — Playwright integration tests for api/sync.php (9 tests)
  browser.spec.js   — Playwright browser tests for index.html (4 tests)

playwright.config.js — Playwright config (Chromium, --no-sandbox, port 8181)
package.json         — test scripts
```

### Files That Must Never Be Committed
- `config.php` — DB credentials, API keys, SMTP password
- `tickets/*` — may contain API keys or sensitive info
- `logs/` — may contain production system logs

---

## Dev Environment

Running inside Distrobox (Arch) on a Steam Deck. PHP and MariaDB run directly in this container (yes, intentionally — we threw the clean-container philosophy out the window in Phase 0).

### Starting the dev server
```bash
# PHP dev server (port 8181)
php -S 0.0.0.0:8181 router.php

# Or check if it's already running
cat php.pid
curl -s http://127.0.0.1:8181/ | head -3
```

### Database
```bash
# MariaDB socket is at /tmp/mysql.sock (started via mariadbd-safe in a tmux session)
# Load/reset schema (idempotent — drops and recreates all tables)
mariadb --socket=/tmp/mysql.sock mylibrary_db < db/schema.sql
mariadb --socket=/tmp/mysql.sock mylibrary_db -e "SHOW TABLES;"
# Expected: bundle_cache, rate_limits, user_blobs, users
```

---

## Testing

**Prerequisite**: PHP dev server must be running on port 8181 for integration and browser tests.

```bash
npm test                  # full suite: unit + integration + browser (33 tests)
npm run test:unit         # Bun only — crypto.js + auth.js (no server needed)
npm run test:integration  # Playwright — sync.php live HTTP tests
npm run test:browser      # Playwright — index.html in real Chromium
```

### Test stack
- **Unit tests** (`*.test.js`): run via `bun test`. WebCrypto and `fetch` are available natively in Bun — no browser needed for the crypto/auth logic.
- **Integration + browser tests** (`*.spec.js`): run via `npx playwright test`. Uses the bundled Chromium headless shell at `~/.cache/ms-playwright/`. Requires `--no-sandbox` (already in `playwright.config.js`).

### When adding tests for a new phase

**Unit tests** (`tests/*.test.js`):
- Add the file to the `bun test` command in `package.json` `test:unit` script
- Also add it to the main `test` script

**Playwright tests** (`tests/*.spec.js`):
- They're picked up automatically by `playwright.config.js` (`testMatch: ['**/*.spec.js']`)
- No config change needed — just create the file

### Test IDs
Tests are tagged with IDs matching the strategy doc (e.g., `T-CRYPTO-02`, `T-AUTH-01`, `T-SYNC-05`). The strategy lives in `.sisyphus/plans/rebuild.md` — cross-reference there for oracle rationale.

---

## API Endpoints (Phase 0)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sync/{userId}` | Fetch encrypted blob — 200 + ETag or 404 |
| HEAD | `/api/sync/{userId}` | Check blob existence + ETag, no body |
| POST | `/api/sync/{userId}` | Store encrypted blob — supports If-Match for concurrency |

**userId format**: URL-safe base64, no padding (`^[a-zA-Z0-9_\-]+$`). Derived client-side via `generateUserId()` in `crypto.js` — server never computes or validates this.

---

## Auth Model (v2)

1. User enters username + passphrase
2. Browser derives AES-GCM-256 key via PBKDF2 (310k iterations, fixed salt — key never leaves RAM)
3. Browser computes `userId` = deterministic encryption of sentinel string with zeroed IV
4. GET `/api/sync/{userId}` → 404 (new user, start with empty state) or 200 + encrypted blob
5. On 200: decrypt blob → if success, correct credentials → app loads
6. On state change → re-encrypt → POST `/api/sync/{userId}` with If-Match ETag

No sessions. No JWTs. No passwords stored anywhere. Server maps `userId → opaque blob`.

### Encrypted blob schema
```json
{
  "steam": { "steamId": "...", "games": [...] },
  "epic":  { "accessToken": "...", "refreshToken": "...", "games": [...] },
  "itch":  { "token": "...", "games": [...] },
  "lastSync": { "steam": "ISO8601", "epic": "ISO8601", "itch": "ISO8601" }
}
```

---

## Database Schema (v2)

| Table | Purpose |
|-------|---------|
| `users` | Just an ID + timestamps. No PII. |
| `user_blobs` | `user_id → blob (opaque ciphertext) + etag`. Server never decrypts. |
| `bundle_cache` | Humble bundle data + TTL. Public, no user data. (Phase 4+) |
| `rate_limits` | IP/userId hash → request count + window. (Phase 4+) |

---

## Platform Integration Status

| Platform | Status | Notes |
|----------|--------|-------|
| Steam | Phase 1 — not started | OpenID 2.0; server-side assertion verification needed |
| Epic | Phase 2 — not started | Client-side token flow; server is exchange proxy only |
| itch.io | Phase 3 — not started | OAuth implicit flow; empty library returns `{}` not `[]` |
| GOG | Not planned | No public API |
| Humble Bundle | Phase 4+ | Bundle listing via `landingPage-json-data`; game detail via Parse.bot or scraper |

---

## Deployment

```bash
./deploy                     # Upload changes only (dev — no commit)
./deploy -m "commit message" # Upload + commit (only when phase is confirmed working)
./deploy -p                  # Post to BlueSky after deploy
```

SFTP via `lftp`. Excludes: dotfiles, `config.php`, `*.swp`, `*.bkp`, `tags`.

### PHP config on IONOS
Each subdirectory needs its own `php.ini` — IONOS hosting is NOT hierarchical. If a new `api/` subdirectory stops logging errors, copy `php.ini` into it.

---

## Git Strategy

- `main` — v1 historical record (grok experiment)
- `v2` — new base; all v2 work merges here
- `phase-0-foundation`, `v2/phase-1-steam`, etc. — feature branches per phase
- `feature/epic-library-fix` — historical Epic research branch

When a phase is verified (tests green), PR → `v2`. At Phase 6 completion, `v2` → `main` as the v2 release.

---

## FTP Log Management

```bash
lftp -u "$MYLIB_FTP_USER","$MYLIB_FTP_PASS" "sftp://$MYLIB_FTP_HOST:22" <<EOF
mirror --verbose logs/
bye
EOF
```

Log files pulled to `logs/` (gitignored). `logs/php-errors.log` = production PHP errors.
