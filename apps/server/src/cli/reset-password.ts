// `yarn workspace @obs-producer/server reset-password <username>`, for an Admin who is locked out (ADR-0008).
// Run it on the server machine; it works while the server is running. It prints a temporary password, forces a
// new password at the next login, and signs the user out everywhere.
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.ts';
import { revokeUserSessions } from '../auth/sessions.ts';
import { findUserForLogin, setPassword } from '../auth/users.ts';
import { loadConfig } from '../config.ts';
import { openDatabase, type AppDatabase } from '../db.ts';

export const USAGE = 'Usage: yarn workspace @obs-producer/server reset-password <username>';

export async function resetPassword(
  db: AppDatabase,
  username: string,
): Promise<{ username: string; temporaryPassword: string } | null> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = findUserForLogin(db, username);
  if (!user) return null;
  setPassword(db, user.id, passwordHash, { mustChangePassword: true });
  revokeUserSessions(db, user.id);
  return { username: user.username, temporaryPassword };
}

export async function runResetPassword(
  args: readonly string[],
  { dataDir, print }: { dataDir: string; print: (line: string) => void },
): Promise<number> {
  const [username] = args;
  if (args.length !== 1 || !username) {
    print(USAGE);
    return 2;
  }
  const { db, sqlite } = openDatabase(dataDir);
  try {
    const result = await resetPassword(db, username);
    if (!result) {
      print(`No user named "${username.trim().toLowerCase()}".`);
      return 1;
    }
    print(`Temporary password for ${result.username}: ${result.temporaryPassword}`);
    print('They must choose a new password when they next log in.');
    return 0;
  } finally {
    sqlite.close();
  }
}

if (import.meta.main) {
  process.exitCode = await runResetPassword(process.argv.slice(2), {
    dataDir: loadConfig().dataDir,
    print: (line) => console.log(line),
  });
}
