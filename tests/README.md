# Tests

169 tests across 15 files (168 passing, 1 known-failing). Two runners: **Bun** (unit) and **Playwright** (integration + browser).

## Quick start

```bash
npm test                   # everything (169 tests — expect 1 known failure: T-BUN-DETAIL-16)
npm run test:unit          # crypto + auth, no server needed
npm run test:integration   # sync.php live HTTP — needs PHP server on :8181
npm run test:browser       # index.html in Chromium — needs PHP server on :8181
```

Start the server if needed:
```bash
php -S 127.0.0.1:8181 router.php &
```

## Files

| File | Runner | Tests | Covers |
|------|--------|-------|--------|
| `crypto.test.js` | Bun | 10 | `js/crypto.js` — key derivation, generateUserId, encrypt/decrypt |
| `auth.test.js` | Bun | 10 | `js/auth.js` — login paths, ETag lifecycle, logout, saveState |
| `bundles.test.js` | Bun | 38 | `js/bundles.js` — normalizeName (20), buildOwnedSet (8), computeOwnershipSummary (10: highlights parsing, null handling, property preservation) |
| `sync.spec.js` | Playwright | 9 | `api/sync.php` — HTTP round-trips, ETag enforcement, validation, injection |
| `browser.spec.js` | Playwright | 18 | `index.html` — auth state machine, error display, logout, Steam + Epic + itch UI state |
| `steam.spec.js` | Playwright | 8 | `api/steam/*` — init redirect shape, callback rejection, games validation |
| `epic.spec.js` | Playwright | 6 | `api/epic/exchange.php` — input validation, method guard, Epic error forwarding |
| `schema.spec.js` | Playwright | 3 | `db/schema.sql` — live MEDIUMTEXT round-trip (T-SCHEMA-01), fresh-load MEDIUMTEXT check (T-SCHEMA-02), fresh-load `bundle_cache.detail` nullable column (T-SCHEMA-03) |
| `session.spec.js` | Playwright | 3 | `index.html` SessionStore — auto-login, logout clears, stale creds graceful |
| `epic-behavior.spec.js` | Playwright | 6 | `js/epic.js` + `index.html` — connect flow, state shape, error paths, reload, empty library |
| `itch.spec.js` | Playwright | 11 | `api/itch/*` — init redirect, callback HTML, library.php validation (method guard, missing token, bad token), base tag injection |
| `itch-behavior.spec.js` | Playwright | 10 | `js/itch.js` + `index.html` — hash callback, token forwarding, connect/disconnect, saveState failure, error, empty library, OAuth denial (1 known-failing: T-ITCH-JS-01) |
| `bundles.spec.js` | Playwright | 14 | `api/bundles.php` + `index.html` Bundle Browser — API shape, cache HIT, field validation, 405 guard, DB expires_at, tab switching, card rendering, links, ownership placeholder, logout reset, API error display, empty response |
| `bundles-detail.test.js` | Bun | 16 | `js/bundles.js` — computeDetailOwnership (15 cases) + T-BUN-DETAIL-16 known-failing bug test (missing human_name throws) |
| `bundles-detail.spec.js` | Playwright | 14 | `api/bundles/detail.php` + `index.html` detail panel — API shape, cache HIT, field types, 405/404, panel UI, summary, back button, error, data-owned attr, end-to-end ownership (T-DETAIL-13/14) |

## Adding tests for a new phase

**Unit tests** (`*.test.js`): add the filename to `test:unit` and `test` in `package.json`.

**Playwright tests** (`*.spec.js`): just create the file — `playwright.config.js` picks up all `*.spec.js` automatically.

## Test IDs

Tests reference IDs from the strategy (e.g., `T-CRYPTO-02`, `T-SYNC-05`). See `.sisyphus/plans/rebuild.md` for oracle rationale.

## Notes

- Playwright uses the bundled Chromium at `~/.cache/ms-playwright/` with `--no-sandbox` (container requirement).
- Unit tests run in Bun's native WebCrypto context — no browser needed.
- `sync.spec.js` hits the live DB. Each test generates a unique userId so tests don't stomp each other.
- `schema.spec.js` spins up a scratch DB (`mylibrary_schema_test`), loads `schema.sql`, verifies column types, then drops the DB. Requires the MariaDB socket at `/tmp/mysql.sock`.
- **T-BUN-DETAIL-16 is intentionally failing.** Bug: `computeDetailOwnership` throws `TypeError` when a tier item is missing `human_name` (calls `normalizeName(undefined)`). Test encodes the correct contract — turns green when the null-guard is added.
- T-ITCH-JS-01 (itch OAuth denial) is passing — fixed in Phase 3.
- `epic-behavior.spec.js` was written in a prior session and is no longer in the working tree. Schema regression coverage (T-SCHEMA-02, T-SCHEMA-03) now lives in `schema.spec.js`.
