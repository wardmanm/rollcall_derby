---
title: Decisions (ADRs)
---
# Decisions (ADRs)

Architecture Decision Records explain **why** OBS Producer is built the way it is. Each one records a single decision, with the context it was made in and its consequences. Accepted ADRs are never rewritten. A later ADR supersedes them instead ([ADR-0001](0001-record-decisions-as-adrs.md)).

To write a new one, follow [recording decisions](../wiki-guide.md#recording-decisions-adrs) and start from the [ADR template](../templates/adr.md). The table below is **generated** from frontmatter; run `node scripts/check-docs.mjs --fix` after adding or changing an ADR.

<!-- generated:decisions -->
| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-record-decisions-as-adrs.md) | Record decisions as ADRs | accepted | 2026-09-28 |
| [0002](0002-initial-technology-stack.md) | Initial technology stack | superseded by [0011](0011-technology-stack-with-yarn.md) | 2026-09-28 |
| [0003](0003-client-state-with-redux-toolkit.md) | Client state with Redux Toolkit | accepted | 2026-09-28 |
| [0004](0004-server-is-the-hub.md) | Server is the hub | accepted | 2026-09-28 |
| [0005](0005-crg-is-listen-only.md) | CRG is listen-only | accepted | 2026-09-28 |
| [0006](0006-one-overlay-renderer-css-variable-theming.md) | One overlay renderer, CSS-variable theming | accepted | 2026-09-28 |
| [0007](0007-shared-zod-contract.md) | Shared Zod contract | accepted | 2026-09-28 |
| [0008](0008-auth-rbac-and-overlay-access.md) | Auth, RBAC and overlay access | proposed | 2026-09-28 |
| [0009](0009-deliberate-milestone-driven-releases.md) | Deliberate, milestone-driven releases | superseded by [0010](0010-deliberate-releases-patch-tracking.md) | 2026-09-28 |
| [0010](0010-deliberate-releases-patch-tracking.md) | Deliberate releases, milestones for planned versions only | accepted | 2026-09-29 |
| [0011](0011-technology-stack-with-yarn.md) | Technology stack, with Yarn workspaces | superseded by [0012](0012-typescript-7-and-oxlint.md) | 2026-09-29 |
| [0012](0012-typescript-7-and-oxlint.md) | Technology stack, TypeScript 7 and Oxlint | accepted | 2026-09-29 |
| [0013](0013-run-typescript-natively-on-node.md) | Run TypeScript natively on Node | accepted | 2026-09-29 |
<!-- /generated:decisions -->
