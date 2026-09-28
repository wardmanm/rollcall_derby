---
title: OBS Control
status: planned
summary: Switch scenes, trigger hotkeys and toggle sources in OBS from producer dashboards.
---
# OBS Control

Producers control OBS from the same dashboards they use to run overlays. The server holds the only connection to each OBS instance and sends commands on behalf of dashboards ([ADR-0004](../decisions/0004-server-is-the-hub.md)).

## Users and roles

Admins configure OBS connections. Producers use OBS controls on dashboards. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Change the current program scene from a dashboard.
- **R2.** Trigger OBS hotkeys.
- **R3.** Show OBS state on dashboards: connection status, current program (and preview) scene, and whether it is streaming or recording.
- **R4.** Admins configure each OBS connection (host, port, password). The password is kept on the server and never sent to a browser.
- **R5.** Candidate extra actions:
  - set the preview scene and run the Studio Mode transition
  - show or hide a source within a scene
  - refresh a browser source
  - save the replay buffer
  - start or stop streaming and recording

  The request names for each are in the [OBS integration](../architecture/integrations/obs-websocket.md#requests-we-expect-to-use).

The obs-websocket docs recommend dedicated requests over hotkeys in most cases. Where a dedicated request exists, use it, e.g. `SetCurrentProgramScene` rather than a scene-switch hotkey.

## Behavior

Not built yet.

## Related

- [OBS integration](../architecture/integrations/obs-websocket.md)
- [CRG automation](crg-automation.md), which may trigger OBS actions

## Open questions

- May Announcers use any OBS controls?
- Should risky actions such as "stop stream" ask for confirmation, or be admin-only?
- Should admins be able to define custom macro buttons, i.e. a named batch of OBS requests (obs-websocket supports batch requests)?
- One OBS instance per track, or one for the whole event? This affects how dashboards pick which OBS to control. See [Live Mode](live-mode.md).
