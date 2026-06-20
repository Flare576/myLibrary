import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { encrypt } from '../js/crypto.js';

globalThis.document = new EventTarget();

const { AuthManager } = await import('../js/auth.js');

const CREDS = { username: 'testuser', passphrase: 'testpass' };

function makeEncryptedBlob(state) {
  return encrypt(JSON.stringify(state), CREDS);
}

function mockFetch(status, body = null, headers = {}) {
  globalThis.fetch = mock(async () => ({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  }));
}

describe('AuthManager.login', () => {
  let auth;
  beforeEach(() => { auth = new AuthManager(); });

  it('T-AUTH-01: 404 → resolves with empty state, isAuthenticated true', async () => {
    mockFetch(404);
    const state = await auth.login(CREDS.username, CREDS.passphrase);
    expect(state).toEqual({ steam: null, epic: null, itch: null, lastSync: {} });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getState()).toEqual(state);
  });

  it('T-AUTH-02: 200 → decrypts and returns stored state', async () => {
    const stored = { steam: { steamId: '12345', games: [{ appid: 1, name: 'Portal' }] }, epic: null, itch: null, lastSync: {} };
    const { iv, ciphertext } = await makeEncryptedBlob(stored);
    mockFetch(200, { data: JSON.stringify({ iv, ciphertext }) }, { etag: '"abc123"' });

    const state = await auth.login(CREDS.username, CREDS.passphrase);
    expect(state).toEqual(stored);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('T-AUTH-03: wrong credentials → throws "Invalid credentials"', async () => {
    const { iv, ciphertext } = await makeEncryptedBlob({ steam: null });
    mockFetch(200, { data: JSON.stringify({ iv, ciphertext }) }, { etag: '"abc123"' });

    const wrongAuth = new AuthManager();
    await expect(
      wrongAuth.login('testuser', 'wrongpassphrase')
    ).rejects.toThrow('Invalid credentials');
    expect(wrongAuth.isAuthenticated()).toBe(false);
  });

  it('T-AUTH-04: 500 → throws "Unexpected server response: 500"', async () => {
    mockFetch(500);
    await expect(auth.login(CREDS.username, CREDS.passphrase)).rejects.toThrow(
      'Unexpected server response: 500'
    );
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('T-AUTH-02: dispatches auth:login event with username and state', async () => {
    mockFetch(404);
    let eventFired = false;
    document.addEventListener('auth:login', (e) => {
      eventFired = true;
      expect(e.detail.username).toBe(CREDS.username);
      expect(e.detail.state).toEqual({ steam: null, epic: null, itch: null, lastSync: {} });
    }, { once: true });
    await auth.login(CREDS.username, CREDS.passphrase);
    expect(eventFired).toBe(true);
  });
});

describe('AuthManager.saveState', () => {
  let auth;
  beforeEach(() => { auth = new AuthManager(); });

  it('T-AUTH-09: throws "Not authenticated" before login', async () => {
    await expect(auth.saveState({ steam: null })).rejects.toThrow('Not authenticated');
  });

  it('T-AUTH-05: first save (new user) sends no If-Match header', async () => {
    mockFetch(404);
    await auth.login(CREDS.username, CREDS.passphrase);

    const calls = [];
    globalThis.fetch = mock(async (url, opts) => {
      calls.push(opts);
      return { ok: true, status: 200, headers: { get: () => '"newetag"' }, json: async () => ({}) };
    });

    await auth.saveState({ steam: null, epic: null, itch: null, lastSync: {} });
    expect(calls[0].headers['If-Match']).toBeUndefined();
  });

  it('T-AUTH-06: second save sends If-Match with ETag from login', async () => {
    const { iv, ciphertext } = await makeEncryptedBlob({ steam: null, epic: null, itch: null, lastSync: {} });
    mockFetch(200, { data: JSON.stringify({ iv, ciphertext }) }, { etag: '"login-etag"' });
    await auth.login(CREDS.username, CREDS.passphrase);

    const calls = [];
    globalThis.fetch = mock(async (url, opts) => {
      calls.push(opts);
      return { ok: true, status: 200, headers: { get: () => '"save-etag"' }, json: async () => ({}) };
    });

    await auth.saveState({ steam: null, epic: null, itch: null, lastSync: {} });
    expect(calls[0].headers['If-Match']).toBe('"login-etag"');
  });

  it('T-AUTH-07: subsequent save uses ETag from previous save response', async () => {
    mockFetch(404);
    await auth.login(CREDS.username, CREDS.passphrase);

    const calls = [];
    let callCount = 0;
    globalThis.fetch = mock(async (url, opts) => {
      calls.push(opts);
      callCount++;
      const etag = callCount === 1 ? '"first-save-etag"' : '"second-save-etag"';
      return { ok: true, status: 200, headers: { get: () => etag }, json: async () => ({}) };
    });

    await auth.saveState({ steam: null, epic: null, itch: null, lastSync: {} });
    await auth.saveState({ steam: null, epic: null, itch: null, lastSync: {} });

    expect(calls[0].headers['If-Match']).toBeUndefined();
    expect(calls[1].headers['If-Match']).toBe('"first-save-etag"');
  });
});

describe('AuthManager.logout', () => {
  it('T-AUTH-08: clears state, marks unauthenticated, fires auth:logout', async () => {
    const auth = new AuthManager();
    mockFetch(404);
    await auth.login(CREDS.username, CREDS.passphrase);
    expect(auth.isAuthenticated()).toBe(true);

    let logoutFired = false;
    document.addEventListener('auth:logout', () => { logoutFired = true; }, { once: true });

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getState()).toBeNull();
    expect(logoutFired).toBe(true);
  });
});
