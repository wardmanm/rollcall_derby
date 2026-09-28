---
title: Wiki guide
---
# Wiki guide

How this wiki is organized and how to keep it true. Humans and AI agents follow the same process. Agent-specific notes are kept to a minimum in [AGENTS.md](../AGENTS.md).

## Principles

1. **The wiki describes the app as it is now.** A page that no longer matches reality is a bug. Fix it in the same change that made it wrong.
2. **Each fact has one home.** Everywhere else links to it. Copies drift apart; links don't.
3. **No filler.** Every page carries real requirements, decisions or verified facts. If there's nothing to say yet, don't create the page. List it as planned in its section index instead.
4. **Plain Markdown, relative links.** Pages render on GitHub and in VS Code. Use [Mermaid](https://mermaid.js.org/) code blocks for diagrams.

## Page types

| Type | Where | Kept current? | Purpose |
|---|---|---|---|
| **Living page** | `product/`, `features/`, `architecture/`, `guides/` | Yes, always true | What the app is and does right now |
| **Record page (ADR)** | `decisions/` | No. Dated and immutable once accepted | Why a decision was made at that time |
| **Working paper** | `../design-docs/` (outside the wiki) | No. Snapshot while the work is in progress | Brainstorm specs and implementation plans |
| **Template** | `templates/` | n/a | Starting points for new pages |

## Where things go

| If you're writing down… | It goes in… |
|---|---|
| What a feature must do, its requirements and its open questions | That feature's page in [`features/`](features/README.md) |
| Who may do what (roles, permissions) | [Users and access](features/users-and-access.md#role-matrix), and nowhere else |
| What a term means | [Glossary](product/glossary.md) |
| What's in and out of scope, and why the product exists | [Vision](product/vision.md) |
| What order we build things in | [Roadmap](product/roadmap.md). Link to feature pages; don't restate their status |
| How the system fits together | [Architecture](architecture/README.md) |
| Facts about CRG or OBS APIs | [Integrations](architecture/integrations/crg-scoreboard.md), with the upstream version they were checked against |
| A technical decision and its trade-offs | A new [ADR](decisions/README.md) |
| A hard rule that must never be broken | Its ADR (canonical), repeated word for word in [AGENTS.md](../AGENTS.md#hard-rules) with the ADR number |
| Commands, git workflow, definition of done | [AGENTS.md](../AGENTS.md) |
| How to do a task step by step | A [guide](guides/README.md) |

## Frontmatter

Every wiki page starts with YAML frontmatter. Keep it minimal:

| Page type | Required fields |
|---|---|
| Any page | `title` |
| Feature (`features/*.md`) | `title`, `status` (`planned` · `in-progress` · `shipped` · `deprecated`), `summary` (one sentence; shown in the feature index) |
| ADR (`decisions/NNNN-*.md`) | `title`, `status` (`proposed` · `accepted` · `superseded` · `deprecated`), `date` (`YYYY-MM-DD`), and `superseded_by` (e.g. `"0012"`) when superseded |

Status lives **only** in frontmatter. The tables in the [feature index](features/README.md) and [decision index](decisions/README.md) are generated from it by `node scripts/check-docs.mjs --fix`. Don't edit anything between `<!-- generated:… -->` markers by hand.

## Writing pages

- Open with one or two sentences saying what the page covers.
- Link to a [glossary](product/glossary.md) term the first time a page uses it. If a term is missing, add it to the glossary in the same change.
- Number feature requirements (**R1**, **R2**, …) so ADRs, plans and reviews can refer to them.
- When a question is open, say so. Don't guess or leave a vague placeholder like "TBD"; add the question to the page's open questions section instead (see below).
- Use relative links between pages. Link to a specific heading when it helps (`page.md#heading`). The lint checks that anchors exist.

## How open questions work

Every feature page ends with an `## Open questions` section, written as a bullet list.

- To **add** a question, write it as one bullet. If it's framed as a choice, list the options.
- To **resolve** one, write the answer into the page body, delete the bullet, and write an ADR if the answer is a technical decision.
- To **see them all**, run `node scripts/check-docs.mjs --questions`.

## Feature lifecycle

1. **Planned.** Copy [the feature template](templates/feature.md) into `features/`, fill in the requirements and open questions, link it from the [roadmap](product/roadmap.md), and run `--fix`.
2. **In progress.** Set `status: in-progress` when implementation starts. Specs and plans for the work go in `design-docs/`.
3. **Shipped.** Set `status: shipped`. The page's **Behavior** section now describes what the app actually does. If operators use the feature, add or update a [guide](guides/README.md).
4. **Deprecated.** Set `status: deprecated` and say what replaces it.

## Recording decisions (ADRs)

Write an ADR when a choice is hard to reverse, affects more than one feature, or would surprise a future contributor. Examples: picking a library or protocol, a data-ownership rule, a security model.

1. Get the next number: `node scripts/check-docs.mjs --next-adr`. Numbers are sequential with no gaps; the lint enforces this.
2. Copy [the ADR template](templates/adr.md) to `decisions/NNNN-short-kebab-title.md`.
3. Fill in **Context**, **Decision** and **Consequences**. Keep it short; one screen is ideal.
4. Set `status: proposed` while it's under discussion, and `accepted` once agreed.
5. Run `--fix` to add it to the index.

**An accepted ADR is never rewritten.** To change a decision:
- Write a new ADR that says `Supersedes [ADR-NNNN](NNNN-….md)`.
- On the old ADR, change only `status: superseded`, add `superseded_by: "MMMM"`, and add a one-line note under its title pointing to the new ADR.
- If the old ADR defined a hard rule, update [AGENTS.md](../AGENTS.md#hard-rules) in the same change.

## Specs and plans

Brainstorm specs and implementation plans are working papers. They live in `obs-producer/design-docs/`, outside this wiki, and aren't maintained after their work is done. Whatever durable knowledge they produce must land in the wiki as a feature page, an architecture page or an ADR, in the same change as the implementation.

## The docs lint

`scripts/check-docs.mjs` has no dependencies. Run it from `obs-producer/`.

| Command | Purpose |
|---|---|
| `node scripts/check-docs.mjs` | Check everything. Exits 1 and lists every problem |
| `node scripts/check-docs.mjs --fix` | Regenerate the feature and ADR index tables, then check |
| `node scripts/check-docs.mjs --questions` | Print every open question, grouped by page |
| `node scripts/check-docs.mjs --next-adr` | Print the next ADR number |

It checks:
1. **Frontmatter.** Required fields are present and status values are valid.
2. **Links.** Every relative link and `#anchor` in the wiki and in `AGENTS.md`, `CLAUDE.md` and `README.md` resolves.
3. **Reachability.** Every page can be reached by following links from the [wiki home](README.md).
4. **ADR numbering.** ADR filenames and numbers are well formed, unique and sequential.
5. **Generated tables.** The generated index tables are up to date.

`templates/` is exempt from these checks. The lint's own tests are in `scripts/check-docs.test.mjs`; run them with `node --test "scripts/*.test.mjs"`. CI runs both on every push that touches `obs-producer/` (`.github/workflows/obs-producer-docs.yml`).

## Agent instructions

The rules agents follow live in [AGENTS.md](../AGENTS.md). It is read by Claude Code, through a `CLAUDE.md` that imports it, and by other agents directly. How the instruction files are layered is described in the repo-root `CLAUDE.md`. Don't duplicate wiki content into agent instructions; link to it.
