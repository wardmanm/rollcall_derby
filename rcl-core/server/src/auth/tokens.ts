import { createHash, randomBytes } from 'node:crypto';

// Secrets handed to a browser or a device (session tokens, API keys): 32 random bytes, and only their SHA-256 is
// ever stored.
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
