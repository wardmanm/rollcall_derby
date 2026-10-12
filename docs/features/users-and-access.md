---
title: Users and Access
status: shipped
summary: Username and password login with Admin, Producer and Announcer roles, enforced on the server.
---
# Users and Access

Basic user accounts and role-based access control. The app runs on a shared venue network, so accounts decide who can change what. This page is the **canonical home of the role matrix and the permission table**; other pages link here instead of restating them.

## Requirements

- **R1.** Users log in with a username and password. The server keeps the session.
- **R2.** On first run, the app asks for the initial Admin account to be created.
- **R3.** Admins create users, reset passwords and assign roles.
- **R4.** Every API route and socket event checks the caller's access on the server: each one is public, open to any signed-in user, or needs a [permission](../product/glossary.md#permission). Hiding UI is not access control ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)).
- **R5.** OBS browser sources can't log in, so each output will be reached through an unguessable token URL ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). Until output tokens arrive with Live Mode, `/producer/overlay` is public.
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

## Permissions

Routes and live connections check [permissions](../product/glossary.md#permission), not roles ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). Each permission belongs to one rcl app and is named `<app>:<action>`. Admins hold every permission. This table says which other roles hold each one, and the API explorer at `/docs` shows the permission each route needs. A test keeps the table in step with the code.

| Permission | Allows | Admin | Producer | Announcer |
|---|---|---|---|---|
| `core:users.manage` | Create users, change their roles, reset their passwords, sign them out and delete them | ✅ | — | — |

The capabilities in the role matrix become permissions here as each feature is built.

## Behavior

How accounts work is decided in [ADR-0018](../decisions/0018-declared-access-and-permissions.md). What people see:

- **First run.** While there are no accounts, every page opens the setup page, which creates the first Admin and signs them in. It only works on the server machine itself, opened at a `localhost` address, so nobody else on the venue Wi-Fi can claim the Admin account first. On any other device, the page says which address to open on the server machine.
- **Logging in.** Every rcl app sends you to rcl-core's sign-in page and then back to the page you wanted, as long as that page is on the same server. A login lasts until you log out, up to 30 days, so nobody is logged out mid-game. A wrong username and a wrong password get the same answer. After 10 attempts in a minute from one device, further attempts are refused for a minute.
- **New accounts.** On the Users page, an Admin picks a username and a role. The app shows a temporary password **once**; give it to the person. It's in a box you can select, and on a `localhost` or HTTPS address there's also a Copy button, since browsers only allow copying there. At their first login they must choose their own password, and they can't do anything else until they have.
- **Forgotten passwords.** An Admin resets the password. It works like a new account, and also signs the person out everywhere.
- **Changing your password** signs you out on every other device. The new password must differ from the current one.
- **Signing someone out.** An Admin can sign a user out on every device. The Users page asks you to confirm before it resets a password, signs someone out or deletes an account.
- **Your account menu**, at the top right of every app, shows your username and role, and has All apps, Change password and Log out. Logging out always works, even if your session has already ended.
- **Only Admins see Users.** Other roles don't get the link, and the server refuses them anyway (R4). The web app asks the server which permissions your role holds rather than guessing from the role.
- **Losing access mid-request.** If an Admin is demoted, deleted or signed out while the server is creating a user or resetting a password, nothing changes and the request is refused. Changing your own password is refused the same way if an Admin reset it in the meantime.
- **There's always an Admin.** The app refuses to delete or demote the last Admin, and an Admin can't delete their own account.
- **Locked out?** If the only Admin forgets their password, run `yarn workspace @rollcall/core-server reset-password <username>` on the server machine. It prints a temporary password. It refuses if `ROLLCALL_DATA_DIR` has no `rollcall.db`, and prints the path it checked.
- **Plain HTTP.** The app runs over HTTP on the venue network for now. HTTPS with your own certificate is planned.
- **OBS outputs** don't log in. `/producer/overlay` is public until output token URLs arrive (R5).

## Open questions

- What does an Announcer's access look like: assigned per user, or per screen? Which "limited controls" do they get?
- May Producers use OBS controls? The requirement says producers use dashboards, and OBS control is on dashboards.
- May Producers import or export themes and screens they can't edit?
- May Producers edit automation rules, or only pause and override them?
- Should output tokens be rotatable, e.g. after an event, without having to re-add every source in OBS?
