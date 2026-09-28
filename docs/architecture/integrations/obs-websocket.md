---
title: OBS WebSocket integration
---
# OBS WebSocket integration

How we control OBS, and what our outputs need to know about running inside an OBS browser source. The server holds the only connection to each OBS instance and relays commands on behalf of dashboards ([ADR-0004](../../decisions/0004-server-is-the-hub.md)).

> **Verified against:** the obs-websocket **5.x** protocol (latest tag 5.7.4, RPC version 1), **obs-websocket-js v5.0.8**, and the obs-browser source, on 2026-09-28. If you build against newer versions, re-check the facts you rely on and update this line.

## Connecting

- obs-websocket is built into **OBS Studio 28 and later**. Its server listens on port **4455** by default.
- **Authentication:** the server's `Hello` message carries a `salt` and a `challenge`. The client answers with `base64(sha256(base64(sha256(password + salt)) + challenge))`, and obs-websocket-js does this for you. A wrong password closes the connection with code `4009`.
- **Password location:** the password lives only in server config. It is never sent to a browser.
- **Library:** we use [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js) v5 on the server. It needs Node > 16 and includes TypeScript types.

```ts
import { OBSWebSocket, EventSubscription } from 'obs-websocket-js';

const obs = new OBSWebSocket();
await obs.connect('ws://192.168.1.20:4455', password, {
  rpcVersion: 1,
  eventSubscriptions: EventSubscription.All,
});
await obs.call('SetCurrentProgramScene', { sceneName: 'Jam' });
obs.on('CurrentProgramSceneChanged', ({ sceneName }) => { /* broadcast to dashboards */ });
obs.on('ConnectionClosed', () => { /* schedule reconnect */ });
```

- To send several requests at once, use `obs.callBatch([...], { haltOnFailure: true })`.
- To change which events you receive without reconnecting, use `obs.reidentify()`.
- Set `DEBUG=obs-websocket-js:*` for debug logs.

## Requests we expect to use

| Purpose | Request(s) |
|---|---|
| List scenes / current scene | `GetSceneList`, `GetCurrentProgramScene` |
| Switch program scene | `SetCurrentProgramScene` (`sceneName` or `sceneUuid`) |
| Studio Mode | `GetStudioModeEnabled`, `SetStudioModeEnabled`, `GetCurrentPreviewScene`, `SetCurrentPreviewScene`, `TriggerStudioModeTransition` |
| Hotkeys | `GetHotkeyList`, `TriggerHotkeyByName` (`hotkeyName`, optional `contextName`), `TriggerHotkeyByKeySequence` |
| Show / hide a source | `GetSceneItemId` (`sceneName`, `sourceName`), then `SetSceneItemEnabled` (`sceneName`, `sceneItemId`, `sceneItemEnabled`). Cache the IDs on the server |
| Refresh a browser source | `PressInputPropertiesButton` with `{ inputName, propertyName: 'refreshnocache' }` |
| Stream / record / replay | `Start`/`Stop`/`ToggleStream`, `GetStreamStatus`; `Start`/`Stop`/`ToggleRecord`, `GetRecordStatus`; `Start`/`Stop`/`SaveReplayBuffer`, `GetReplayBufferStatus` |
| Health | `GetStats` (CPU, memory, FPS, skipped frames) |

The protocol docs warn that hotkey support "comes as-is", and that "in 9/10 usages … there exists a better, more reliable method via other requests". Use a dedicated request when one exists.

## Events we subscribe to

| Category | Events |
|---|---|
| Scenes | `CurrentProgramSceneChanged`, `CurrentPreviewSceneChanged`, `SceneListChanged` |
| UI | `StudioModeStateChanged` |
| Scene items | `SceneItemEnableStateChanged` |
| Outputs | `StreamStateChanged`, `RecordStateChanged`, `ReplayBufferStateChanged`, `ReplayBufferSaved` |
| Transitions | `SceneTransitionStarted` |
| General | `ExitStarted` |

Events are chosen with the `eventSubscriptions` bitmask at connect time, or later with `reidentify()`. `EventSubscription.All` leaves out high-volume events such as `InputVolumeMeters`, `InputActiveStateChanged`, `InputShowStateChanged` and `SceneItemTransformChanged`, which must be added explicitly if needed.

## Browser sources (our outputs)

- **Transparency:** OBS injects `body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }`. Our overlay entry must keep `html` and `body` transparent and never set a background ([ADR-0006](../../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
- **`window.obsstudio`:** OBS gives each page a JavaScript API (`getCurrentScene`, `getStatus`, …). The default page permission is **ReadObs (1)**, and `getCurrentScene` needs **ReadUser (2)**, so it only works if the source's "Page permissions" setting is raised. Outputs don't depend on this API; state comes from our server.
- **Visibility events:** `obsSourceVisibleChanged` (`{visible}`) and `obsSourceActiveChanged` (`{active}`) arrive as `event.detail`. Outputs can use them to pause animations while hidden.
- **Source options** (both off by default):
  - "Shutdown source when not visible" unloads the page, losing all in-page state.
  - "Refresh browser when scene becomes active" reloads the page.

  Outputs must be able to rebuild their full state from the server on every load.

## Sources

- Protocol reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- obs-websocket: https://github.com/obsproject/obs-websocket
- obs-websocket-js: https://github.com/obs-websocket-community-projects/obs-websocket-js
- obs-browser: https://github.com/obsproject/obs-browser

**Unverified:**
- which OBS release first ships obs-websocket 5.7.4;
- how many concurrent WebSocket clients OBS handles in practice (no documented limit).
