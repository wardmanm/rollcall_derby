---
title: "Import and export: core hosts them, apps own their kinds"
status: accepted
date: 2026-10-26
---
# 0024. Import and export: core hosts them, apps own their kinds

## Context

[Import / export](../features/import-export.md) moves teams and themes between installs as files. Teams and fonts live in rcl-core; themes live in the Producer app. One file can hold both, and an import must save everything or nothing (R3). A theme's uploaded fonts travel with it, but [ADR-0023](0023-core-data-services-for-apps.md) keeps apps from writing core's data.

Options considered:
- **Each app exports its own kinds, in its own files.** Rejected: "everything" becomes several files, and a theme's fonts would have to be written into core by the Producer app.
- **The browser builds and splits the file,** calling each app's routes. Rejected: nothing could make an import across apps all-or-nothing, and much of the logic would move to the browser.

## Decision

- **Core reads and writes export files,** at `/api/core/transfer/…`: the zip, its manifest, the media in it, the limits, the checks and the transaction.
- **Each app owns its kinds.** An app module lists the kinds of item it stores with `transfer(ctx)` (`TransferKind` in `@rollcall/app-sdk`): each kind's name (`<app id>:<thing>`), version and migrations, who may export and import it, how its items are listed, exported, checked, matched with what's here and saved. Core declares `core:team` and `core:font-face`; the Producer app declares `producer:theme`.
- **One import is one transaction.** Every app shares one SQLite connection and a kind's save is synchronous, so all of a file's items are saved together or not at all.
- **Media stays core's.** A kind refers to media by core's media ids; core turns them into paths in the file on export, and saves the files and hands the kind new ids on import.
- **Released kind versions never change.** A change to a kind's data is a new version, with a migration from the one before.
- ADR-0023 still holds: apps never read or write core's tables, and core writes an app's data only through its kind.

## Consequences

- One file holds any mix of kinds, and an import of it saves all or nothing.
- A new kind, such as screens, is added by the app that owns it, with no change to core's routes or the dialog.
- The app SDK grows: `TransferKind` is a contract between core and every app, and changing it is a change to all of them.
- An item whose app isn't installed can't be imported; the preview says so and the rest of the file can be.
