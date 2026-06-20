import { generateUserId, encrypt, decrypt } from './crypto.js';

const SYNC_API = (window.APP_BASE ?? '') + '/api/sync/';

const EMPTY_STATE = () => ({
  steam: null,
  epic: null,
  itch: null,
  lastSync: {},
});

class AuthManager {
  #creds  = null;   // { username, passphrase } — in-memory only, never persisted
  #userId = null;   // derived from username+passphrase — in-memory only
  #state  = null;
  #etag   = null;   // last known ETag from server — used for concurrency control on save

  isAuthenticated() {
    return this.#userId !== null && this.#state !== null;
  }

  async login(username, passphrase) {
    const creds  = { username, passphrase };
    const userId = await generateUserId(creds);

    const response = await fetch(`${SYNC_API}${userId}`);

    let state;

    if (response.status === 404) {
      state = EMPTY_STATE();
      this.#etag = null;
    } else if (response.status === 200) {
      this.#etag = response.headers.get('ETag')?.replace(/^"|"$/g, '') ?? null;

      const responseData = await response.json();
      const { iv, ciphertext } = JSON.parse(responseData.data);

      let decrypted;
      try {
        decrypted = await decrypt({ iv, ciphertext }, creds);
      } catch (_e) {
        throw new Error('Invalid credentials');
      }

      state = JSON.parse(decrypted);
    } else {
      throw new Error(`Unexpected server response: ${response.status}`);
    }

    this.#creds  = creds;
    this.#userId = userId;
    this.#state  = state;

    document.dispatchEvent(
      new CustomEvent('auth:login', { detail: { state, userId, username } })
    );

    return state;
  }

  logout() {
    this.#creds  = null;
    this.#userId = null;
    this.#state  = null;
    this.#etag   = null;

    document.dispatchEvent(new CustomEvent('auth:logout'));
  }

  getState() {
    return this.#state;
  }

  async saveState(state) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const json = JSON.stringify(state);
    const { iv, ciphertext } = await encrypt(json, this.#creds);
    const data = JSON.stringify({ iv, ciphertext });

    const headers = { 'Content-Type': 'application/json' };
    if (this.#etag !== null) {
      headers['If-Match'] = `"${this.#etag}"`;
    }

    const response = await fetch(`${SYNC_API}${this.#userId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save state: ${response.status}`);
    }

    this.#state = state;
    this.#etag  = response.headers.get('ETag')?.replace(/^"|"$/g, '') ?? null;

    return this.#etag;
  }
}

export const authManager = new AuthManager();
export { AuthManager };
export default authManager;
