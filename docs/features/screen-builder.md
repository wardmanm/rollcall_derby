---
title: Screen Builder
status: planned
summary: Design overlay screens by dragging pre-made components onto a canvas of any size; each screen goes into OBS as a browser source.
---
# Screen Builder

The Screen Builder is where overlay [screens](../product/glossary.md) are designed. You drag and drop pre-made [overlay components](overlay-components.md) onto a canvas and set each component's options. Screens are the app's main output: each one is loaded into OBS as a browser source through its [output](../product/glossary.md#output) URL.

## Users and roles

Admins create and edit screens, including layout and component options. Producers use existing screens in [Live Mode](live-mode.md) but don't change their layout. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Create, save, duplicate and delete multiple named screens.
- **R2.** Each screen has an editable canvas size, e.g. 1920×1080.
- **R3.** Drag overlay components from a palette onto the canvas, then move and resize them there.
- **R4.** Set each placed component's options (component-specific, e.g. which team or how many rows).
- **R5.** Apply a [theme](theme-builder.md) to the screen.
- **R6.** The canvas renders exactly what OBS will show, because the builder, the dashboard preview and the OBS output all use the same renderer ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
- **R7.** Outputs have a transparent background, so a screen can be layered over video in OBS.
- **R8.** Screens can be exported and imported as JSON ([import / export](import-export.md)).

## Behavior

Not built yet.

## Related

- [Overlay components](overlay-components.md): what can be placed on a screen
- [Live Mode](live-mode.md): where a screen is tied to a track and game, and controlled
- [ADR-0003](../decisions/0003-client-state-with-redux-toolkit.md): editor state is a Redux slice

## Open questions

- What is the default canvas size? How does a screen scale when its canvas doesn't match the size of the OBS browser source?
- Alignment aids: a grid, snapping, smart guides?
- Layers: a z-order panel, grouping, locking?
- Undo/redo: is a history of the editor slice (e.g. `redux-undo`) enough?
- Which data does the builder show? A screen isn't tied to a game until Live Mode, so the builder needs sample or chosen preview data.
- What visibility does each component start with (shown, or hidden until triggered)? Do we define show/hide animations here?
- How many outputs per OBS scene: one full-canvas screen per scene, or several smaller screens layered together?
