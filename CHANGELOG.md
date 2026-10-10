# Changelog

All notable changes to Rollcall are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](docs/guides/releasing.md).

## [Unreleased]

### Added

- Accounts on the server: first-run Admin setup from the server machine, sign-in with 30-day sessions, sign-out and password changes (wardmanm/GROBS#13)
- Admins can create users, change roles, reset passwords and sign users out. Every API route and live connection checks who's asking, and a reset-password command rescues a locked-out Admin (wardmanm/GROBS#14)
- API explorer for developers: Swagger UI at `/docs`, generated from the shared schemas. It's on in `yarn dev`, and on a venue server only with `ROLLCALL_API_DOCS=1` (wardmanm/GROBS#16)
- The API explorer shows who may call each route: anyone, any signed-in user, or the permission it needs, such as `core:users.manage` (#3)
- The Producer app at `/producer/`. For now it shows the address to add to OBS for the overlay (#4)
- The server lists the apps it hosts at `/api/core/apps`, for signed-in users (#5)

### Changed

- OBS Producer is now **Rollcall**, in its own repository. Settings are renamed from `OBS_PRODUCER_*` to `ROLLCALL_*`; the server refuses to start while an old name is still set, so update any launch scripts. Sign in again after upgrading, because the session cookie is renamed (#2)
- The database file is now `rollcall.db`. Rollcall is a new clone, so copy your old `obs-producer/data/` folder into the new clone's `data/` first; the server refuses to start while the data folder holds only the old `obs-producer.db`, and explains how to keep your accounts. `reset-password` refuses a folder with no database and prints the path it checked (#2)
- The OBS overlay now uses its own public live connection. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) so it picks up the change (wardmanm/GROBS#14)
- Access is checked by permission instead of by role. Admins hold every permission, so who can do what is unchanged (#3)
- Each app now has its own address: the admin app is at `/core/` (`/` takes you there) and the Producer app at `/producer/`. **The OBS overlay moved from `/overlay` to `/producer/overlay`, with no redirect:** change the URL of each OBS browser source (#4)
- rcl-core now hosts each app as a module, so every API address starts with its app: `/api/health` is now `/api/core/health`, `/api/auth/login` is `/api/core/auth/login`, and so on. The OBS overlay's live connection moved too: after upgrading, refresh each OBS browser source (right-click ▸ Refresh) (#5)

### Fixed

- The header's server badge has enough contrast to read (wardmanm/GROBS#17)
- An Admin who is demoted, deleted or signed out while creating a user or resetting a password no longer completes the change, and a password change made after an Admin's reset no longer overwrites it (#8)
- The first failed sign-in after the server starts takes as long as later ones, so it doesn't reveal whether the username exists (#8)

## [0.1.0] - 2026-10-02

### Added

- Project wiki: vision, roadmap, glossary, feature pages, architecture and decision records (wardmanm/GROBS#1)
- Agent instructions (`AGENTS.md` / `CLAUDE.md`) shared by AI coding agents and contributors (wardmanm/GROBS#2)
- Docs lint (`scripts/check-docs.mjs`) with CI (wardmanm/GROBS#1)
- Release pipeline: changelog, and a deliberate, approval-gated release workflow (wardmanm/GROBS#3)
- Issue forms (feature, bug, chore), PR template and labels (wardmanm/GROBS#4)
- Server with a health endpoint, and a web app shell that shows whether the server is reachable (wardmanm/GROBS#6, wardmanm/GROBS#8)
- OBS overlay page at `/overlay`: transparent, fed live by the server, and reconnects on its own after a server restart (wardmanm/GROBS#9)

[Unreleased]: https://github.com/wardmanm/rollcall_derby/commits/main
[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0
