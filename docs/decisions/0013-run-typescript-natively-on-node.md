---
title: Run TypeScript natively on Node
status: accepted
date: 2026-09-29
---
# 0013. Run TypeScript natively on Node

## Context

The server is written in TypeScript and imports `@obs-producer/shared` as TypeScript source, since shared has no build step ([ADR-0012](0012-typescript-7-and-oxlint.md)). Something has to turn that TypeScript into JavaScript Node can run.

Options considered:
- **Compile with `tsc` or bundle with esbuild/tsdown** into a `dist/` folder. Rejected: it adds a build step and a second output tree to keep in sync, and the shared package would need building or bundling too.
- **Run through a loader such as `tsx`.** Rejected: it's an extra runtime dependency when Node can now do the same thing itself.
- **Node's built-in type stripping.** Node ≥ 24 runs `.ts` files directly by removing the type annotations. It doesn't check types, and it only accepts syntax that can be removed without changing behavior. **Chosen.** Verified on Node 24.21 and 26.7, including the shared package reached through its workspace link.

## Decision

- **The server runs its TypeScript directly:** `node src/main.ts`, and `node --watch src/main.ts` in development. It has no build step.
- **All TypeScript is erasable-only** (`erasableSyntaxOnly` in `tsconfig.base.json`). That rules out `enum`, `namespace`, constructor parameter properties and `import x = require()`. Use `as const` objects and union types instead of enums.
- **Relative imports include the `.ts` extension** (`allowImportingTsExtensions`), e.g. `import { x } from './health.ts'`. Type-only imports use `import type` (`verbatimModuleSyntax`).
- **Type checking is `tsc`'s job** (`yarn typecheck`), because Node never checks types.

## Consequences

- There's no server build output. Packaging (roadmap Phase 5) ships the sources plus `node_modules`.
- Workspace packages must be reached through package `exports`. Node ignores tsconfig `paths`.
- Node never type-strips files inside `node_modules`. Our workspaces work because Node follows their links to their real paths under `apps/` and `packages/`. Running with `--preserve-symlinks`, or using a published package that ships only TypeScript, would break this.
- The web app and overlay are unaffected: Vite compiles their TypeScript, and the `.ts` import extensions work there too.
