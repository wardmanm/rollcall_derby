---
title: Import / Export
status: planned
summary: Move teams, themes and screens between installs as versioned, validated JSON.
---
# Import / Export

Teams, themes, screens and other saved data can be exported to JSON files and imported again. This supports backups, sharing between leagues, and moving setups from one venue laptop to another.

## Users and roles

Admins can import and export everything. Producers can import and export teams. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Teams, themes and screens can be exported and imported. Other entities may be added later.
- **R2.** Every file carries a versioned envelope that identifies its format, its kind (team, theme, screen) and its format version. The schemas are shared Zod schemas ([ADR-0007](../decisions/0007-shared-zod-contract.md)).
- **R3.** Imports are validated before anything is saved. A file that fails validation changes nothing, and the error says what's wrong and where.
- **R4.** Files in older formats are migrated when imported, so an export always stays importable by later versions.
- **R5.** Media that belongs to exported data (team photos and logos, theme fonts) travels with the export.

## Behavior

Not built yet.

## Open questions

- How is media packaged: embedded as base64 in the JSON, or a `.zip` bundle containing the JSON and media files?
- What happens when an imported item matches an existing one (same ID or name): import as new, overwrite, or ask?
- Should importing a CRG team export (`crg-team-*.json` from CRG's read-only `GET /SaveJSON/`) be supported directly?
- Do events and games need export, e.g. to prepare a tournament on one machine and run it on another?
