# rcl-producer — agent instructions

rcl-producer is the Producer app: themes, screens, Live Mode, producer dashboards and the OBS overlay ([ADR-0016](../docs/decisions/0016-obs-producer-becomes-rollcall.md)). It has no server process of its own: rcl-core's server hosts it as app module `producer` ([ADR-0019](../docs/decisions/0019-rcl-apps-as-modules.md)), with its routes below `/api/producer/`, its Socket.IO namespaces below `/producer` and its web build at `/producer/`.

These rules add to the repo-root [AGENTS.md](../AGENTS.md). Its hard rules apply here.

## Layout

```
rcl-producer/
├── server/    @rollcall/producer-server: the app module rcl-core hosts (depends only on @rollcall/app-sdk and contracts)
├── contract/  @rollcall/producer-contract: Zod schemas for /api/producer and its namespaces, such as the overlay's hello
└── web/       @rollcall/producer-web: the Producer app at /producer/ (Mantine), and the OBS overlay at /producer/overlay (no Mantine)
```

The app shell, the server badge, the RTK Query base API and store, and the dev proxy come from `@rollcall/web-sdk` (`packages/web-sdk/`).

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `yarn workspace @rollcall/producer-web dev` | Vite alone on port 5174, at `/producer/`, passing `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER`. `yarn dev` starts it with everything else; open it through the front door, `http://localhost:5173/producer/` |
| `yarn workspace @rollcall/producer-web build` | Production build into `rcl-producer/web/dist/`, which the server serves at `/producer/` |
| `yarn workspace @rollcall/producer-web storybook` | The overlay Storybook alone, on port 6007 |
