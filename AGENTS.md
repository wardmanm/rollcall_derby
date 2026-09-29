# OBS Producer — agent instructions

OBS Producer is a web app hosted on the local network for producing roller derby streams:
- **Builders** for teams, themes, and overlay screens. Each screen is loaded into OBS as a browser source.
- **Live Mode** for events, games, and tracks running at the same time, with producer dashboards that preview and control what's on air.
- **Integrations** that control OBS and *listen* to the CRG scoreboard.

**Status:** pre-scaffold. The wiki, these instructions, the docs lint and the release pipeline exist; app code does not yet. See the [roadmap](docs/product/roadmap.md).

These rules apply to AI agents and human contributors alike. They add to the repo-root [AGENTS.md](../AGENTS.md).

## Start here

- [Wiki home](docs/README.md) — everything about the product, features, architecture and decisions.
- [Wiki guide](docs/wiki-guide.md) — how the wiki is organized and maintained. Read it before editing docs.
- [Glossary](docs/product/glossary.md) — use these terms exactly. A **Screen** (ours) is not an OBS **Scene**. An **Overlay Component** is not a React component.

## Hard rules

These must never be broken. Each one is copied word for word from the ADR in brackets, and that ADR is the canonical wording. If you change a rule, change the ADR (by superseding it) and this list together.

1. **CRG is listen-only.** Outbound WebSocket messages to CRG are exactly `Register` and `Ping`, sent through the single CRG send wrapper. The only HTTP request allowed is `GET /SaveJSON/`. Never send `Set`, `StartNewGame` or command keys. Never call `/Load/*` or `/Media/*`. ([ADR-0005](docs/decisions/0005-crg-is-listen-only.md))
2. **No scoring, no score displays.** CRG owns scoring, clocks and its own scoreboard overlay. We build rosters and custom game-data displays. ([ADR-0005](docs/decisions/0005-crg-is-listen-only.md))
3. **The server is the hub.** Browsers (dashboards, overlays) never connect to OBS or CRG directly. Secrets such as the OBS password never reach a browser. ([ADR-0004](docs/decisions/0004-server-is-the-hub.md))
4. **Works offline at the venue.** Nothing at runtime depends on the internet: no CDNs, no hosted fonts, no cloud APIs. The server serves every asset. ([ADR-0004](docs/decisions/0004-server-is-the-hub.md))
5. **Authorization happens on the server.** Every API route and socket event checks the caller's role. Hiding UI is not access control. ([ADR-0008](docs/decisions/0008-auth-rbac-and-overlay-access.md))
6. **Server data lives in RTK Query, never copied into slices.** Overlay components are presentational: they get data through props and never read the admin store. ([ADR-0003](docs/decisions/0003-client-state-with-redux-toolkit.md), [ADR-0006](docs/decisions/0006-one-overlay-renderer-css-variable-theming.md))
7. **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version. ([ADR-0010](docs/decisions/0010-deliberate-releases-patch-tracking.md))

## Stack

Details and rationale are in the [ADRs](docs/decisions/README.md).

- TypeScript (strict) monorepo with Yarn 4 workspaces, Node ≥ 24 LTS ([ADR-0011](docs/decisions/0011-technology-stack-with-yarn.md))
- Web: Vite + React SPA, React Router, Mantine for admin UI, Redux Toolkit + RTK Query ([ADR-0011](docs/decisions/0011-technology-stack-with-yarn.md), [ADR-0003](docs/decisions/0003-client-state-with-redux-toolkit.md))
- Server: Fastify + Socket.IO; SQLite via Drizzle ([ADR-0011](docs/decisions/0011-technology-stack-with-yarn.md), [ADR-0004](docs/decisions/0004-server-is-the-hub.md))
- Contract: Zod schemas in `packages/shared` ([ADR-0007](docs/decisions/0007-shared-zod-contract.md))
- Tests: Vitest, React Testing Library, Playwright

## Layout

```
obs-producer/
├── docs/              the wiki (living pages + ADRs)
├── design-docs/       dated specs and plans (working papers, not maintained after use)
├── CHANGELOG.md       release notes; add a line under Unreleased for user-visible changes
├── scripts/           check-docs.mjs (docs lint), release.mjs (release helper) + tests
│   planned after scaffold (ADR-0011):
├── apps/server/       Fastify API, Socket.IO, OBS/CRG connections, SQLite
├── apps/web/          React SPA (admin + dashboards) and the overlay entry
└── packages/shared/   Zod schemas and types shared by server and web
```

## Commands

Run from `obs-producer/`:

| Command | What it does |
|---|---|
| `node scripts/check-docs.mjs` | Lint the wiki: frontmatter, links, anchors, reachability, ADR numbering, generated tables |
| `node scripts/check-docs.mjs --fix` | Regenerate the feature and ADR index tables from frontmatter, then lint |
| `node scripts/check-docs.mjs --questions` | List every open question across the wiki |
| `node scripts/check-docs.mjs --next-adr` | Print the next free ADR number |
| `node --test "scripts/*.test.mjs"` | Test the scripts (docs lint, release helper) |
| `node scripts/release.mjs prepare <version>` | Move `Unreleased` notes under `<version>` and bump package versions ([releasing](docs/guides/releasing.md)) |
| `node scripts/release.mjs check <version>` | Check that the changelog and versions are ready to release |
| `node scripts/release.mjs notes <version>` | Print a version's release notes |
| `node scripts/release.mjs tag-absent\|milestone\|issues <version>` | Used by the release workflow: tag and milestone checks before and after approval, and the issue numbers to mark as released |

App commands (`yarn dev`, `yarn test`, `yarn lint`, `yarn build`) arrive with the scaffold in roadmap Phase 0. Add them to this table then, and wire the lint in as `yarn docs:check`.

## Documentation rules

The full process is in the [wiki guide](docs/wiki-guide.md).

1. **Docs change in the same commit as the behavior they describe.** A behavior change that leaves its feature or architecture page untouched is incomplete.
2. **One home per fact.** See [where things go](docs/wiki-guide.md#where-things-go). Link to the home instead of copying it.
3. **Decisions become ADRs** in `docs/decisions/`. Number them with `--next-adr`, start from `docs/templates/adr.md`, and run `--fix` to add them to the index. Never rewrite an accepted ADR; supersede it with a new one.
4. **Status lives only in frontmatter.** After changing a feature's or ADR's frontmatter, run `--fix`. Never hand-edit the generated tables.
5. **Unresolved questions go in the page's `## Open questions` section.** When one is answered, move the answer into the page body (plus an ADR if it's a decision) and delete the question.
6. **Use the glossary's terms.** Add any new domain term to the glossary in the same change.

## Definition of done

- Behavior matches its feature page, and the page is updated if behavior changed.
- Tests are added or updated, and they pass.
- `node scripts/check-docs.mjs` passes.
- User-visible changes have a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), ending with the issue number.
- Every hard rule above still holds.
