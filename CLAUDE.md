@AGENTS.md

## Claude Code notes

These add to the repo-root `CLAUDE.md`. Shared rules belong in `AGENTS.md` above, not here.

- **Where superpowers output goes.** This overrides the skills' default `docs/superpowers/` location:
  - Brainstorming specs: `design-docs/specs/YYYY-MM-DD-<topic>-design.md`
  - Implementation plans: `design-docs/plans/YYYY-MM-DD-<topic>.md`

  These are working papers. When a spec settles something durable, move it into the wiki (a feature page, an architecture page or an ADR) in the same change.
- **Read wiki pages when a task needs them.** Don't `@`-import them into this file, because imports load into every session.
- **Integration pages record the upstream versions they were checked against.** These are `docs/architecture/integrations/crg-scoreboard.md` and `obs-websocket.md`. If you build against a newer CRG or obs-websocket, re-check the facts you rely on and update the "Verified against" line.
- **After the scaffold (roadmap Phase 0), add path-scoped rules** that map code to its docs. Put them in the repo-root `.claude/rules/`, with globs prefixed by `obs-producer/`, for example:

  ```md
  ---
  paths:
    - "obs-producer/apps/web/src/overlay/**"
  ---
  Overlay code: behavior is specified in obs-producer/docs/features/overlay-components.md
  and constrained by ADR-0006. Update the page in the same change.
  ```

  Editing code then brings up the page to keep in sync.
