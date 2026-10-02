import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// argon2id with OWASP's recommended minimum settings, via Node's built-in crypto.argon2 (Node ≥ 24.7).
// Hashes are stored as PHC strings so the settings travel with each hash and can be raised later.
interface Argon2Settings {
  memory: number; // KiB
  passes: number;
  parallelism: number;
  tagLength: number;
}

const SETTINGS: Argon2Settings = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const SALT_BYTES = 16;
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function derive(password: string, salt: Buffer, settings: Argon2Settings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...settings }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

const encode = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, SETTINGS);
  const { memory, passes, parallelism } = SETTINGS;
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, memory = '', passes = '', parallelism = '', salt = '', hash = ''] = match;
  const expected = Buffer.from(hash, 'base64');
  try {
    const actual = await derive(password, Buffer.from(salt, 'base64'), {
      memory: Number(memory),
      passes: Number(passes),
      parallelism: Number(parallelism),
      tagLength: expected.length,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Verified against when a username doesn't exist, so a failed login takes the same time either way.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('hex'));
  return dummy;
}

// No look-alike characters (0/O, 1/l/I), so it can be read out or typed by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 20): string {
  return Array.from({ length }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join('');
}
