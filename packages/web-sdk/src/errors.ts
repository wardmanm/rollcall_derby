import { ApiErrorSchema } from '@rollcall/core-contract';

// The server's error code and message for a failed request (`{ error, message? }`), if it sent one. RTK Query puts
// the reply body in `error.data`; a network failure has none.
export function apiError(error: unknown): { code: string; message?: string } | undefined {
  const data = typeof error === 'object' && error !== null && 'data' in error ? error.data : undefined;
  const parsed = ApiErrorSchema.safeParse(data);
  return parsed.success ? { code: parsed.data.error, message: parsed.data.message } : undefined;
}
