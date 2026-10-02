import { describe, expect, it } from 'vitest';
import { dummyHash, generateTemporaryPassword, hashPassword, verifyPassword } from './passwords.ts';

describe('hashPassword', () => {
  it('produces an argon2id PHC string that carries its settings', async () => {
    expect(await hashPassword('correct horse')).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('Correct horse', stored)).toBe(false);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    const badHashes = ['', 'plain', '$argon2i$v=19$m=1,t=1,p=1$AAAA$AAAA', '$argon2id$v=19$m=x,t=2,p=1$AA$AA'];
    const results = await Promise.all(badHashes.map((bad) => verifyPassword('anything', bad)));
    results.forEach((result, index) => {
      expect(result, badHashes[index]).toBe(false);
    });
  });

  it('returns false for a well-formed hash with impossible parameters', async () => {
    expect(await verifyPassword('anything', '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$A')).toBe(false);
    expect(
      await verifyPassword(
        'anything',
        '$argon2id$v=19$m=1,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).toBe(false);
  });
});

describe('dummyHash', () => {
  it('is a real hash that matches no password a user could send', async () => {
    const hash = await dummyHash();
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await dummyHash()).toBe(hash); // computed once
    expect(await verifyPassword('', hash)).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('is 20 characters from an alphabet without look-alikes', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(20);
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it('differs every time', () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
