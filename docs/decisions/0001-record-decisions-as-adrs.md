---
title: Record decisions as ADRs
status: accepted
date: 2026-09-28
---
# 0001. Record decisions as ADRs

## Context

OBS Producer will be built and maintained over time by volunteers and AI agents. Neither can ask the original author why something was done. Decisions scattered through chat, commits and code comments get lost, get made again differently, or get undone by accident.

## Decision

We record significant decisions as short Architecture Decision Records in `docs/decisions/`, using a light MADR-style format: **Context**, **Decision**, **Consequences**.

- **Naming.** Files are named `NNNN-kebab-title.md`. Numbers are sequential with no gaps. The next number is the highest existing number plus one (`node scripts/check-docs.mjs --next-adr`).
- **Frontmatter.** Each ADR has `title`, `status` (`proposed` · `accepted` · `superseded` · `deprecated`), `date`, and `superseded_by` when superseded.
- **Immutability.** An accepted ADR is **never rewritten**. To change a decision, write a new ADR that supersedes it. On the old ADR, change only its status, add `superseded_by`, and add a pointer line.
- **Hard rules.** When an ADR defines a hard rule, the ADR holds the canonical wording. `AGENTS.md` repeats that wording word for word, tagged with the ADR number.

## Consequences

- The reasoning survives. Contributors and agents can check the ADRs before proposing a change.
- A small amount of overhead per decision. We accept it only for choices that are hard to reverse, affect several features, or would surprise a newcomer. The [wiki guide](../wiki-guide.md#recording-decisions-adrs) has the full process.
- The docs lint enforces numbering, frontmatter and the generated index.
