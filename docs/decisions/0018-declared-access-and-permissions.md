---
title: Declared access and per-app permissions
status: accepted
date: 2026-10-09
---
# 0018. Declared access and per-app permissions

Supersedes [ADR-0008](0008-auth-rbac-and-overlay-access.md).

## Context

ADR-0008 enforced access with role checks: each route picked `requireUser` or `requireRole(...)`, or was listed in `PUBLIC_API_ROUTES`. Rollcall is becoming a suite of rcl apps hosted by rcl-core ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). Each app adds its own routes and live connections, and not every caller will be a person signed in with a browser: devices and scripts (API keys) and OBS browser sources (output tokens) are next. Role checks spread across routes don't scale to that, and a route that forgot its check was caught only by a test.

Options considered:
- **Keep a role check on each route.** Rejected: every app would hard-code core's roles, and an API key holds no role.
- **A policy library, such as CASL.** Rejected: more code than the problem needs, and routes would still need checking at registration.
- **Each route and namespace declares its access, and core enforces it in one place.** Chosen.

Everything else in ADR-0008 stands. It's restated below so this ADR is complete on its own.

## Decision

- **Every `/api` route declares its access** in `config.access`, in one of three forms:
  - `{ public: '<reason>' }`: anyone. The reason is shown in the API explorer.
  - `{ signedIn: true }`: any signed-in user. With `allowPendingPasswordChange: true`, a pending password change is let through too. Only `me`, `password` and `logout` do that.
  - `{ permission: '<app>:<action>' }`: a signed-in user whose role holds that permission.
- **Denied by default.**
  - One `onRoute` hook checks each `/api` route as it's registered.
  - The server refuses to start when a route has no declaration, a public route gives no reason, or a permission is undeclared or belongs to another app.
  - The same hook puts the route's check first in its `preValidation` hooks, so a refused caller never learns what a valid body looks like ([ADR-0014](0014-route-schemas-and-api-explorer.md)).
- **Checks, in order:**
  1. A state-changing request whose `Origin` doesn't match `Host` gets `403 cross_origin`.
  2. No caller gets `401 unauthenticated`.
  3. A pending password change gets `403 password_change_required`.
  4. A missing permission gets `403 forbidden`.
- **Permissions.**
  - They're named `<app>:<action>`, such as `core:users.manage`.
  - Each rcl app declares its own, with a summary and the roles that hold it, and may only use its own.
  - **Admin holds every permission.**
  - The [users and access](../features/users-and-access.md#permissions) feature page lists them, and a test keeps that table in step with the code.
- **The caller.** Each request's caller is resolved once, when the request arrives. Today the only kind is a signed-in session. API keys (a bearer token, hashed at rest and scoped to permissions) and output tokens (one output each) join later.
- **Losing access mid-request.** A handler that awaits (password hashing) before it writes checks its caller again after the await. An Admin demoted, deleted or signed out in the meantime changes nothing.
- **Socket.IO namespaces declare access too**, through one helper, and are checked the same way when a client connects.
  - The bare `/` namespace refuses every connection.
  - A namespace created any other way stops the server.
  - Signed-in namespaces keep the Origin check.
- **Restated from ADR-0008:**
  - **Local accounts.**
    - Usernames are 3–32 characters from `a–z`, `0–9`, `.`, `_` and `-`, stored lowercase.
    - Passwords are 10–256 characters and may not equal the username.
    - Passwords are hashed with **argon2id** (19456 KiB of memory, 2 passes, parallelism 1) using Node's built-in `crypto.argon2`, which needs Node 24.7 or later. Hashes are stored as PHC strings, so the settings can be raised later.
  - **Server-side sessions.**
    - The `rollcall_session` cookie (`HttpOnly`, `SameSite=Lax`) holds a random token. The database stores only its SHA-256.
    - A session lasts until logout, up to a fixed 30 days. Using it doesn't extend it.
    - Changing your password signs out your other sessions. An Admin can sign a user out everywhere.
  - **The first Admin** is created by a setup page that works only while no accounts exist, and only on the server machine itself: a loopback address, reached through a loopback name such as `localhost`.
  - **Other accounts.** Admins create accounts and reset passwords. Each time, the server generates a temporary password and shows it once, and the user must replace it at their next login.
  - **There is always an Admin.** Deleting or demoting the last Admin is refused, and so is deleting your own account.
  - **A locked-out Admin** runs `yarn workspace @rollcall/core-server reset-password <username>` on the server machine.
  - **Protection without HTTPS.**
    - Only JSON bodies are accepted.
    - A state-changing request, or a connection to a signed-in namespace, whose `Origin` doesn't match `Host` is refused.
    - Login, setup and password changes allow 10 attempts a minute per address.
  - **HTTP for now.** HTTPS with your own certificate is a later decision.
  - **Outputs.** Until Live Mode, the `/overlay` page and Socket.IO namespace are public. Live Mode replaces them with output token URLs.
  - **The client hides controls a caller can't use**, but only for convenience.

**Hard rule:** **Authorization happens on the server.** Every API route and socket event checks the caller's access. Hiding UI is not access control.

### Names used in earlier ADRs

| Earlier name | Now |
|---|---|
| `PUBLIC_API_ROUTES` | `config.access: { public: '<reason>' }` on each route |
| `requireSession` | `{ signedIn: true, allowPendingPasswordChange: true }` |
| `requireUser` | `{ signedIn: true }` |
| `requireRole('admin')` | `{ permission: '<the permission the route needs>' }`, e.g. `core:users.manage` |
| `request.user`, `request.sessionToken` | `request.principal` |
| the signed-in default namespace `/` | a namespace created with `namespace(name, { access })`; `/` refuses everyone |

## Consequences

- A route or namespace can't forget its check, because the server won't start. The route and namespace inventory tests check that each declaration is enforced.
- In Phase 4, each rcl app declares its permissions in its own module, and the ownership check reads the app from the route's `/api/<id>` prefix.
- Roles remain, as sets of permissions. Granting a role a permission is a one-line change plus the feature page's table.
- Sockets are checked when they connect. Live Mode's socket events must check the caller's access on each event, and decide what happens to an open socket after logout or a role change.
- Without HTTPS, anyone capturing traffic on the venue network could copy a session cookie. HTTPS is the fix.
- Until output tokens exist, anyone on the network can open `/overlay`. It shows nothing private yet.
- Whether output tokens can be rotated without re-adding every OBS source is still an open question on the [feature page](../features/users-and-access.md#open-questions).
