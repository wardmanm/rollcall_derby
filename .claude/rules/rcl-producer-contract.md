---
paths:
  - "rcl-producer/contract/**"
---
# rcl-producer contract (`rcl-producer/contract/`, ADR-0019)

- **The Producer app's Zod schemas:** `/api/producer`, its namespaces (such as the overlay's `server:hello`), and its import/export formats.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`docs/features/import-export.md`).
- **Keep it lean:** the Producer app's server, its web app and the overlay all use this package. No runtime dependencies beyond `zod`, and no Node-only or DOM-only APIs.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
