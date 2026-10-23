---
title: Uploaded images are public at unguessable addresses
status: accepted
date: 2026-10-23
---
# 0022. Uploaded images are public at unguessable addresses

## Context

The [Team Builder](../features/team-builder.md) adds the first uploaded files: team logos and member photos. Themes and screens will add more images later. Overlays show these images, and an overlay is an OBS browser source: it has no session, and output token URLs aren't built yet ([ADR-0018](0018-declared-access-and-permissions.md)). So an image an overlay shows can't require signing in.

Options considered:
- **Images behind a session, like the API.** Rejected: OBS couldn't load them.
- **Images inside overlay data, as data URLs.** Rejected: every live update would resend every image, and the database would carry megabytes per photo.
- **Images stored in the database.** Rejected: the database grows by megabytes per photo, every image is read through a query, and the architecture already plans "SQLite plus media files".

## Decision

- **Uploaded images are files** in the data folder's `media/` folder, one per image, each with a row in the `media` table giving its type and size. rcl-core's `media.ts` saves, removes and serves them. Teams use it now; later features use it too.
- **They're served at `/media/<id>` to anyone,** with no session, so overlays and OBS can load them.
- **An address can't be guessed or listed:**
  - an image's id is 128 random bits, as 32 hex characters;
  - nothing lists images;
  - an address appears only in the data of the team that uses it, which needs `core:teams.read`.
- **Only images are ever served:**
  - an upload is kept only if its first bytes are a PNG, JPEG or WebP, and is stored as the type its bytes show;
  - SVG, HTML and anything else are refused;
  - replies carry `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`.
- **An image belongs to exactly one logo or photo.**
  - Replacing or removing it deletes its file and row.
  - Deleting a team deletes all of its images.
  - At startup, the server deletes files with no row, rows with no file, and rows that nothing refers to.
- **Images are cached for good** (`immutable`), because an id is never reused.
- **`media` is a reserved app id,** so no app's web build at `/<id>/` can collide with `/media/`.

## Consequences

- OBS overlays can show logos and photos with no session.
- **Images aren't secret.** Anyone on the venue network who has an image's address can load it, as with the overlay itself. Don't upload anything that must stay private.
- **Backups:** the data folder now holds `rollcall.db` and `media/`, and they must be copied together.
- **When output token URLs arrive,** decide whether images should require a token too.
- **A new table that refers to images** adds its column to `MEDIA_REFERENCES` (`rcl-core/server/src/db/schema.ts`), or the startup sweep deletes its images.
