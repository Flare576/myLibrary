/**
 * epic.js — Epic Games integration for MyLibrary Phase 2
 *
 * Handles the Epic authorization code flow: user visits the Epic redirect URL,
 * copies the authorizationCode JSON value, pastes it into the UI, and this
 * module exchanges it for tokens + library via our server proxy. No UI logic
 * lives here — only data and network concerns.
 *
 * Flow:
 *   1. getRedirectUrl()  → direct user to Epic's code-grant endpoint (new tab)
 *   2. User copies authorizationCode from Epic's JSON response page
 *   3. connectEpic(code) → POST to /api/epic/exchange, store tokens+games in blob
 */

const EPIC_EXCHANGE_API = '/api/epic/exchange';
const EPIC_REDIRECT_URL =
  'https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code';

class EpicManager {
  /**
   * Return the Epic authorization URL.
   * Direct the user here (new tab) to obtain an authorizationCode.
   *
   * @returns {string} Epic redirect URL
   */
  getRedirectUrl() {
    return EPIC_REDIRECT_URL;
  }

  /**
   * Exchange an Epic authorization code for tokens + game library.
   *
   * POSTs the code to /api/epic/exchange. The server exchanges it for tokens,
   * fetches the library, and returns everything in one response. The client
   * stores tokens and games in the encrypted blob — the server never sees them
   * again after the exchange response.
   *
   * @param {string} code - Epic authorizationCode from the redirect page JSON
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<{ games: object[], accountId: string } | null>}
   */
  async connectEpic(code, authManager) {
    if (!code || typeof code !== 'string') {
      document.dispatchEvent(
        new CustomEvent('epic:error', { detail: { message: 'Authorization code is required' } })
      );
      return null;
    }

    try {
      const response = await fetch(EPIC_EXCHANGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error ?? `Exchange failed: ${response.status}`;
        document.dispatchEvent(
          new CustomEvent('epic:error', { detail: { message } })
        );
        return null;
      }

      const { access_token, refresh_token, account_id, expires_in, games } =
        await response.json();

      const state = JSON.parse(JSON.stringify(authManager.getState()));
      state.epic = {
        accessToken: access_token,
        refreshToken: refresh_token,
        accountId: account_id,
        expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
        games,
      };
      state.lastSync = state.lastSync ?? {};
      state.lastSync.epic = new Date().toISOString();

      await authManager.saveState(state);

      document.dispatchEvent(
        new CustomEvent('epic:connected', { detail: { games, accountId: account_id } })
      );

      return { games, accountId: account_id };
    } catch (err) {
      document.dispatchEvent(
        new CustomEvent('epic:error', { detail: { message: err.message } })
      );
      return null;
    }
  }

  /**
   * Remove Epic data from the encrypted blob and dispatch `epic:disconnected`.
   *
   * @param {import('./auth.js').AuthManager} authManager
   * @returns {Promise<void>}
   */
  async disconnectEpic(authManager) {
    const state = JSON.parse(JSON.stringify(authManager.getState()));
    state.epic = null;
    if (state.lastSync) {
      delete state.lastSync.epic;
    }

    await authManager.saveState(state);

    document.dispatchEvent(new CustomEvent('epic:disconnected'));
  }
}

export const epicManager = new EpicManager();
export { EpicManager };
export default epicManager;
