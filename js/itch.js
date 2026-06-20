/**
 * itch.js — itch.io integration for MyLibrary Phase 3
 *
 * Handles itch.io implicit OAuth flow: the server redirects the user to itch,
 * itch returns with `#access_token=...` in the URL hash, and this module fetches
 * the owned games directly from itch.io before storing them in the encrypted
 * blob via AuthManager. No UI logic lives here — only data and network concerns.
 */

const ITCH_INIT_URL = (window.APP_BASE ?? '') + '/api/itch/init';

/**
 * Convert an itch.io owned-keys response into MyLibrary game entries.
 *
 * Empty libraries come back as `{}` rather than `[]`, so callers must tolerate
 * missing `owned_keys`.
 *
 * @param {any} body
 * @returns {{ appid: number, name: string, platform: 'itch' }[]}
 */
function parseItchResponse(body) {
  if (!body || !body.owned_keys) {
    return [];
  }

  return body.owned_keys
    .map((entry) => entry?.game)
    .filter((game) => game && game.id !== undefined && game.title)
    .map((game) => ({
      appid: game.id,
      name: game.title,
      platform: 'itch',
    }));
}

class ItchManager {
  /**
   * Return the itch.io initiation URL.
   *
   * @returns {string}
   */
  getRedirectUrl() {
    return ITCH_INIT_URL;
  }

  /**
   * Detect an itch.io callback in the current URL and process it.
   *
   * Reads `window.location.hash` for `#access_token=...`, fetches the user's
   * library, stores it in the encrypted blob, then cleans the URL.
   *
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<{ token: string, games: object[] } | null>}
   */
  async handleCallback(authManager) {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }

    const cleanUrl = () => {
      if (window.history?.replaceState) {
        window.history.replaceState({}, document.title, '/');
      }
    };

    try {
      const hash = window.location.hash ?? '';
      if (!hash.startsWith('#')) {
        return null;
      }

      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token') ?? '';
      const error = params.get('error') ?? '';

      if (error) {
        cleanUrl();
        document.dispatchEvent(
          new CustomEvent('itch:error', { detail: { message: `itch.io auth denied: ${error}` } })
        );
        return null;
      }

      if (!token) {
        return null;
      }

      const games = await this.fetchLibrary(token);

      const state = JSON.parse(JSON.stringify(authManager.getState()));
      state.itch = { token, games };
      state.lastSync = state.lastSync ?? {};
      state.lastSync.itch = new Date().toISOString();

      await authManager.saveState(state);

      cleanUrl();

      document.dispatchEvent(
        new CustomEvent('itch:connected', { detail: { token, games } })
      );

      return { token, games };
    } catch (err) {
      cleanUrl();
      document.dispatchEvent(
        new CustomEvent('itch:error', { detail: { message: err?.message ?? 'Unknown error' } })
      );
      return null;
    }
  }

  /**
   * Fetch the itch.io owned games library via the server-side proxy.
   *
   * @param {string} token
   * @returns {Promise<object[]>}
   */
  async fetchLibrary(token) {
    const response = await fetch('/api/itch/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `itch.io library fetch failed: ${response.status}`);
    }

    const { games } = await response.json();
    return games ?? [];
  }

  /**
   * Remove itch.io data from the encrypted blob and dispatch `itch:disconnected`.
   *
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<void>}
   */
  async disconnectItch(authManager) {
    const state = JSON.parse(JSON.stringify(authManager.getState()));
    state.itch = null;
    state.lastSync = state.lastSync ?? {};
    delete state.lastSync.itch;

    await authManager.saveState(state);

    document.dispatchEvent(new CustomEvent('itch:disconnected'));
  }
}

export const itchManager = new ItchManager();
export { ItchManager, parseItchResponse };
export default itchManager;
