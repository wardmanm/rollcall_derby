---
paths:
  - "obs-producer/packages/shared/**"
---
# obs-producer shared contract (`obs-producer/packages/shared/`, ADR-0007)

- **Zod schemas are the single contract** for REST, Socket.IO and import/export.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`obs-producer/docs/features/import-export.md`).
- **Keep it lean:** server, web app and overlay all use this package. That means no runtime dependencies beyond `zod`, and no Node-only or DOM-only APIs.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
