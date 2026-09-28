---
title: Client state with Redux Toolkit
status: accepted
date: 2026-09-28
---
# 0003. Client state with Redux Toolkit

## Context

The web app holds three kinds of state:
- **server data**, such as teams, themes, screens and games, that can be changed by other users;
- **live state** pushed from the server over Socket.IO, such as component visibility, CRG-derived data and OBS status;
- **pure client state**, such as the Screen Builder's selection, drag state and undo history.

Mixing these, for example by copying fetched data into local state, leads to stale screens and conflicting sources of truth. That is exactly what a live-production tool can't afford.

## Decision

We use **Redux Toolkit** for state management, with one clear home for each kind of state:

- **Server data lives in RTK Query, never copied into slices.** Every REST resource is an RTK Query endpoint, and components read it through the generated hooks. RTK Query replaces any separate data-fetching library.
- **Live pushes update the RTK Query cache.** Socket.IO messages are applied with `updateQueryData`, from within `onCacheEntryAdded` (streaming updates) or from listener middleware. This keeps a single source of truth.
- **Slices hold client-only state**, such as the Screen Builder editor (canvas, selection, history) and UI preferences. Slices are organized by feature.
- **Component-local, short-lived state stays in `useState`**, for example whether a menu is open or a form input's value before it is submitted.
- **Typed hooks only.** Use `useAppSelector` and `useAppDispatch`, never raw `useSelector` or `useDispatch`.
- **One store per entry point.** The admin/dashboard SPA has its own store. The overlay entry has a separate lean store fed by its socket ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)).

**Hard rule:** **Server data lives in RTK Query, never copied into slices.** Overlay components are presentational: they get data through props and never read the admin store.

## Consequences

- Cache invalidation, loading and error states come from RTK Query rather than being hand-rolled.
- Real-time consistency depends on every socket message mapping to a cache update. Those mappings need tests.
- Redux DevTools gives producers and developers a time-travel view of client state, which helps with debugging.
- Some boilerplate compared with lighter libraries, offset by RTK's `createSlice` and `createApi`.
