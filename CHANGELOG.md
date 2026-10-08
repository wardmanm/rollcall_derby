# Changelog

All notable changes to OBS Producer are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](docs/guides/releasing.md).

## [Unreleased]

### Added

- Accounts on the server: first-run Admin setup from the server machine, sign-in with 30-day sessions, sign-out and password changes (wardmanm/GROBS#13)
- Admins can create users, change roles, reset passwords and sign users out. Every API route and live connection checks who's asking, and a reset-password command rescues a locked-out Admin (wardmanm/GROBS#14)
- API explorer for developers: Swagger UI at `/docs`, generated from the shared schemas. It's on in `yarn dev`, and on a venue server only with `OBS_PRODUCER_API_DOCS=1` (wardmanm/GROBS#16)

### Changed

- The OBS overlay now uses its own public live connection. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) so it picks up the change (wardmanm/GROBS#14)

### Fixed

- The header's server badge has enough contrast to read (wardmanm/GROBS#17)

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
