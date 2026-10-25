# Changelog

All notable changes to rcl-producer, Rollcall's Producer app and its OBS overlay, are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).

rcl-producer runs on rcl-core, Rollcall's server, which has [its own changelog](../rcl-core/CHANGELOG.md). Before Rollcall, the Producer app and its server were one app, OBS Producer, released as 0.1.0 below.

## [Unreleased]

## [0.3.0] - 2026-10-25

### Added

- Theme Builder: Admins create themes with colors, fonts from rcl-core's font library, sizes, corner radius, border width and extra colors, with a live preview of every change. Producers can view themes (#20)
- The default theme styles the OBS overlay, which changes at once, with no reload, whenever the default theme is saved or another is chosen (#20)

### Changed

- The overlay's theme variables are renamed and extended, for example `--theme-font-family` is now `--theme-font-body` (#20)
- Needs rcl-core 0.2.0 or later, for its font library: upgrade rcl-core first (#20)

## [0.2.0] - 2026-10-19

### Added

- The Producer app at `/producer/`. For now it shows the address to add to OBS for the overlay (#4)
- The Producer app asks you to sign in first, on rcl-core's sign-in page, and brings you back afterwards (#11)

### Changed

- OBS Producer is now **Rollcall**, in its own repository, and this is its Producer app. Its server is now rcl-core: read rcl-core's release notes before upgrading, because settings and the database file are renamed (#2)
- **The OBS overlay moved from `/overlay` to `/producer/overlay`, with no redirect:** after upgrading, change the URL of each OBS browser source. Changing the URL also reloads the overlay, so it picks up the two changes below; there's nothing else to do in OBS (#4)
- The OBS overlay now uses its own public live connection (wardmanm/GROBS#14)
- The OBS overlay's live connection moved to the Producer app, alongside its new address (#5)

## [0.1.0] - 2026-10-02

### Added

- Project wiki: vision, roadmap, glossary, feature pages, architecture and decision records (wardmanm/GROBS#1)
- Agent instructions (`AGENTS.md` / `CLAUDE.md`) shared by AI coding agents and contributors (wardmanm/GROBS#2)
- Docs lint (`scripts/check-docs.mjs`) with CI (wardmanm/GROBS#1)
- Release pipeline: changelog, and a deliberate, approval-gated release workflow (wardmanm/GROBS#3)
- Issue forms (feature, bug, chore), PR template and labels (wardmanm/GROBS#4)
- Server with a health endpoint, and a web app shell that shows whether the server is reachable (wardmanm/GROBS#6, wardmanm/GROBS#8)
- OBS overlay page at `/overlay`: transparent, fed live by the server, and reconnects on its own after a server restart (wardmanm/GROBS#9)

[Unreleased]: https://github.com/wardmanm/rollcall_derby/compare/rcl-producer-v0.3.0...HEAD
[0.3.0]: https://github.com/wardmanm/rollcall_derby/releases/tag/rcl-producer-v0.3.0
[0.2.0]: https://github.com/wardmanm/rollcall_derby/releases/tag/rcl-producer-v0.2.0
[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0
