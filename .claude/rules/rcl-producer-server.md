---
paths:
  - "rcl-producer/server/**"
---
# rcl-producer server (`rcl-producer/server/`, ADR-0019)

- **This is an app module, not a server.** `src/index.ts` exports `producerApp`, which rcl-core's server hosts. It never starts a process, opens a port or opens the database itself.
- **Depend only on `@rollcall/app-sdk` and contracts** (`@rollcall/producer-contract`, `@rollcall/core-contract`). Never on `@rollcall/core-server`: `scripts/check-boundaries.test.mjs` fails otherwise.
- **Hard rules 1–5** in `AGENTS.md` apply here, as on rcl-core's server.
- **Everything is named after the app:**
  - routes are relative to `/api/producer` (`/themes`, not `/api/producer/themes`), with tags `producer/<area>`;
  - namespaces are at or below `/producer`;
  - permissions are `producer:<action>`, listed in `permissions` with the roles that hold them, and in the table on `docs/features/users-and-access.md`;
  - tables are `producer_<name>`, in migrations under `migrationsFolder` (`rcl-core/server/src/installed-apps.test.ts` checks the names).
- **Every route and namespace declares its access** (hard rule 5, ADR-0018), and validates its input with schemas from `@rollcall/producer-contract` (ADR-0014).
- **`rollcall.requiresCore`** in `package.json` is the rcl-core range this app works with. Change it deliberately when core's version changes.
