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
- **Keep it lean:** the Producer app's server, its web app and the overlay all use this package. No runtime dependencies beyond `zod` and `@rollcall/core-contract` (whose only one is `zod`), and no Node-only or DOM-only APIs.
- **Themes** (`src/themes.ts`): the token schema, `DEFAULT_TOKENS` (the built-in look) and `themeToCss`, which the editor's preview and the overlay both use. Token rules and variable names are in `docs/features/theme-builder.md`.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
