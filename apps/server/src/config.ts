import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  webDir: string;
  /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). */
  apiDocs?: boolean;
}

// data/ at the repo root (git-ignored), resolved from this file so it doesn't depend on the working directory.
const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));
// The web app's production build (`yarn workspace @obs-producer/web build`).
const DEFAULT_WEB_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

// The prefix settings had before the rename to Rollcall (ADR-0016). A leftover old name would be silently ignored,
// so the server stops instead.
const OLD_PREFIX = 'OBS_PRODUCER_';

// Variables are prefixed because shells such as zsh set HOST to the machine name.
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const old = Object.keys(env)
    .filter((key) => key.startsWith(OLD_PREFIX) && env[key] !== undefined)
    .toSorted()[0];
  if (old) {
    throw new Error(
      `${old} was renamed to ROLLCALL_${old.slice(OLD_PREFIX.length)} (ADR-0016). Rename it and start again.`,
    );
  }
  const rawPort = env.ROLLCALL_PORT ?? '5580';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new Error(`ROLLCALL_PORT must be a whole number from 1 to 65535, got ${JSON.stringify(rawPort)}`);
  }
  return {
    host: env.ROLLCALL_HOST ?? '0.0.0.0',
    port,
    dataDir: env.ROLLCALL_DATA_DIR ? resolve(env.ROLLCALL_DATA_DIR) : DEFAULT_DATA_DIR,
    webDir: env.ROLLCALL_WEB_DIR ? resolve(env.ROLLCALL_WEB_DIR) : DEFAULT_WEB_DIR,
    apiDocs: parseSwitch('ROLLCALL_API_DOCS', env.ROLLCALL_API_DOCS),
  };
}

// On/off settings: 1 or true turn them on; 0, false, empty or unset leave them off. Anything else is probably a
// typo, so the server stops rather than guess.
function parseSwitch(name: string, raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '1' || value === 'true') return true;
  if (value === '' || value === '0' || value === 'false') return false;
  throw new Error(`${name} must be 1, true, 0 or false, got ${JSON.stringify(raw)}`);
}
