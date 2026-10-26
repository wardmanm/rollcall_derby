# Changelog

All notable changes to rcl-core, Rollcall's server and admin app, are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).

rcl-core hosts the other rcl apps, which have their own changelogs, such as [rcl-producer's](../rcl-producer/CHANGELOG.md). Before Rollcall, rcl-core's server and the Producer app were one app, OBS Producer, whose 0.1.0 release is in rcl-producer's changelog.

## [Unreleased]

### Added

- Import and export: export teams and themes, with their logos, photos and fonts, to a file, and import it on another Rollcall. Before anything is saved, the Import dialog shows what's in the file, side by side with anything here of the same name, so you choose to replace it, keep both or skip it. An import saves everything or nothing. Admins and Producers import and export teams (#22)

## [0.2.0] - 2026-10-25

### Added

- Team Builder: Admins and Producers create teams with a league, short name, colors and logo, and their skaters and bench staff, with numbers (`00` keeps its zeros), pronouns, roles and photos. **Save and add another** makes typing in a roster quick. Announcers can view teams, and API keys can be given access to them. Logos and photos are stored on the server and shown to OBS overlays without signing in, so don't upload anything private (#17)
- A font library: six open-licence fonts come with Rollcall, and Admins upload their own (WOFF2, WOFF, TTF or OTF) on the new Fonts page, where each family shows in its own font. Fonts are served by the server for OBS overlays, never from the internet. Upload only fonts you're licensed to use in a broadcast (#19)

## [0.1.0] - 2026-10-19

### Added

- Accounts on the server: first-run Admin setup from the server machine, sign-in with 30-day sessions, sign-out and password changes (wardmanm/GROBS#13)
- Admins can create users, change roles, reset passwords and sign users out. Every API route and live connection checks who's asking, and a reset-password command rescues a locked-out Admin (wardmanm/GROBS#14)
- API explorer for developers: Swagger UI at `/docs`, generated from the shared schemas. It's on in `yarn dev`, and on a venue server only with `ROLLCALL_API_DOCS=1` (wardmanm/GROBS#16)
- The API explorer shows who may call each route: anyone, any signed-in user, or the permission it needs, such as `core:users.manage` (#3)
- The server lists the apps it hosts at `/api/core/apps`, for signed-in users (#5)
- Sign-in, first-run setup and password changes in the web app. Every app asks you to sign in first, and someone given a temporary password chooses their own before anything else (#11)
- A Users page for Admins: create users (each temporary password is shown once), change roles, reset passwords, sign users out and delete accounts (#11)
- rcl-core's home page lists the other installed apps (#11)
- API keys for devices and scripts such as Bitfocus Companion. On the API keys page, Admins create keys scoped to permissions, with an optional expiry, and revoke them. A key is shown once, and never holds account-admin permissions (#7)

### Changed

- OBS Producer is now **Rollcall**, in its own repository. Settings are renamed from `OBS_PRODUCER_*` to `ROLLCALL_*`; the server refuses to start while an old name is still set, so update any launch scripts. Sign in again after upgrading, because the session cookie is renamed (#2)
- The database file is now `rollcall.db`. Rollcall is a new clone, so copy your old `obs-producer/data/` folder into the new clone's `data/` first; the server refuses to start while the data folder holds only the old `obs-producer.db`, and explains how to keep your accounts. `reset-password` refuses a folder with no database and prints the path it checked (#2)
- Access is checked by permission instead of by role. Admins hold every permission, so who can do what is unchanged (#3)
- The admin app is now at `/core/`, and `/` takes you there (#4)
- rcl-core now hosts each app as a module, so every API address starts with its app: `/api/health` is now `/api/core/health`, `/api/auth/login` is `/api/core/auth/login`, and so on (#5)
- The server explains a rejected form in plain words, such as "Use at least 10 characters" (#11)

### Fixed

- The header's server badge has enough contrast to read (wardmanm/GROBS#17)
- An Admin who is demoted, deleted or signed out while creating a user or resetting a password no longer completes the change, and a password change made after an Admin's reset no longer overwrites it (#8)
- The first failed sign-in after the server starts takes as long as later ones, so it doesn't reveal whether the username exists (#8)
- Logging out works even after the session has ended, and always clears the cookie (#11)

[Unreleased]: https://github.com/wardmanm/rollcall_derby/compare/rcl-core-v0.2.0...HEAD
[0.2.0]: https://github.com/wardmanm/rollcall_derby/releases/tag/rcl-core-v0.2.0
[0.1.0]: https://github.com/wardmanm/rollcall_derby/releases/tag/rcl-core-v0.1.0
