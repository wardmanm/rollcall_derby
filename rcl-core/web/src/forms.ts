import { apiError } from '@rollcall/web-sdk';

/** A failed check of a form against a contract schema: Zod's issues, each naming its field. */
interface Problems {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}

/** The first problem with each field, in the contract's own words, to show under that field's input. */
export function fieldErrors(problems: Problems): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of problems.issues) errors[String(issue.path[0] ?? '')] ??= issue.message;
  return errors;
}

const SENTENCES: Partial<Record<string, string>> = {
  rate_limited: 'Too many attempts from this device. Wait a minute, then try again.',
  forbidden: "Your account can't do that.",
};

/**
 * What to tell a person about a failed request: this page's sentence for the server's error code, else a common one,
 * else the server's own message (validation problems, the last-Admin rule).
 */
export function problemWith(error: unknown, sentences: Partial<Record<string, string>> = {}): string {
  const reply = apiError(error);
  if (!reply) return "Can't reach the Rollcall server. Check that it's running, then try again.";
  return sentences[reply.code] ?? SENTENCES[reply.code] ?? reply.message ?? 'Something went wrong. Try again.';
}
