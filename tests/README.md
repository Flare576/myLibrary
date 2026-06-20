# Tests

189 tests across 16 files (189 passing). Two runners: **Bun** (unit) and **Playwright** (integration + browser).

## Quick start

```bash
npm test                   # everything (189 tests)
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
| `itch-behavior.spec.js` | Playwright | 10 | `js/itch.js` + `index.html` — hash callback, token forwarding, connect/disconnect, saveState failure, error, empty library, OAuth denial |
| `bundles.spec.js` | Playwright | 14 | `api/bundles.php` + `index.html` Bundle Browser — API shape, cache HIT, field validation, 405 guard, DB expires_at, tab switching, card rendering, Humble outbound link, ownership placeholder, logout reset, API error display, empty response |
| `bundles-detail.test.js` | Bun | 16 | `js/bundles.js` — computeDetailOwnership (15 cases) + T-BUN-DETAIL-16 null-guard regression (passes — bug fixed in Phase 5) |
| `bundles-detail.spec.js` | Playwright | 14 | `api/bundles/detail.php` + `index.html` detail panel — API shape, cache HIT, field types, 405/404, panel UI, summary, back button, error, data-owned attr, end-to-end ownership (T-DETAIL-13/14) |
| `design.spec.js` | Playwright | 20 | Phase 6 design — full-width layout, login centering, nav header, search/filter/sort, platform filtering, tap targets, bundle card structure, urgency indicator, connect button visibility, CSS grid, platform badges, manage-platforms details, owned/unowned visual, dark mode, sort A-Z, disconnect clears grid, search+filter combined, nameless-game crash |

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
- `epic-behavior.spec.js` was written in a prior session and is no longer in the working tree. Schema regression coverage lives in `schema.spec.js`.
- **T-DESIGN-17** previously tracked a known failing test (nameless-game crash bug). Fixed — all 189 tests pass.
- T-BUN-DETAIL-16 and T-ITCH-JS-01 are both passing — bugs fixed in Phase 5 and Phase 3 respectively.
