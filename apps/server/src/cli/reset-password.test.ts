import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { createSession, findSession } from '../auth/sessions.ts';
import { findUserForLogin } from '../auth/users.ts';
import { addUser } from '../testing.ts';
import { runResetPassword, USAGE } from './reset-password.ts';

let dataDir: string | undefined;
afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

// A data directory holding one Admin who is signed in somewhere.
async function seed() {
  const dir = mkdtempSync(join(tmpdir(), 'op-reset-'));
  dataDir = dir;
  const { db, sqlite } = openDatabase(dir);
  const user = await addUser(db, 'admin', 'forgotten password', 'admin');
  const { token } = createSession(db, user.id);
  sqlite.close();
  return { dir, token };
}

async function run(args: string[], dir: string) {
  const lines: string[] = [];
  const code = await runResetPassword(args, { dataDir: dir, print: (line) => lines.push(line) });
  return { code, lines };
}

describe('reset-password', () => {
  it('prints a temporary password, forces a change and signs the user out', async () => {
    const { dir, token } = await seed();
    const { code, lines } = await run([' Admin '], dir);
    expect(code).toBe(0);
    const temporaryPassword = /^Temporary password for admin: ([A-Za-z0-9]{20})$/.exec(lines[0] ?? '')?.[1];
    expect(temporaryPassword).toBeDefined();

    const { db, sqlite } = openDatabase(dir);
    const user = findUserForLogin(db, 'admin');
    const session = findSession(db, token);
    sqlite.close();
    expect(user?.mustChangePassword).toBe(true);
    expect(await verifyPassword(temporaryPassword ?? '', user?.passwordHash ?? '')).toBe(true);
    expect(session).toBeNull();
  });

  it('reports an unknown user', async () => {
    const { dir } = await seed();
    expect(await run(['nobody'], dir)).toEqual({ code: 1, lines: ['No user named "nobody".'] });
  });

  it('explains how to call it', async () => {
    const { dir } = await seed();
    expect(await run([], dir)).toEqual({ code: 2, lines: [USAGE] });
    expect(await run(['admin', 'extra'], dir)).toEqual({ code: 2, lines: [USAGE] });
  });

  it('runs as a script against OBS_PRODUCER_DATA_DIR', async () => {
    const { dir } = await seed();
    const script = fileURLToPath(new URL('reset-password.ts', import.meta.url));
    const output = execFileSync(process.execPath, [script, 'admin'], {
      env: { ...process.env, OBS_PRODUCER_DATA_DIR: dir },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(output).toMatch(/^Temporary password for admin: [A-Za-z0-9]{20}$/m);
  });
});
