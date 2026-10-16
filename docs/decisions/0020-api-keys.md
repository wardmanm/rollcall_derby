---
title: API keys for devices and scripts
status: accepted
date: 2026-10-16
---
# 0020. API keys for devices and scripts

## Context

Devices and scripts on the venue network, such as Bitfocus Companion, a Stream Deck or a laptop script, need to call rcl-core without a browser session. [ADR-0018](0018-declared-access-and-permissions.md) planned API keys: a bearer token, hashed at rest and scoped to permissions. Building them needs answers to four questions:
- how a key fits the access checks;
- which permissions it may hold;
- how long it lasts;
- what it means for the cross-site check.

Options considered for how a key fits the access checks:
- **A key acts as the Admin who made it, limited to what both hold.** Rejected: demoting or deleting that Admin silently breaks every device using the key.
- **A key is a stand-in user with a hidden role.** Rejected: roles are a fixed list, and a hidden one would leak into user lists and permission tables.
- **A key is its own kind of caller, with its own permissions.** Chosen.

## Decision

- **An API key is its own kind of caller,** next to signed-in sessions. It has no user and no role, only the permissions it was given. Keys belong to the server, not to the Admin who made them.
- **The `Authorization` header beats the cookie.** When a request has one, only it counts:
  - `Bearer <key>` with a known, unexpired key is that key;
  - anything else means no caller, so the request gets `401`.

  The session cookie is never used as a fallback.
- **No cross-site check for keys.** Browsers never add an `Authorization` header to a cross-site request on their own, and the cookie is ignored once the header is there. So the Origin check is skipped for such requests.
- **What a key may call:** public routes, and routes that need a permission the key holds. Routes for any signed-in user refuse keys with `403`, because they're about a person.
- **People-only permissions.** A permission may say `peopleOnly: true`.
  - It can never go on a key, and a key holding one is refused anyway.
  - Account administration is people-only: `core:users.manage` and `core:api-keys.manage`. So a leaked key can't create accounts, reset passwords or make more keys.
- **Keys:**
  - A key is `rcl_` followed by 32 random bytes. It's shown once and stored as a SHA-256 hash, with its first 8 characters kept so a person can tell keys apart.
  - It has an optional expiry from presets: never, 1 day, 7 days, 30 days or 1 year.
  - A key can't be edited: create a new one and revoke the old. Revoking deletes the key.
- **HTTP only for now.** Socket.IO namespaces ignore the `Authorization` header, so live connections need a session.

## Consequences

- **Precise and revocable.** Devices and scripts get exactly the permissions they need, and lose them the moment their key is revoked.
- **Handlers must allow for keys.** Every handler that reads the signed-in person must allow for a key: `userOf(request.principal)` gives the person, or nothing for a key.
- **Each new permission decides whether it's people-only.** The users-and-access permission table shows it, and a test keeps the table in step with the code.
- **Keys start out limited to public routes,** until a feature adds a permission keys may hold.
- **Plain HTTP exposes keys.** Until HTTPS arrives, keys cross the venue network in the clear, as passwords do.
- **Live connections need a new decision.** Letting devices open them means accepting keys on namespaces.
