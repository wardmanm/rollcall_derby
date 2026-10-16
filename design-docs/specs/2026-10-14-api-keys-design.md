# API keys for devices and scripts: design

**Date:** 2026-10-14 · **Status:** approved · **Issue:** #7 · **Milestone:** `rcl-core v0.1.0`

## Goal

Devices and scripts on the venue network, such as Bitfocus Companion, a Stream Deck or a laptop script, need to call rcl-core without a browser session. An Admin creates an **API key** scoped to permissions. A request carries it as `Authorization: Bearer <key>`.

This builds the caller kind that [ADR-0018](../../docs/decisions/0018-declared-access-and-permissions.md) planned: "API keys (a bearer token, hashed at rest and scoped to permissions)". It also builds the split spec's access model entry: "when present the cookie is ignored and the Origin check doesn't apply".

## Decisions (made with Mike)

| Topic | Decision |
|---|---|
| First callers | Companion, Stream Deck and scripts, which make **HTTP requests only**. Socket.IO namespaces don't accept keys yet |
| How a key fits the access model | **Its own kind of caller**, with its own permission list and no user or role. Keys belong to the server, not to the Admin who made them |
| What a key may hold | **Any permission except the account-admin ones.** Permissions marked `peopleOnly` (managing users, managing API keys) can never go on a key, so a leaked key can't create accounts, reset passwords or make more keys |
| Lifetime | **An optional expiry**, chosen from presets: never, 1 day, 7 days, 30 days or 1 year |
| Changing a key | Not possible. Create a new key and revoke the old one |
| "Any signed-in user" routes | **Refuse keys** (`403 forbidden`). They're about a person: who am I, my password, the app launcher |

## Scope

**In scope:**
- the `api_keys` table;
- resolving `Authorization: Bearer`;
- the key as a caller in the access checks;
- the `peopleOnly` flag on permissions, and the `core:api-keys.manage` permission;
- the API keys routes, contracts and API explorer support;
- the API keys page in rcl-core's web app;
- tests, including route inventory sweeps and e2e;
- docs, including ADR-0020.

**Out of scope:**
- keys on Socket.IO namespaces;
- the CORS allowlist for remote rcl apps (a separate backlog issue);
- output tokens (with Live Mode);
- editing keys;
- usage logs beyond "last used".

**What ships:** no permission a key may hold exists yet. The only two, `core:users.manage` and `core:api-keys.manage`, are people-only. Until a feature adds a permission keys may hold, a key reaches public routes only, and the page says so. Tests prove the full path with a throwaway test app that declares a permission keys may hold.

## Keys and storage

**Table** `api_keys` (a core table, in a new Drizzle migration):
- `id`: text primary key, from `crypto.randomUUID()`;
- `name`: text, 1–64 characters after trimming, unique (an exact match after trimming);
- `token_hash`: text, unique. It's the SHA-256 of the key, hex-encoded, as `sessions.token_hash` is. **The key itself is never stored.**
- `token_prefix`: text, the key's first 8 characters (`rcl_` plus 4), shown in the list;
- `permissions`: text, a JSON array of permission keys;
- `created_at`: ISO text;
- `created_by`: text, the creating Admin's username at the time. It's not a foreign key, so deleting that Admin keeps the key;
- `expires_at`: ISO text, null for never;
- `last_used_at`: ISO text or null. It's refreshed at most once a minute.

**Format:** `rcl_` followed by 32 random bytes as base64url (43 characters), 47 in all.
- The prefix makes keys recognizable in logs and to secret scanners.
- The key appears in exactly one response, the one that creates it.

**Expiry:**
- `expiresIn` is one of `never`, `1d`, `7d`, `30d` or `1y` (24 hours, 7 days, 30 days, 365 days), counted from creation.
- An expired key is refused exactly like a revoked one. It stays listed, marked expired, until an Admin revokes it.
- Expired keys are not purged automatically, so the list explains why a device stopped working.

**Revoking** deletes the row.

## Requests with a key

- **Resolving the caller.** `resolvePrincipal` reads the `Authorization` header first.
  - If the header is present, **only it counts.**
    - `Bearer <key>` with a known, unexpired key gives an API key caller.
    - Anything else gives no caller: a wrong, revoked or expired key, an empty value, or another scheme. The session cookie is never used as a fallback.
  - If the header is absent, the session cookie is used, as today.
- **The cross-site check** (Origin must match Host on state-changing requests) is **skipped when an `Authorization` header is present.** Browsers never add that header to a cross-site request on their own, so a forged request can't carry a key. The cookie is ignored in that case, so the check has nothing left to protect.
- **The caller:** `{ kind: 'apiKey', key: { id, name, permissions } }`. It joins the `Principal` union next to `{ kind: 'session', user, token }`.
- **Checks (`deny`) for a key:**
  - public: allowed;
  - no caller: `401 unauthenticated`, as today;
  - `signedIn`: `403 forbidden`;
  - `permission`: allowed only if the key holds that exact permission, otherwise `403 forbidden`. Keys have no role, so the Admin shortcut doesn't apply.
  - The pending-password-change check applies to sessions only.
- **Re-checking.** `recheckAccess()` re-resolves from the same headers, so a key revoked while a handler awaits is refused, as a signed-out session is today.
- **Handlers must not assume a caller is a user.** Code that reads `request.principal.user` narrows on `kind` first. Today only "any signed-in user" and people-only routes read the user, and keys never reach either.
- **Last used:** a successful resolution updates `last_used_at` if it's empty or more than a minute old.
- **No extra rate limit.** A key carries 256 random bits, and every wrong key just gets `401`.
- **Logout** is public. With a key it clears the cookie and revokes nothing.
- **Socket.IO ignores the `Authorization` header.** Only the session cookie counts on a namespace, as today.

## Permissions

- **`PermissionDef`** (in `@rollcall/app-sdk`) gains `peopleOnly?: true`: "only people may hold this; it can never go on an API key".
- **`core:users.manage`** becomes `peopleOnly`.
- **A new permission `core:api-keys.manage`**, "Create, list and revoke API keys": `roles: []` (Admin only), `peopleOnly`.
- **The users-and-access permission table** gains an **API keys** column (✅ or —). The existing test that keeps the table in step with the code covers it.

## API

All routes need `core:api-keys.manage`. Bodies are validated with the contract's schemas.

| Method and path | Behavior |
|---|---|
| `GET /api/core/api-keys` | Lists keys, newest first: `id`, `name`, `prefix`, `permissions`, `createdAt`, `createdBy`, `expiresAt`, `lastUsedAt`. Never the key or its hash |
| `GET /api/core/api-keys/grantable` | The permissions a key may hold, across every hosted app: `{ key, summary }[]`, in declaration order |
| `POST /api/core/api-keys` | Takes `{ name, permissions, expiresIn }` and replies `201 { apiKey, key }`. Responses: `400 validation_failed` for a bad name or expiry; `400 not_grantable` for an unknown or people-only permission; `409 name_taken` |
| `DELETE /api/core/api-keys/:id` | Replies `204`, or `404 not_found` |

**The API explorer** gains a `bearer` HTTP security scheme next to the session cookie, so `/docs` can try requests with a key.

## Contract (`@rollcall/core-contract`)

- `ApiKeyExpirySchema`: `'never' | '1d' | '7d' | '30d' | '1y'`.
- `ApiKeySchema`: `{ id, name, prefix, permissions: string[], createdAt, createdBy, expiresAt: string | null, lastUsedAt: string | null }`.
- `CreateApiKeyRequestSchema`: `{ name, permissions, expiresIn }`, where `name` is trimmed and 1–64 characters, and `permissions` may be empty.
- `CreateApiKeyResponseSchema`: `{ apiKey: ApiKey, key: string }`.
- `GrantablePermissionSchema`: `{ key, summary }`.

## Web app (rcl-core)

- **The page:** `/core/api-keys`.
- **The header link:** "API keys", shown with `core:api-keys.manage` (by permission, as with Users).
- **The create form:**
  - a name;
  - a checkbox for each grantable permission, with its summary;
  - expiry: Never (the default), 1 day, 7 days, 30 days, 1 year.
  - With nothing grantable, it says "No permissions can be given to API keys yet: a key can call public routes only", and still creates keys.
- **Shown once:** after creating, the key appears in a dialog: "Copy it into your device or script now: it won't be shown again." It uses the same selectable box and Copy button (where the browser allows it) as temporary passwords. That component is generalized so both pages use it.
- **The table:**
  - Name;
  - Key (`rcl_abcd…`);
  - Permissions (badges, or "Public routes only");
  - Created (date, and who);
  - Expires (date, "Never", or an "Expired" badge);
  - Last used (date or "Never");
  - an actions menu with **Revoke**.
- **Revoke** confirms first: "Devices and scripts using it stop working at once. This cannot be undone."
- **Problems** show in an alert. The form is checked with the contract schema before sending. A taken name says "That name is already taken."

## Tests (written first)

- **Keys:**
  - creating one returns `rcl_` plus 43 characters, once;
  - the database holds only the hash and prefix;
  - each expiry preset sets the right `expires_at`.
- **Resolution:**
  - a valid key resolves;
  - a wrong, revoked or expired key, `Bearer` with nothing after it, or another scheme gets `401`;
  - a bad key with a valid session cookie still gets `401`;
  - a valid key with a cross-site Origin isn't refused as `cross_origin`.
- **Checks:**
  - a key with the permission passes, and one without gets `403`;
  - a `signedIn` route gives a key `403`;
  - public routes are open;
  - a key revoked during a handler's await is refused by `recheckAccess`.
- **Routes:**
  - list, grantable, create and delete;
  - people-only and unknown permissions get `400 not_grantable`;
  - a taken name gets `409`;
  - deleting a missing key gets `404`;
  - an expired key is still listed.
- **Last used:** set on first use, and not rewritten within a minute.
- **Socket.IO:** a handshake with a valid key in its `Authorization` header but no session cookie is refused as `unauthenticated` on a signed-in namespace.
- **Route inventory, new sweeps:**
  - a key holding every key-grantable permission is refused on every `signedIn` and people-only route, and not refused elsewhere;
  - a bad key gets `401` on every non-public route;
  - an Admin session is the negative control;
  - the inventory also hosts a test app with a key-grantable permission, so the "not refused" set isn't empty.
- **Permission table:** the new column is checked against `peopleOnly`.
- **Web:**
  - the list, create (shown once), the empty-grantable message, revoke with confirmation, the expired badge and a taken name;
  - the link and page are hidden without the permission.
- **End to end:**
  - an Admin creates a key in the UI and reads it once;
  - with it, `/api/core/health` works and `/api/core/users` gets `403`;
  - a made-up key gets `401`;
  - after revoking in the UI, the real key gets `401`.

## Docs

- **[ADR-0020](../../docs/decisions/) "API keys"**, accepted. It extends ADR-0018 and doesn't supersede it.
  - It records: a key as its own kind of caller; `Authorization` taking precedence over the cookie; the Origin check skipped for bearer requests; `signedIn` routes refusing keys; `peopleOnly` permissions; HTTP only for now.
  - The per-app releases ADR that the split spec numbers 0020 becomes **0021**.
- **`docs/features/users-and-access.md`:**
  - **R7.** Devices and scripts call the API with API keys, which an Admin creates scoped to permissions, and which never hold account-admin permissions.
  - An "API keys" section under Behavior.
  - The permission table's new column.
- **Glossary:** "API key".
- **Testing guide:** the key sweeps in the route inventory.
- **Rules:**
  - `rcl-core-server.md`: callers are sessions or keys, so narrow on `principal.kind` before using `.user`. A new permission decides `peopleOnly`.
  - `sdk.md`: `PermissionDef.peopleOnly`.
- **CHANGELOG:** Added, ending with (#7).
