---
title: Auth, RBAC and overlay access
status: accepted
date: 2026-10-02
---
# 0008. Auth, RBAC and overlay access

## Context

The app runs on a shared venue network, so anyone on the Wi-Fi can reach it. It has three roles: Admin, Producer and Announcer. OBS browser sources, which render our outputs, can't fill in a login form. There is no internet, so external identity providers are out ([ADR-0004](0004-server-is-the-hub.md)).

Options considered:
- **An auth library such as Better Auth.** Rejected: more code to audit, and its conventions would fight requirements such as server-machine-only setup and temporary passwords.
- **A small auth layer on Fastify.** Chosen. Each piece is a few dozen lines with its own tests.

## Decision

- **Local accounts.**
  - Usernames are 3–32 characters from `a–z`, `0–9`, `.`, `_` and `-`, stored lowercase.
  - Passwords are 10–256 characters and may not equal the username. There are no rules about mixing character types.
  - Passwords are hashed with **argon2id** (19456 KiB of memory, 2 passes, parallelism 1) using Node's built-in `crypto.argon2`, which needs **Node 24.7 or later**. Hashes are stored as PHC strings, so the settings can be raised later.
- **Server-side sessions.**
  - The `obs_producer_session` cookie (`HttpOnly`, `SameSite=Lax`) holds a random token. The database stores only its SHA-256.
  - A session lasts until logout, up to a fixed 30 days. Using it doesn't extend it.
  - Changing your password signs out your other sessions. An Admin can sign a user out everywhere.
- **The first Admin** is created by a setup page that works only while no accounts exist, and only on the server machine itself: a loopback address, reached through a loopback name such as `localhost`.
- **Other accounts.** Admins create accounts and reset passwords. Each time, the server generates a temporary password and shows it once. The user must replace it at their next login. Until they do, only `me`, `password` and `logout` work.
- **There is always an Admin.** Deleting or demoting the last Admin is refused, and so is deleting your own account.
- **A locked-out Admin** runs `yarn workspace @obs-producer/server reset-password <username>` on the server machine.
- **Roles are enforced on the server.**
  - Every `/api` route uses `requireUser` or `requireRole`, or is listed in `PUBLIC_API_ROUTES`; only `me`, `password` and `logout` use `requireSession`, which lets a pending password change through. A route inventory test fails CI for any other route that lets an anonymous request through.
  - Socket.IO's default namespace requires a session.
  - The client hides controls a role can't use, but only for convenience.
- **Protection without HTTPS.**
  - Only JSON bodies are accepted.
  - A state-changing request, or a connection to the signed-in Socket.IO namespace, whose `Origin` doesn't match `Host` is refused.
  - Login, setup and password changes allow 10 attempts a minute per address.
- **HTTP for now.** HTTPS with your own certificate is a later decision.
- **Outputs.** Until Live Mode, OBS outputs use the public `/overlay` page and Socket.IO namespace. Live Mode replaces this with **capability URLs**: an unguessable token per output that only allows viewing that output. That design will be recorded when it's built.

**Hard rule:** **Authorization happens on the server.** Every API route and socket event checks the caller's role. Hiding UI is not access control.

## Consequences

- Nobody is logged out mid-game: a session lasts 30 days unless the user logs out or an Admin signs them out.
- Without HTTPS, anyone capturing traffic on the venue network could copy a session cookie. HTTPS is the fix.
- Until output tokens exist, anyone on the network can open `/overlay`. It shows nothing private yet.
- Sockets are checked when they connect. Live Mode's socket events must check the caller's role on each event, and decide what happens to an open socket after logout.
- A new `/api` route must use `requireUser` or `requireRole`, or be added to `PUBLIC_API_ROUTES`. The route inventory test enforces this.
- Whether output tokens can be rotated without re-adding every OBS source is still an open question on the [feature page](../features/users-and-access.md#open-questions).
