---
title: Users and Access
status: in-progress
summary: Username and password login with Admin, Producer and Announcer roles, enforced on the server.
---
# Users and Access

Basic user accounts and role-based access control. The app runs on a shared venue network, so accounts decide who can change what. This page is the **canonical home of the role matrix**; other pages link here instead of restating permissions.

## Requirements

- **R1.** Users log in with a username and password. The server keeps the session.
- **R2.** On first run, the app asks for the initial Admin account to be created.
- **R3.** Admins create users, reset passwords and assign roles.
- **R4.** Every API route and socket event checks the caller's role on the server. Hiding UI is not access control ([ADR-0008](../decisions/0008-auth-rbac-and-overlay-access.md)).
- **R5.** OBS browser sources can't log in, so each output is reached through an unguessable token URL instead ([ADR-0008](../decisions/0008-auth-rbac-and-overlay-access.md), proposed).
- **R6.** Accounts are local only. There are no external identity providers, because the app runs on the LAN with no internet.

## Role matrix

✅ allowed · — not allowed · ❓ open question (see below)

| Capability | Admin | Producer | Announcer |
|---|---|---|---|
| Manage users and roles | ✅ | — | — |
| Configure OBS and CRG connections | ✅ | — | — |
| Create or edit themes | ✅ | — (uses existing) | — |
| Create or edit screens, component layout and options | ✅ | — (uses existing) | — |
| Create or edit teams | ✅ | ✅ | — |
| Import or export teams | ✅ | ✅ | — |
| Import or export themes and screens | ✅ | ❓ | — |
| Set up events, games and tracks | ✅ | ✅ | — |
| View dashboards and previews | ✅ | ✅ (all) | Assigned screens only |
| Use component controls on dashboards | ✅ | ✅ | ❓ limited, per assigned screen |
| Use OBS controls | ✅ | ❓ | ❓ |
| Edit automation rules | ✅ | ❓ | — |

## Behavior

Not built yet.

## Open questions

- What does an Announcer's access look like: assigned per user, or per screen? Which "limited controls" do they get?
- May Producers use OBS controls? The requirement says producers use dashboards, and OBS control is on dashboards.
- May Producers import or export themes and screens they can't edit?
- May Producers edit automation rules, or only pause and override them?
- How long do sessions last? Nobody should be logged out in the middle of a game.
- HTTPS on the LAN: self-signed certificates are awkward for browsers and OBS. Is plain HTTP on a trusted venue network acceptable? What does that mean for cookie settings?
- Should output tokens be rotatable, e.g. after an event, without having to re-add every source in OBS?
