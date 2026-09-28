---
title: OBS Producer wiki
---
# OBS Producer wiki

OBS Producer is a web app, hosted on the local network, for producing roller derby streams. You build teams, themes and overlay screens ahead of time. On game day you run them live from producer dashboards, while OBS shows the screens as browser sources and the CRG scoreboard feeds live game data in.

This wiki is the source of truth for what the app does, how it's built, and why. Humans and AI agents both maintain it, following the [wiki guide](wiki-guide.md).

## Sections

| Section | What's there | Start with |
|---|---|---|
| **Product** | Why we're building it, what's in and out of scope, the plan, and shared vocabulary | [Vision](product/vision.md) · [Roadmap](product/roadmap.md) · [Glossary](product/glossary.md) |
| **Features** | What the app does: one page per feature, with requirements, status and open questions | [Feature index](features/README.md) |
| **Architecture** | How it's built: system overview, data model, and the CRG and OBS integrations | [Architecture overview](architecture/README.md) |
| **Decisions** | Why it's built that way: Architecture Decision Records (ADRs) | [Decision index](decisions/README.md) |
| **Guides** | Step-by-step how-tos for operators (game day) and developers | [Guides](guides/README.md) |

## Status legend

| Page type | Statuses |
|---|---|
| Feature | `planned` → `in-progress` → `shipped` (or `deprecated`) |
| ADR | `proposed` → `accepted` (later `superseded` or `deprecated`) |

## Contributing

1. Read the [wiki guide](wiki-guide.md). It covers where each fact belongs, the page templates, and how to record a decision.
2. Update the wiki in the same commit as the change it describes.
3. From `obs-producer/`, run `node scripts/check-docs.mjs` before committing. CI runs it too.
