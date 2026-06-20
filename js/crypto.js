/**
 * crypto.js — WebCrypto AES-GCM encryption module for MyLibrary
 *
 * Uses PBKDF2-SHA256 (310,000 iterations) to derive a per-user AES-GCM-256
 * key from a username + passphrase pair. All functions are async and return
 * Promises. No Node.js crypto, no build step, no npm dependencies.
 */

const PBKDF2_ITERATIONS = 310000;
const SALT = new TextEncoder().encode('ei-the-answer-is-42');
const ID_PLAINTEXT = 'the_answer_is_42';

function toBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunked to avoid stack overflow on large buffers (spread hits arg limit ~65k)
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64Url(str) {
  // Restore standard base64 padding so atob() is happy
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/**
 * Derive an AES-GCM-256 CryptoKey from the given credentials using PBKDF2-SHA256.
 *
 * @param {{ username: string, passphrase: string }} credentials
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(credentials) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${credentials.username}:${credentials.passphrase}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a deterministic, URL-safe base64 user ID from credentials.
 *
 * Encrypts the sentinel string `"the_answer_is_42"` with an all-zeros IV so
 * the same credentials always produce the same output. Safe to use as a
 * stable user identifier (not a password hash — never store the plaintext).
 *
 * @param {{ username: string, passphrase: string }} credentials
 * @returns {Promise<string>} URL-safe base64 string with no padding
 */
export async function generateUserId(credentials) {
  const key = await deriveKey(credentials);
  const iv = new Uint8Array(12); // all zeros — deterministic
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(ID_PLAINTEXT)
  );
  return toBase64Url(ciphertext);
}

/**
 * Encrypt a string using AES-GCM-256 with a random 12-byte IV.
 *
 * @param {string} data - Plaintext string to encrypt
 * @param {{ username: string, passphrase: string }} credentials
 * @returns {Promise<{ iv: string, ciphertext: string }>} Both values are URL-safe base64
 */
export async function encrypt(data, credentials) {
  const key = await deriveKey(credentials);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  );
  return {
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
  };
}

/**
 * Decrypt a payload produced by `encrypt()`.
 *
 * @param {{ iv: string, ciphertext: string }} payload - URL-safe base64 strings
 * @param {{ username: string, passphrase: string }} credentials
 * @returns {Promise<string>} Original plaintext string
 */
export async function decrypt(payload, credentials) {
  const key = await deriveKey(credentials);
  const iv = fromBase64Url(payload.iv);
  const ciphertext = fromBase64Url(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
