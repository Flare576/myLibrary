/**
 * steam.js — Steam integration for MyLibrary Phase 1
 *
 * Handles Steam OpenID connect flow, game library fetching, and storing the
 * result in the user's encrypted blob via AuthManager. No UI logic lives here —
 * only data and network concerns.
 *
 * Flow:
 *   1. connectSteam()     → redirect to /api/steam/init (server starts OpenID)
 *   2. Server redirects back with ?steam_connected=1&steamid=...
 *   3. handleCallback()   → detect params, fetch games, persist to blob, clean URL
 */

const STEAM_GAMES_API = (typeof window !== 'undefined' && window.APP_BASE || '') + '/api/steam/games';
const STEAMID_RE = /^\d{17}$/;

class SteamManager {
  /**
   * Begin the Steam OpenID connect flow.
   * Navigates away — server handles the rest and redirects back.
   */
  connectSteam() {
    window.location.href = (typeof window !== 'undefined' && window.APP_BASE || '') + '/api/steam/init';
  }

  /**
   * Detect a Steam callback in the current URL and process it.
   *
   * Call this on every page load (before rendering). Returns early with null
   * if the URL does not contain `steam_connected=1`.
   *
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<{ steamId: string, games: object[] } | null>}
   */
  async handleCallback(authManager) {
    const params = new URLSearchParams(window.location.search);

    if (params.get('steam_connected') !== '1') {
      return null;
    }

    const cleanUrl = () => window.history.replaceState({}, document.title, '/');

    try {
      const steamId = params.get('steamid') ?? '';

      if (!STEAMID_RE.test(steamId)) {
        cleanUrl();
        return null;
      }

      const games = await this.fetchGames(steamId);

      const state = JSON.parse(JSON.stringify(authManager.getState()));
      state.steam = { steamId, games };
      state.lastSync = state.lastSync ?? {};
      state.lastSync.steam = new Date().toISOString();

      await authManager.saveState(state);

      cleanUrl();

      document.dispatchEvent(
        new CustomEvent('steam:connected', { detail: { steamId, games } })
      );

      return { steamId, games };
    } catch (err) {
      document.dispatchEvent(
        new CustomEvent('steam:error', { detail: { message: err.message } })
      );
      cleanUrl();
      return null;
    }
  }

  /**
   * Fetch the Steam game library for a given Steam ID.
   *
   * @param {string} steamId - 17-digit numeric Steam ID
   * @returns {Promise<object[]>} Array of game objects from the server
   * @throws {Error} On non-200 response or network failure
   */
  async fetchGames(steamId) {
    const url = `${STEAM_GAMES_API}?steamid=${encodeURIComponent(steamId)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Steam games fetch failed: ${response.status}`);
    }

    const body = await response.json();
    return body.games;
  }

  /**
   * Remove Steam data from the encrypted blob and dispatch `steam:disconnected`.
   *
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<void>}
   */
  async disconnectSteam(authManager) {
    const state = authManager.getState();
    state.steam = null;
    if (state.lastSync) {
      delete state.lastSync.steam;
    }

    await authManager.saveState(state);

    document.dispatchEvent(new CustomEvent('steam:disconnected'));
  }
}

export const steamManager = new SteamManager();
export { SteamManager };
export default steamManager;
