@AGENTS.md

## Claude Code notes

Shared rules live in `AGENTS.md` (imported above) so every agent reads the same instructions. Only Claude-specific notes go in this file.

- **Where superpowers output goes.** This overrides the skills' default `docs/superpowers/` location:
  - Brainstorming specs: `design-docs/specs/YYYY-MM-DD-<topic>-design.md`
  - Implementation plans: `design-docs/plans/YYYY-MM-DD-<topic>.md`

  These are working papers. When a spec settles something durable, move it into the wiki (a feature page, an architecture page or an ADR) in the same change.
- **Read wiki pages when a task needs them.** Don't `@`-import them into this file, because imports load into every session.
- **Integration pages record the upstream versions they were checked against.** These are `docs/architecture/integrations/crg-scoreboard.md` and `obs-websocket.md`. If you build against a newer CRG or obs-websocket, re-check the facts you rely on and update the "Verified against" line.
- **Path-scoped rules** in `.claude/rules/` map each code area to its hard rules, ADRs and wiki pages: one file per code area (each app's `CLAUDE.md` names its own), plus `sdk.md` for `packages/` and `e2e.md`. They load when Claude reads matching files. When code moves, docs are renamed or a new code area appears, update or add a rule in the same change.
- **Releases:** `/release <app> <version>` (`.claude/skills/release/`) prepares a release of one rcl app. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.

### Maintaining agent instructions

How the instruction files are layered, so they stay small and don't contradict each other:

- **`AGENTS.md`** is the source of truth at each level: the repo root, and each `rcl-*` app folder once it has one. **`CLAUDE.md`** starts with `@AGENTS.md` and adds only Claude-specific notes. Never copy rules between the two; import them.
- **Nested files add to the root; they don't replace it.** Claude loads the root `CLAUDE.md` at launch, and an app's `CLAUDE.md` (e.g. `rcl-core/CLAUDE.md`) when it first reads a file inside that folder.
- **Keep each `CLAUDE.md`/`AGENTS.md` under ~200 lines.** Anything longer belongs somewhere else:
  - Multi-step procedures go in a skill: `.claude/skills/<name>/SKILL.md`.
  - Rules that only matter for certain files go in `.claude/rules/<topic>.md`, with `paths:` globs in the frontmatter so they load only when matching files are read.
  - Reference material stays in the wiki and gets linked, never `@`-imported. Imports load into every session.
- **`CLAUDE.local.md`** is for personal notes and is gitignored. The `@AGENTS.md` import keeps shared rules loading even if one exists.
- Run `/doctor prompt-audit` to catch stale or conflicting instructions after large edits.

## Session status log

Keep `.claude/status.md` current so Mike's daily update knows where this project stands. Update it before every push and before ending a session, even if no code changed. Commit it on the same branch as the work.

Keep the file under ~60 lines, in this structure:

```markdown
# Status: <project name>
Updated: YYYY-MM-DD · Branch: <branch>

## Current focus
One or two sentences on what's being worked on right now.

## Recent changes
- YYYY-MM-DD: what changed, in plain language (keep the last ~10; drop older ones)

## Pending decisions
- **<the question>** (raised YYYY-MM-DD). Options: A / B / C. Leaning: <only if Mike has said>. Blocks: <what's waiting on it>

## Loose ends
- Unfinished work, known bugs, failing tests, PRs waiting on review
```

Rules:
- Something is only decided when Mike says so. Your own recommendations go under Pending decisions as options, not outcomes.
- When a decision is made, remove it from Pending decisions and note the outcome under Recent changes.
- Delete loose ends once they're done. Stale items make the daily update wrong.
- No secrets, credentials or client-confidential details. This repo is public.
