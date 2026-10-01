@AGENTS.md

## Claude Code notes

These add to the repo-root `CLAUDE.md`. Shared rules belong in `AGENTS.md` above, not here.

- **Where superpowers output goes.** This overrides the skills' default `docs/superpowers/` location:
  - Brainstorming specs: `design-docs/specs/YYYY-MM-DD-<topic>-design.md`
  - Implementation plans: `design-docs/plans/YYYY-MM-DD-<topic>.md`

  These are working papers. When a spec settles something durable, move it into the wiki (a feature page, an architecture page or an ADR) in the same change.
- **Read wiki pages when a task needs them.** Don't `@`-import them into this file, because imports load into every session.
- **Integration pages record the upstream versions they were checked against.** These are `docs/architecture/integrations/crg-scoreboard.md` and `obs-websocket.md`. If you build against a newer CRG or obs-websocket, re-check the facts you rely on and update the "Verified against" line.
- **Path-scoped rules** in the repo-root `.claude/rules/obs-producer-*.md` (server, web, overlay, shared, e2e) map each code area to its hard rules, ADRs and wiki pages. They load when Claude reads matching files. When code moves, docs are renamed or a new code area appears, update or add a rule in the same change.
- **Releases:** `/release <version>` (repo-root `.claude/skills/release/`) prepares a release. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.
