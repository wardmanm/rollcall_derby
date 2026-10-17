# Changelog

All notable changes to rcl-producer, Rollcall's Producer app and its OBS overlay, are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).

rcl-producer runs on rcl-core, Rollcall's server, which has [its own changelog](../rcl-core/CHANGELOG.md). Before Rollcall, the Producer app and its server were one app, OBS Producer, released as 0.1.0 below.

## [Unreleased]

### Added

- The Producer app at `/producer/`. For now it shows the address to add to OBS for the overlay (#4)
- The Producer app asks you to sign in first, on rcl-core's sign-in page, and brings you back afterwards (#11)

### Changed

- OBS Producer is now **Rollcall**, in its own repository, and this is its Producer app. Its server is now rcl-core: read rcl-core's release notes before upgrading, because settings and the database file are renamed (#2)
- The OBS overlay now uses its own public live connection. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) so it picks up the change (wardmanm/GROBS#14)
- **The OBS overlay moved from `/overlay` to `/producer/overlay`, with no redirect:** change the URL of each OBS browser source (#4)
- The OBS overlay's live connection moved with the app. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) (#5)

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
