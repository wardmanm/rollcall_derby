---
title: Auth, RBAC and overlay access
status: proposed
date: 2026-09-28
---
# 0008. Auth, RBAC and overlay access

> **Proposed.** The session and RBAC parts are expected to hold. How outputs are accessed, and the other open questions in [users and access](../features/users-and-access.md#open-questions), are still being decided. This ADR will be accepted or superseded once that design is complete.

## Context

The app runs on a shared venue network, so anyone on the Wi-Fi could reach it. It has three roles: Admin, Producer and Announcer. OBS browser sources, which render our outputs, can't fill in a login form. There is no internet, so external identity providers are out ([ADR-0004](0004-server-is-the-hub.md)).

## Decision

- **Local accounts with server-side sessions.**
  - Usernames and passwords, with passwords hashed using **argon2**.
  - Sessions live on the server and are identified by an httpOnly cookie.
  - On first run, the app asks for the initial Admin account to be created.
- **Roles are enforced on the server.**
  - Every REST route and Socket.IO event checks the caller's role against the [role matrix](../features/users-and-access.md#role-matrix).
  - The client hides controls a role can't use, but only for convenience.
- **Outputs use capability URLs.** Each output is reached through an unguessable token in its URL, which OBS stores in the browser source settings. The token only allows *viewing* that one output.

**Hard rule:** **Authorization happens on the server.** Every API route and socket event checks the caller's role. Hiding UI is not access control.

## Consequences

- A leaked output URL exposes one read-only overlay, not the app. Tokens should be rotatable. How, without re-adding every OBS source, is an open question.
- Without HTTPS on the LAN, cookies and tokens travel unencrypted. Whether that's acceptable on a trusted venue network is an open question.
- Role checks sit at the edge of every route and socket handler, and each route and handler needs a test.
