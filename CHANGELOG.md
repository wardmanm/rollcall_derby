# Changelog

All notable changes to OBS Producer are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](docs/guides/releasing.md).

## [Unreleased]

### Added

- Accounts on the server: first-run Admin setup from the server machine, sign-in with 30-day sessions, sign-out and password changes (#13)

## [0.1.0] - 2026-10-02

### Added

- Project wiki: vision, roadmap, glossary, feature pages, architecture and decision records (#1)
- Agent instructions (`AGENTS.md` / `CLAUDE.md`) shared by AI coding agents and contributors (#2)
- Docs lint (`scripts/check-docs.mjs`) with CI (#1)
- Release pipeline: changelog, and a deliberate, approval-gated release workflow (#3)
- Issue forms (feature, bug, chore), PR template and labels (#4)
- Server with a health endpoint, and a web app shell that shows whether the server is reachable (#6, #8)
- OBS overlay page at `/overlay`: transparent, fed live by the server, and reconnects on its own after a server restart (#9)

[Unreleased]: https://github.com/wardmanm/GROBS/compare/obs-producer-v0.1.0...HEAD
[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0
