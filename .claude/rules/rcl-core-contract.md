---
paths:
  - "rcl-core/contract/**"
---
# rcl-core contract (`rcl-core/contract/`, ADR-0019)

- **This is rcl-core's contract:** `/api/core` and core's namespaces. Each rcl app has its own (`rcl-<app>/contract`), and an app may use another's.

- **Zod schemas are the single contract** for REST, Socket.IO and import/export.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`docs/features/import-export.md`, ADR-0024). The export file's manifest, choices and core's kinds (`TeamItemSchema`, `FontFaceItemSchema`) are in `src/transfer.ts`.
- **Keep it lean:** servers, web apps and the web SDK all use this package. That means no runtime dependencies beyond `zod`, and no Node-only or DOM-only APIs.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
