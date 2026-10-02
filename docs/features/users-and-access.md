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
- **R5.** OBS browser sources can't log in, so each output will be reached through an unguessable token URL ([ADR-0008](../decisions/0008-auth-rbac-and-overlay-access.md)). Until output tokens arrive with Live Mode, `/overlay` is public.
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

How accounts work is decided in [ADR-0008](../decisions/0008-auth-rbac-and-overlay-access.md). What people see:

- **First run.** While there are no accounts, the setup page creates the first Admin. It only works on the server machine itself, opened at a `localhost` address, so nobody else on the venue Wi-Fi can claim the Admin account first.
- **Logging in.** A login lasts until you log out, up to 30 days, so nobody is logged out mid-game. A wrong username and a wrong password get the same answer. After 10 attempts in a minute from one device, further attempts are refused for a minute.
- **New accounts.** An Admin picks a username and a role. The app shows a temporary password **once**; give it to the person. At their first login they must choose their own password, and they can't do anything else until they have.
- **Forgotten passwords.** An Admin resets the password. It works like a new account, and also signs the person out everywhere.
- **Changing your password** signs you out on every other device. The new password must differ from the current one.
- **Signing someone out.** An Admin can sign a user out on every device.
- **There's always an Admin.** The app refuses to delete or demote the last Admin, and an Admin can't delete their own account.
- **Locked out?** If the only Admin forgets their password, run `yarn workspace @obs-producer/server reset-password <username>` on the server machine. It prints a temporary password.
- **Plain HTTP.** The app runs over HTTP on the venue network for now. HTTPS with your own certificate is planned.
- **OBS outputs** don't log in. `/overlay` is public until output token URLs arrive (R5).

The pages for setup, login, changing your password and managing users are in progress. Until they ship, these work through the API.

## Open questions

- What does an Announcer's access look like: assigned per user, or per screen? Which "limited controls" do they get?
- May Producers use OBS controls? The requirement says producers use dashboards, and OBS control is on dashboards.
- May Producers import or export themes and screens they can't edit?
- May Producers edit automation rules, or only pause and override them?
- Should output tokens be rotatable, e.g. after an event, without having to re-add every source in OBS?
