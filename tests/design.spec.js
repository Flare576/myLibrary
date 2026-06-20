const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';
const BUNDLES_PATTERN = '**/api/bundles';
const DETAIL_PATTERN = '**/api/bundles/*/detail';

async function loginNew(page) {
  await page.route(SYNC_PATTERN, route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Not found' }),
  }));
  await page.goto(BASE);
  await page.fill('#username', 'testuser');
  await page.fill('#passphrase', 'testpass');
  await page.click('#login-btn');
  await expect(page.locator('#authenticated-view')).toBeVisible();
}

async function injectSteamGames(page, games) {
  await page.evaluate((g) => {
    document.dispatchEvent(new CustomEvent('steam:connected', { detail: { games: g } }));
  }, games);
}

async function injectEpicGames(page, games) {
  await page.evaluate((g) => {
    document.dispatchEvent(new CustomEvent('epic:connected', { detail: { games: g, accountId: 'acct' } }));
  }, games);
}

test.describe('T-DESIGN: Phase 6 design requirements', () => {

  test('T-DESIGN-01: full-width layout — no horizontal scroll, main uses full 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));
    await page.goto(BASE);

    const { scrollWidth, mainWidth } = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      mainWidth: document.getElementById('app-container').clientWidth,
    }));

    // Oracle: no content overflows viewport; main fills full 1280px
    expect(scrollWidth).toBeLessThanOrEqual(1280);
    expect(mainWidth).toBe(1280);
  });

  test('T-DESIGN-02: login form centered — max-width <= 440px, auto-centered horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE);

    await expect(page.locator('#unauthenticated-view')).toBeVisible();

    const { maxWidth, marginLeft } = await page.evaluate(() => {
      const el = document.getElementById('unauthenticated-view');
      const cs = window.getComputedStyle(el);
      return {
        maxWidth: parseFloat(cs.maxWidth),
        marginLeft: parseFloat(cs.marginLeft),
      };
    });

    // Oracle: narrow login card (max-width: 400px in CSS), centered with auto margin
    expect(maxWidth).toBeLessThanOrEqual(440);
    // At 1280px viewport with max-width 400px, auto margin resolves to (1280-400)/2 = 440px
    expect(marginLeft).toBeGreaterThan(0);
  });

  test('T-DESIGN-03: nav tab bar is full-width header, height >= 44px (SteamDeck friendly)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginNew(page);

    const { width, height } = await page.evaluate(() => {
      const header = document.getElementById('app-header');
      const rect = header.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    // Oracle: header spans nearly full viewport (CSS width:100%), height:56px in CSS
    expect(width).toBeGreaterThanOrEqual(1000);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  test('T-DESIGN-04: library toolbar has search input, >= 4 filter chips, sort select', async ({ page }) => {
    await loginNew(page);

    // Oracle: all three toolbar controls are present and visible
    await expect(page.locator('#library-search')).toBeVisible();
    const chipCount = await page.locator('.filter-chip').count();
    expect(chipCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#library-sort')).toBeVisible();
  });

  test('T-DESIGN-05: platform filter — clicking Epic removes Steam cards from DOM', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Half-Life 2', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Portal', img_icon_url: '', playtime_forever: 0 },
    ]);
    await injectEpicGames(page, [
      { appid: 'AAA', name: 'Fortnite', platform: 'epic' },
    ]);

    await expect(page.locator('.game-card')).toHaveCount(3);

    await page.click('.filter-chip[data-platform="epic"]');

    const steamCount = await page.evaluate(() =>
      [...document.querySelectorAll('.game-card')].filter(c => c.dataset.platform === 'steam').length
    );
    const epicCount = await page.evaluate(() =>
      [...document.querySelectorAll('.game-card')].filter(c => c.dataset.platform === 'epic').length
    );

    // Oracle: Steam cards removed from DOM entirely; exactly 1 Epic card remains
    expect(steamCount).toBe(0);
    expect(epicCount).toBe(1);
  });

  test('T-DESIGN-06: search input filters games by name (debounced 150ms)', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Celeste', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Portal', img_icon_url: '', playtime_forever: 0 },
      { appid: 3, name: 'Half-Life 2', img_icon_url: '', playtime_forever: 0 },
    ]);

    await page.fill('#library-search', 'celeste');
    await page.waitForTimeout(300);

    // Oracle: only Celeste card visible; query is case-insensitive (value.toLowerCase())
    await expect(page.locator('.game-card')).toHaveCount(1);
    const text = await page.locator('.game-card').first().textContent();
    expect(text.toLowerCase()).toContain('celeste');
  });

  test('T-DESIGN-07: all visible tap targets are >= 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginNew(page);

    const violations = await page.evaluate(() => {
      const violations = [];
      ['button', 'input[type="search"]'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.offsetParent === null) return;
          const h = el.getBoundingClientRect().height;
          if (h > 0 && h < 44) {
            violations.push({ tag: el.tagName, id: el.id, className: el.className, height: h });
          }
        });
      });
      return violations;
    });

    // Oracle: CSS min-height: 44px on all buttons and search input
    expect(violations).toHaveLength(0);
  });

  test('T-DESIGN-08: bundle Details button is inside .bundle-card', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify([{
        name: 'Design Test Bundle',
        slug: 'design_test_bundle',
        url: 'https://www.humblebundle.com/games/design-test',
        end_date: '2099-12-31T18:00:00',
        start_date: '2026-06-01T18:00:00',
        category: 'bundle',
      }]),
    }));
    await page.goto(BASE);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-detail-btn');

    const btnIsInsideCard = await page.evaluate(() => {
      const btn = document.querySelector('.bundle-detail-btn');
      return btn?.closest('.bundle-card') !== null;
    });

    // Oracle: card.appendChild(detailBtn) in loadBundles — button is child of bundle-card anchor
    expect(btnIsInsideCard).toBe(true);
  });

  test('T-DESIGN-09: bundle ending in < 3 days gets .bundle-expiring-soon class', async ({ page }) => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endDate = tomorrow.toISOString().split('.')[0];

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify([{
        name: 'Expiring Bundle',
        slug: 'expiring_bundle',
        url: 'https://www.humblebundle.com/games/expiring',
        end_date: endDate,
        start_date: '2026-06-01T18:00:00',
        category: 'bundle',
      }]),
    }));
    await page.goto(BASE);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-end-date');

    // Oracle: if (daysLeft < 3) endDate.classList.add('bundle-expiring-soon')
    await expect(page.locator('.bundle-end-date')).toHaveClass(/bundle-expiring-soon/);
  });

  test('T-DESIGN-10: bundle ending in 30 days does NOT get .bundle-expiring-soon class', async ({ page }) => {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const endDate = thirtyDays.toISOString().split('.')[0];

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify([{
        name: 'Safe Bundle',
        slug: 'safe_bundle',
        url: 'https://www.humblebundle.com/games/safe',
        end_date: endDate,
        start_date: '2026-06-01T18:00:00',
        category: 'bundle',
      }]),
    }));
    await page.goto(BASE);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-end-date');

    // Oracle: 30 days → daysLeft = 30, not < 3 → no expiring-soon class
    await expect(page.locator('.bundle-end-date')).not.toHaveClass(/bundle-expiring-soon/);
  });

  test('T-DESIGN-11: Steam connect button hidden when Steam is connected', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Test Game', img_icon_url: '', playtime_forever: 0 },
    ]);

    // Oracle: steam:connected handler sets steamConnectBtn.style.display='none', steamLibrary.style.display=''
    await expect(page.locator('#steam-connect-btn')).toBeHidden();
    await expect(page.locator('#steam-library')).toBeVisible();
  });

  test('T-DESIGN-12: library grid renders game cards in CSS grid layout', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Game One', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Game Two', img_icon_url: '', playtime_forever: 0 },
    ]);

    await expect(page.locator('#library-grid .game-card')).toHaveCount(2);

    const gridTemplateColumns = await page.evaluate(() =>
      window.getComputedStyle(document.getElementById('library-grid')).gridTemplateColumns
    );

    // Oracle: #library-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)) }
    // Computed value resolves to actual column widths like "220px 220px ..."
    expect(gridTemplateColumns).not.toBe('');
    expect(gridTemplateColumns).not.toBe('none');
  });

  test('T-DESIGN-13: Steam game cards have platform-steam badge with text "Steam"', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Half-Life 2', img_icon_url: '', playtime_forever: 0 },
    ]);

    await expect(page.locator('.game-card[data-platform="steam"]')).toHaveCount(1);
    await expect(page.locator('.game-card[data-platform="steam"] .platform-steam')).toBeVisible();

    // Oracle: badge text = g.platform.charAt(0).toUpperCase() + g.platform.slice(1) → "Steam"
    const badgeText = await page.locator('.game-card[data-platform="steam"] .platform-badge').first().textContent();
    expect(badgeText.trim()).toBe('Steam');
  });

  test('T-DESIGN-14: Manage Platforms is a collapsible <details> element', async ({ page }) => {
    await loginNew(page);

    const tagName = await page.evaluate(() =>
      document.getElementById('manage-platforms').tagName
    );

    // Oracle: <details id="manage-platforms" open> in HTML — native browser collapse/expand
    expect(tagName).toBe('DETAILS');

    // Oracle: details is open by default, so steam connect button is accessible
    await expect(page.locator('#manage-platforms')).toBeVisible();
    await expect(page.locator('#steam-connect-btn')).toBeVisible();
  });

  test('T-DESIGN-15: bundle detail owned games visually distinct from unowned', async ({ page }) => {
    // Build an encrypted blob with Portal in Steam library.
    // When loadBundleDetail runs, authManager.getState() returns this state,
    // buildOwnedSet() finds "portal" (normalized), and Portal gets game-owned class.
    const SALT = 'ei-the-answer-is-42';
    const ITERATIONS = 310000;
    const USERNAME = 'designtest15';
    const PASSPHRASE = 'testpass';
    const STEAM_STATE = {
      steam: {
        steamId: '76561198000000001',
        games: [{ appid: 1, name: 'Portal', img_icon_url: '', playtime_forever: 10 }],
      },
      epic: null,
      itch: null,
      lastSync: { steam: new Date().toISOString() },
    };

    await page.goto('http://localhost:8181');

    const encryptedBlob = await page.evaluate(
      async ({ username, passphrase, salt, iterations, state }) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(username + ':' + passphrase), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          enc.encode(JSON.stringify(state))
        );
        const toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { iv: toBase64url(iv), ciphertext: toBase64url(ciphertext) };
      },
      { username: USERNAME, passphrase: PASSPHRASE, salt: SALT, iterations: ITERATIONS, state: STEAM_STATE }
    );

    // Bundle detail: Portal (owned via steam state) + Celeste (not in any library → unowned)
    const MOCK_DETAIL = {
      slug: 'design_bundle_15',
      tiers: [{
        price_label: 'Pay $1 to unlock!',
        items: [
          { human_name: 'Portal', msrp: 9.99 },
          { human_name: 'Celeste', msrp: 19.99 },
        ],
      }],
    };

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: JSON.stringify(encryptedBlob) }),
      headers: { ETag: '"design-15-etag"' },
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify([{
        name: 'Design Bundle 15',
        slug: 'design_bundle_15',
        url: 'https://www.humblebundle.com/games/design-15',
        end_date: '2099-12-31T18:00:00',
        start_date: '2026-06-01T18:00:00',
        category: 'bundle',
      }]),
    }));
    await page.route(DETAIL_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DETAIL),
    }));

    await page.goto('http://localhost:8181');
    await page.fill('#username', USERNAME);
    await page.fill('#passphrase', PASSPHRASE);
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-detail-btn');
    await page.locator('.bundle-detail-btn').first().click();
    await page.waitForSelector('#bundle-detail-content .bundle-game');

    // Oracle: Portal is in steam.games → buildOwnedSet finds it → computeDetailOwnership marks it owned
    const ownedGames = page.locator('.bundle-game[data-owned="true"]');
    const unownedGames = page.locator('.bundle-game[data-owned="false"]');

    await expect(ownedGames).toHaveCount(1);
    await expect(unownedGames).toHaveCount(1);

    // Oracle: gameEl.className = `bundle-game ${game.owned ? 'game-owned' : 'game-unowned'}`
    await expect(ownedGames).toHaveClass(/game-owned/);
    await expect(unownedGames).toHaveClass(/game-unowned/);

    // Oracle: .bundle-game.game-owned { border-left: 3px solid var(--color-success) } — visually distinct
    const ownedBorderWidth = await page.evaluate(() => {
      const el = document.querySelector('.bundle-game.game-owned');
      return parseFloat(window.getComputedStyle(el).borderLeftWidth);
    });
    expect(ownedBorderWidth).toBeGreaterThan(0);
  });

  test('T-DESIGN-16: dark mode applies dark body background via CSS custom properties', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));
    await page.goto(BASE);

    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);

    expect(bodyBg).toBe('rgb(15, 15, 19)');
  });

  test('T-DESIGN-17: game entry with no name — grid skips it and renders other games without throwing', async ({ page }) => {
    await loginNew(page);

    // Nameless entries are silently skipped at the push site — no blank cards in the grid.
    // Well-formed entries still render normally.
    await injectSteamGames(page, [
      { appid: 1, platform: 'steam' },                                       // no name — skipped
      { appid: 2, name: 'Portal', img_icon_url: '', playtime_forever: 0 },   // valid
    ]);

    // Oracle: only 1 card — nameless entry skipped, not rendered as blank card
    await expect(page.locator('#library-grid .game-card')).toHaveCount(1);
    // Oracle: the valid game card is present
    const names = await page.locator('#library-grid .game-card .game-name').allTextContents();
    expect(names).toContain('Portal');

    // Check no JS errors were thrown during render
    const errors = await page.evaluate(() =>
      window.__lastError ? window.__lastError.message : null
    );
    expect(errors).toBeNull();

    // Sub-case B: search active — must not throw and crash the grid.
    await page.fill('#library-search', 'portal');
    await page.waitForTimeout(300);

    // Oracle: Portal card still visible; grid did not blank out from a thrown exception
    await expect(page.locator('#library-grid .game-card')).toHaveCount(1);
    const filteredNames = await page.locator('#library-grid .game-card .game-name').allTextContents();
    expect(filteredNames).toContain('Portal');
  });

  test('T-DESIGN-18: sort A-Z produces alphabetically ordered game cards', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Zelda', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Celeste', img_icon_url: '', playtime_forever: 0 },
      { appid: 3, name: 'Alan Wake', img_icon_url: '', playtime_forever: 0 },
    ]);

    // Ensure A-Z sort is selected (it's the default, but be explicit)
    await page.selectOption('#library-sort', 'az');
    await page.waitForTimeout(50);

    const cardNames = await page.locator('#library-grid .game-card .game-name').allTextContents();
    // Oracle: localeCompare alphabetical order
    expect(cardNames).toEqual(['Alan Wake', 'Celeste', 'Zelda']);
  });

  test('T-DESIGN-19: steam:disconnected removes Steam games from library grid', async ({ page }) => {
    await loginNew(page);

    await injectSteamGames(page, [
      { appid: 1, name: 'Portal', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Half-Life 2', img_icon_url: '', playtime_forever: 0 },
    ]);
    await expect(page.locator('#library-grid .game-card')).toHaveCount(2);

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('steam:disconnected'));
    });

    // Oracle: auth handler filters allGames by platform !== 'steam' then rebuilds grid
    await expect(page.locator('#library-grid .game-card')).toHaveCount(0);
  });

  test('T-DESIGN-20: search + platform filter combined shows only matching-platform AND matching-name cards', async ({ page }) => {
    await loginNew(page);

    // Steam: Celeste + Portal. Epic: Celeste.
    // Filter=Epic + search="celeste" → only 1 card (Epic Celeste).
    await injectSteamGames(page, [
      { appid: 1, name: 'Celeste', img_icon_url: '', playtime_forever: 0 },
      { appid: 2, name: 'Portal', img_icon_url: '', playtime_forever: 0 },
    ]);
    await injectEpicGames(page, [
      { appid: 'AAA', name: 'Celeste', platform: 'epic' },
    ]);

    await expect(page.locator('#library-grid .game-card')).toHaveCount(3);

    // Apply Epic filter
    await page.click('.filter-chip[data-platform="epic"]');
    // Apply search
    await page.fill('#library-search', 'celeste');
    await page.waitForTimeout(300);

    // Oracle: 1 card only — Epic Celeste. Steam Celeste excluded by platform filter.
    await expect(page.locator('#library-grid .game-card')).toHaveCount(1);

    const platform = await page.locator('#library-grid .game-card').first().getAttribute('data-platform');
    expect(platform).toBe('epic');

    const name = await page.locator('#library-grid .game-card .game-name').first().textContent();
    expect(name.trim()).toBe('Celeste');
  });

});
