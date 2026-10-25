---
title: rcl-core shares data with apps through read-only services
status: accepted
date: 2026-10-24
---
# 0023. rcl-core shares data with apps through read-only services

## Context

[ADR-0019](0019-rcl-apps-as-modules.md) keeps apps out of rcl-core's internals: core's data must be added to `AppContext` on purpose, one service at a time. The [Theme Builder](../features/theme-builder.md) needs the first one. Themes live in rcl-producer, but the fonts they use are in rcl-core's font library, shared data like team logos. The Producer app must read that library to send the OBS overlay the right fonts.

Options considered:
- **Apps read core's tables,** passing core's schema to `ctx.db()`. Rejected: every core migration could break an app without a compile error, and the boundary test already keeps apps away from core's server code.
- **Apps call core's HTTP API** over the loopback. Rejected: the server would need credentials for itself, and each call would pay for HTTP and an access check it doesn't need.
- **Each app keeps its own copy** of the data it needs. Rejected: copies drift, and the data is shared on purpose.

## Decision

- **rcl-core shares its data with apps through read-only services on `AppContext`,** added one at a time. Each returns data in a shape from `@rollcall/core-contract`, the same one core's routes reply with.
- **Fonts are the first:** `ctx.fonts.list()` returns the font library as `GET /api/core/fonts` lists it.
- **Apps read core data only through these services,** never through core's tables or code.
- **The services are read-only.** Core's data changes only through core's own routes, which check the caller's access (hard rule 5). A service that writes needs an ADR of its own.
- **A service returns the data as it is when called.** It doesn't announce changes; an app reads again when it needs to.
- **Each app gets one `AppContext`,** passed to both `register()` and `realtime()`, so an app can share state between its routes and its namespaces through it.

## Consequences

- Core's tables can change without breaking apps, as long as each service keeps its shape. Changing a shape is a breaking change to `@rollcall/core-contract` and needs a new `requiresCore` range in every app that uses it.
- An app can't notice core's changes as they happen. A font uploaded while an overlay is open reaches it with the next theme change, or the next time it loads. Announcing changes is left until an app needs it.
- Teams, CRG and OBS will follow as services, each added when an app first needs it.
