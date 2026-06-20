import { describe, it, expect } from 'bun:test';
import { deriveKey, generateUserId, encrypt, decrypt } from '../js/crypto.js';

const CREDS_A = { username: 'alice', passphrase: 'hunter2' };
const CREDS_B = { username: 'alice', passphrase: 'different' };
const CREDS_C = { username: 'bob',   passphrase: 'hunter2' };

describe('generateUserId', () => {
  it('T-CRYPTO-02: is stable across calls', async () => {
    const [a, b, c] = await Promise.all([
      generateUserId(CREDS_A),
      generateUserId(CREDS_A),
      generateUserId(CREDS_A),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('T-CRYPTO-03: differs for different passphrase', async () => {
    const [a, b] = await Promise.all([generateUserId(CREDS_A), generateUserId(CREDS_B)]);
    expect(a).not.toBe(b);
  });

  it('T-CRYPTO-03: differs for different username', async () => {
    const [a, c] = await Promise.all([generateUserId(CREDS_A), generateUserId(CREDS_C)]);
    expect(a).not.toBe(c);
  });

  it('T-CRYPTO-06: output contains no base64 padding or non-URL-safe chars', async () => {
    const id = await generateUserId(CREDS_A);
    expect(id).not.toMatch(/[=+/]/);
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('encrypt / decrypt', () => {
  it('T-CRYPTO-04: round-trips a simple string', async () => {
    const plaintext = '{"steam":null,"epic":null}';
    const enc = await encrypt(plaintext, CREDS_A);
    const dec = await decrypt(enc, CREDS_A);
    expect(dec).toBe(plaintext);
  });

  it('T-CRYPTO-05: wrong credentials throw on decrypt', async () => {
    const enc = await encrypt('secret', CREDS_A);
    await expect(decrypt(enc, CREDS_B)).rejects.toThrow();
  });

  it('T-CRYPTO-06: encrypt output iv and ciphertext are URL-safe base64', async () => {
    const { iv, ciphertext } = await encrypt('test', CREDS_A);
    expect(iv).not.toMatch(/[=+/]/);
    expect(ciphertext).not.toMatch(/[=+/]/);
  });

  it('T-CRYPTO-01: same credentials always produce the same userId (key determinism via behavior)', async () => {
    const plaintext = 'determinism-check';
    const enc1 = await encrypt(plaintext, CREDS_A);
    const enc2 = await encrypt(plaintext, CREDS_A);
    const dec1 = await decrypt(enc1, CREDS_A);
    const dec2 = await decrypt(enc2, CREDS_A);
    expect(dec1).toBe(plaintext);
    expect(dec2).toBe(plaintext);
    expect(await decrypt(enc1, CREDS_A)).toBe(await decrypt(enc2, CREDS_A));
  });

  it('T-CRYPTO-07: round-trips a large payload (~50KB)', async () => {
    const large = JSON.stringify({ games: Array.from({ length: 600 }, (_, i) => ({
      appid: i,
      name: `Game Title Number ${i} with some extra words to pad it out`,
      playtime_forever: i * 10,
    })) });
    expect(large.length).toBeGreaterThan(40_000);

    const enc = await encrypt(large, CREDS_A);
    const dec = await decrypt(enc, CREDS_A);
    expect(dec).toBe(large);
  });

  it('encrypt uses a random IV each call (ciphertexts differ for same input)', async () => {
    const enc1 = await encrypt('same input', CREDS_A);
    const enc2 = await encrypt('same input', CREDS_A);
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });
});
