# Tests

85 tests across 11 files (84 passing, 1 known-failing). Two runners: **Bun** (unit) and **Playwright** (integration + browser).

## Quick start

```bash
npm test                   # everything (85 tests — expect 1 known failure: T-ITCH-JS-01)
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
| `sync.spec.js` | Playwright | 9 | `api/sync.php` — HTTP round-trips, ETag enforcement, validation, injection |
| `browser.spec.js` | Playwright | 18 | `index.html` — auth state machine, error display, logout, Steam + Epic + itch UI state |
| `steam.spec.js` | Playwright | 8 | `api/steam/*` — init redirect shape, callback rejection, games validation |
| `epic.spec.js` | Playwright | 6 | `api/epic/exchange.php` — input validation, method guard, Epic error forwarding |
| `schema.spec.js` | Playwright | 1 | `db/schema.sql` live regression — user_blobs MEDIUMTEXT (>64KB blobs) |
| `session.spec.js` | Playwright | 3 | `index.html` SessionStore — auto-login, logout clears, stale creds graceful |
| `epic-behavior.spec.js` | Playwright | 6 | `js/epic.js` + `index.html` — connect flow, state shape, error paths, reload, empty library |
| `itch.spec.js` | Playwright | 11 | `api/itch/*` — init redirect, callback HTML, library.php validation (method guard, missing token, bad token), base tag injection |
| `itch-behavior.spec.js` | Playwright | 10 | `js/itch.js` + `index.html` — hash callback, token forwarding, connect/disconnect, saveState failure, error, empty library, OAuth denial (1 known-failing: T-ITCH-JS-01) |

## Adding tests for a new phase

**Unit tests** (`*.test.js`): add the filename to `test:unit` and `test` in `package.json`.

**Playwright tests** (`*.spec.js`): just create the file — `playwright.config.js` picks up all `*.spec.js` automatically.

## Test IDs

Tests reference IDs from the strategy (e.g., `T-CRYPTO-02`, `T-SYNC-05`). See `.sisyphus/plans/rebuild.md` for oracle rationale.

## Notes

- Playwright uses the bundled Chromium at `~/.cache/ms-playwright/` with `--no-sandbox` (container requirement).
- Unit tests run in Bun's native WebCrypto context — no browser needed.
- `sync.spec.js` hits the live DB. Each test generates a unique userId so tests don't stomp each other.
- `epic-behavior.spec.js` tests T-SCHEMA-02 by spinning up a scratch DB (`mylibrary_schema_test`), loading `schema.sql`, verifying the column type, then dropping the DB. Requires the MariaDB socket at `/tmp/mysql.sock`.
- **T-ITCH-JS-01 is intentionally failing.** It documents a known bug: itch.io OAuth denial (`#error=access_denied`) is silently swallowed — no error shown, URL not cleaned. The test encodes the correct contract so it turns green automatically when the bug is fixed.
