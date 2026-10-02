# Auth skeleton: design

**Date:** 2026-10-02 · **Status:** approved · **Milestone:** `obs-producer v0.2.0` (roadmap Phase 1)

## Goal

OBS Producer runs on a shared venue network. It needs local accounts with three roles (Admin, Producer, Announcer) and access control enforced on the server for every API route and socket (hard rule 5), before the Phase 1 builders add data worth protecting. This finalizes [ADR-0008](../../docs/decisions/0008-auth-rbac-and-overlay-access.md) and [users and access](../../docs/features/users-and-access.md) R1–R4 and R6. Output access (R5) stays deferred to Screens and Live Mode.

## Decisions (confirmed with Mike)

| Topic | Decision |
|---|---|
| Approach | A small auth layer built on Fastify. Better Auth was considered and rejected: more surface to audit, and its conventions would fight our specific requirements |
| Password hashing | **argon2id via Node's built-in `crypto.argon2`.** Verified present on Node 24.21 and 26.7. No dependency and nothing to compile |
| Sessions | Server-side, in SQLite. A login lasts **until logout, with a 30-day cap** from creation. Admins can sign a user out of all their sessions |
| Transport | **HTTP for now.** Optional HTTPS with your own certificate is a later issue |
| First Admin | A first-run setup page that works **only from the server machine** (`127.0.0.1` / `::1`), and only while no users exist |
| Account creation | Admin-created accounts and password resets use a **server-generated temporary password, shown once**. The user must change it at their next login |
| Locked-out Admin | `yarn workspace @obs-producer/server reset-password <username>`, run on the server machine |
| Overlay | `/overlay` stays public, on its own Socket.IO namespace, until output token URLs arrive with Live Mode |

## Scope

**In scope:**
- Users and sessions.
- First-run setup.
- Login and logout.
- Changing your own password.
- Admin user management.
- Role checks on every API route and socket connection.
- CSRF and brute-force protection.
- A reset-password command for a locked-out Admin.
- Web pages for all of the above.
- Tests and docs.

**Out of scope:**
- HTTPS (a later issue).
- Output token URLs, rotation, and assigning screens to Announcers (Live Mode).
- Permissions for features that don't exist yet: OBS controls, automation, importing themes and screens.
- Multi-factor auth.
- Audit logs.
- Account lockout. Rate limiting covers brute force instead.

## Data model (Drizzle, new migration `auth`)

- **`users`**
  - `id`: text primary key, `crypto.randomUUID()`
  - `username`: text, unique, stored lowercase
  - `password_hash`: text, in PHC format
  - `role`: text, one of `admin` · `producer` · `announcer`
  - `must_change_password`: integer boolean
  - `created_at`, `updated_at`: ISO text
- **`sessions`**
  - `token_hash`: text primary key. This is the SHA-256 of the session token; **the token itself is never stored**.
  - `user_id`: text, foreign key to `users.id`, deleted when the user is deleted
  - `created_at`, `expires_at`: ISO text. `expires_at` is `created_at` plus 30 days.
  - `last_seen_at`: ISO text, refreshed at most once a minute

## Security details

- **Passwords:**
  - argon2id with memory 19456 KiB, 2 passes and parallelism 1 (OWASP's recommended settings), a 16-byte random salt and a 32-byte tag.
  - Stored as `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, so the settings can be raised later.
  - Hashes are compared in constant time.
  - Logins for an unknown user still verify against a dummy hash, so their timing matches a real user's.
- **Password rules:**
  - Between 10 and 256 characters. The upper limit stops someone sending a huge password to tie up the hashing.
  - No rules forcing a mix of character types.
  - A password may not equal the username, ignoring case.
- **Usernames:** 3–32 characters from `[a-z0-9._-]`, and lowercased before both saving and lookup.
- **Session cookie** `obs_producer_session`:
  - The value is 32 random bytes, base64url-encoded.
  - Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age` set to the time left until the session expires.
  - `Secure` is set only when the request arrived over HTTPS, which can't happen until the HTTPS issue.
- **Expired or revoked sessions** are rejected. Expired rows are purged at startup and once an hour.
- **Rate limiting:** `POST /api/auth/login` and `POST /api/setup` allow 10 requests per minute per IP (`@fastify/rate-limit`); the next one gets 429.
- **CSRF:**
  - Cookies are `SameSite=Lax`.
  - Fastify's `text/plain` body parser is removed, so only JSON bodies are accepted, and anything else gets 415.
  - Any state-changing `/api` request (POST, PUT, PATCH, DELETE) whose `Origin` header doesn't match `Host` gets 403.
- **"Server machine only"** means `request.ip` is in `127.0.0.1`, `::1` or `::ffff:127.0.0.1`.
  - The server doesn't trust proxy headers.
  - In development, the Vite proxy forwards from localhost, and Vite only listens on localhost.
- **Error messages don't reveal which usernames exist.** Login failures always return `401 {"error": "invalid_credentials"}`.

## API

**Routes** (all bodies are JSON and validated with shared Zod schemas):

| Method and path | Who may call it | Behavior |
|---|---|---|
| `GET /api/health` | Anyone | Unchanged |
| `GET /api/setup` | Anyone | Returns `{ needsSetup, canSetupHere }` |
| `POST /api/setup` | The server machine only, while no users exist | Creates the Admin and starts a session. Returns 403 from another machine and 409 once any user exists |
| `POST /api/auth/login` | Anyone; rate-limited | Returns `SessionUser` and sets the cookie; otherwise 401 `invalid_credentials` |
| `POST /api/auth/logout` | Logged in | Revokes the current session and clears the cookie |
| `GET /api/auth/me` | Logged in | Returns `SessionUser` (`id`, `username`, `role`, `mustChangePassword`) |
| `POST /api/auth/password` | Logged in | Takes `{ currentPassword, newPassword }`. Clears `mustChangePassword` and revokes your other sessions |
| `GET /api/users` | Admin | Lists users |
| `POST /api/users` | Admin | Takes `{ username, role }` and returns `{ user, temporaryPassword }` |
| `PATCH /api/users/:id` | Admin | Takes `{ role }`. Returns 409 if it would demote the last Admin |
| `POST /api/users/:id/password-reset` | Admin | Returns `{ temporaryPassword }` and revokes that user's sessions |
| `POST /api/users/:id/sign-out` | Admin | Revokes all of that user's sessions |
| `DELETE /api/users/:id` | Admin | Returns 409 for yourself or the last Admin |

**Responses:**
- No session: `401 {"error": "unauthenticated"}`.
- Wrong role: `403 {"error": "forbidden"}`.
- While `mustChangePassword` is set, every logged-in route except `me`, `password` and `logout` returns `403 {"error": "password_change_required"}`.

**Temporary passwords:**
- 20 characters, drawn with `crypto.randomInt` from an alphabet without look-alike characters.
- Returned once and never stored in plain text.

## Socket.IO

- **The default namespace `/` requires a session.** Middleware reads the cookie from the handshake and rejects the connection with `Error('unauthenticated')`. Nothing uses it yet; Live Mode will.
- **The `/overlay` namespace is public** and sends `server:hello`. The overlay client connects with `io('/overlay')`.

## Shared contract (`packages/shared/src/auth.ts`)

- **Roles:** `ROLES` (`as const`), `RoleSchema` and `Role`.
- **Field schemas:** `UsernameSchema` and `PasswordSchema`.
- **Setup and login:** `SetupStatusSchema`, `SetupRequestSchema`, `LoginRequestSchema`, `SessionUserSchema`, `ChangePasswordRequestSchema`.
- **User management:**
  - `UserSchema`: `id`, `username`, `role`, `mustChangePassword`, `createdAt`.
  - `CreateUserRequestSchema`, `CreateUserResponseSchema`, `UpdateUserRequestSchema`, `PasswordResetResponseSchema`.
- **Errors:** `ApiErrorSchema`, with an `error` code.

## Server layout (`apps/server/src/`)

- **`auth/passwords.ts`:** `hashPassword` and `verifyPassword`, plus `generateTemporaryPassword`.
- **`auth/sessions.ts`:** `createSession`, `findSession`, `revokeSession`, `revokeUserSessions`, `purgeExpiredSessions`.
- **`auth/guard.ts`:** a Fastify plugin that:
  - reads the cookie and decorates `request.user`;
  - provides `requireUser()` and `requireRole(...roles)` pre-handlers;
  - enforces the `mustChangePassword` restriction;
  - runs the CSRF checks;
  - exports `PUBLIC_API_ROUTES`, the allow-list that the route inventory test uses.
- **`routes/setup.ts`, `routes/auth.ts`, `routes/users.ts`:** the routes above.
- **`realtime.ts`:** namespace `/` gets the auth middleware; namespace `/overlay` sends the hello.
- **`cli/reset-password.ts`:** a `reset-password` script entry. It prints a temporary password and sets `mustChangePassword`.

## Web app (`apps/web/src/`)

- **RTK Query endpoints** for every route above, with tags `Me` and `Users`. A 401 from any query sends you to `/login`.
- **Routing:** an auth gate in the layout picks the page:
  - `needsSetup` sends you to `/setup`, which shows "open this page on the server machine" when `canSetupHere` is false;
  - no session sends you to `/login`;
  - `mustChangePassword` sends you to `/change-password`.
- **Pages:** `SetupPage`, `LoginPage`, `ChangePasswordPage`, and `UsersPage` (Admin only).
  - The Users page can create a user (showing the temporary password once, with a copy button), change a role, reset a password, sign a user out, and delete a user.
- **Header:** a user menu with your username, a role badge, Change password and Log out. A **Users** link appears for Admins.
- **Hiding UI is cosmetic only.** The server enforces every permission.

## Tests (written first)

- **Passwords:**
  - a hash and verify round trip works;
  - a wrong password fails;
  - the PHC string carries the settings;
  - each hash gets a unique salt;
  - a temporary password has the right length and alphabet.
- **Sessions:**
  - the database holds only the token's hash;
  - expiry is 30 days;
  - expired and revoked sessions aren't found;
  - expired rows are purged.
- **Route inventory guard:** an `onRoute` hook collects every `/api` route. Each one not in `PUBLIC_API_ROUTES` must return 401 to an anonymous request. Any future route that forgets its check fails CI.
- **Setup:**
  - `canSetupHere` reflects the IP the request came from;
  - setup returns 403 from a LAN IP (`inject({ remoteAddress: '192.168.1.50' })`);
  - setup returns 409 once any user exists;
  - successful setup creates an Admin and a session.
- **Login:**
  - success sets an `HttpOnly`, `SameSite=Lax` cookie;
  - an unknown user and a wrong password both get 401 `invalid_credentials`, with the unknown user still running a hash;
  - the 11th attempt in a minute gets 429.
- **Must change password:** other routes return 403 until the password is changed; `me`, `password` and `logout` keep working.
- **CSRF:**
  - a POST with a foreign `Origin` gets 403;
  - `text/plain` and form-encoded bodies get 415.
- **Roles:** a Producer and an Announcer get 403 on `/api/users`; an Admin gets 200.
- **User management:**
  - creating a user returns the temporary password once;
  - deleting yourself, deleting the last Admin and demoting the last Admin all return 409;
  - a password reset and a sign-out both revoke the user's sessions.
- **Sockets:**
  - `/` rejects a connection without a session and accepts one with a session;
  - `/overlay` accepts anyone;
  - the existing test for reconnecting after a server restart moves to `/overlay`.
- **The CLI** resets the password and sets `mustChangePassword`.
- **Web app (React Testing Library):**
  - the setup and login flows, with `fetch` stubbed;
  - the auth gate's redirects;
  - Admins see the Users link and Producers don't.
- **Playwright,** with a fresh data folder per run set once through an environment variable in the config, in this serial order:
  1. first-run setup;
  2. log out, then log in;
  3. create a Producer and copy its temporary password;
  4. log in as the Producer, who is forced to change password and doesn't see Users;
  5. the overlay is still public.

## Docs

- **ADR-0008** (still `proposed`, so it's edited in place): rewritten with these decisions, then **accepted**. Output tokens stay deferred, as stated in the ADR.
- **`features/users-and-access.md`:**
  - Behavior section written.
  - Status `in-progress` while the work is underway, `shipped` at the end.
  - Open questions on session length and HTTPS resolved. The other five stay open (Announcer access, Producers and OBS controls, Producers and theme/screen import, Producers and automation rules, output token rotation).
- **`architecture/data-model.md`:** the User and Session entities.
- **`guides/local-development.md`:** first-run setup, and the reset-password command under troubleshooting.
- **`guides/testing.md`:** the route inventory guard listed under the architecture guards.
- **`AGENTS.md`:** the reset-password command added to the commands table.
- **CHANGELOG:** lines referencing the new issues.
- **`.claude/rules/obs-producer-server.md`:** a note that new routes must either use `requireUser` / `requireRole` or be listed in `PUBLIC_API_ROUTES`.

## Issues (milestone `obs-producer v0.2.0`)

1. **Auth core:** shared contract; `users` and `sessions` tables and migration; passwords; sessions; setup, login, logout, me and change-password routes; CSRF and rate limiting.
2. **Access control and user management:**
   - the guard, with the `mustChangePassword` restriction and the route inventory test;
   - the user-management routes, with the last-Admin rules;
   - the Socket.IO namespaces, with the overlay client switching to `io('/overlay')` in the same change so the overlay never breaks;
   - the reset-password command;
   - ADR-0008 accepted.
3. **Auth in the web app:** the auth gate, the Setup, Login, Change password and Users pages, the user menu, and the Playwright flow and docs.

Each issue lists the related requirement numbers from the users-and-access page.
