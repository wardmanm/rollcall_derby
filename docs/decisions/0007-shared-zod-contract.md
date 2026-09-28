---
title: Shared Zod contract
status: accepted
date: 2026-09-28
---
# 0007. Shared Zod contract

## Context

The server and the web app exchange data three ways: REST requests, Socket.IO messages, and JSON import/export files that may be years old. If the shapes are defined separately on each side, they drift apart silently. Untrusted input also needs to be validated at runtime, not just type-checked. That input includes imported files and messages from any browser on the LAN.

## Decision

- **Zod schemas in `packages/shared` are the single contract.** TypeScript types are derived from them (`z.infer`). Nobody hand-writes a duplicate interface.
- **The server validates all input against them.** That covers REST bodies, socket payloads and imported files.
- **Overlay component options are Zod schemas too** ([overlay components](../features/overlay-components.md)), so the builder can validate options and render forms from them.
- **Import/export files are versioned.** Each file carries an envelope with its format, its kind and a format version. The shared package keeps a schema for every version it can still read, plus migrations up to the current one ([import / export](../features/import-export.md)).

## Consequences

- Changing a shape is a compile error everywhere it matters.
- Invalid input fails with a precise error before it can touch the database.
- Any breaking change to an export format needs a new version and a migration. Old exports must stay importable.
