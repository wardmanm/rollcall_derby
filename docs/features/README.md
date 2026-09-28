---
title: Features
---
# Features

One page per feature. Each page holds the feature's requirements, how it behaves once built, and its open questions. The table below is **generated** from each page's frontmatter, so don't edit it by hand. Run `node scripts/check-docs.mjs --fix` instead.

The build order is on the [roadmap](../product/roadmap.md). To add a feature, start from the [feature template](../templates/feature.md) and follow the [feature lifecycle](../wiki-guide.md#feature-lifecycle).

<!-- generated:features -->
| Feature | Status | Summary |
| --- | --- | --- |
| [CRG Automation](crg-automation.md) | planned | Use CRG scoreboard state (read-only) to show and hide components and to display live game data. |
| [Import / Export](import-export.md) | planned | Move teams, themes and screens between installs as versioned, validated JSON. |
| [Live Mode](live-mode.md) | planned | Set up and run events with several games and concurrent tracks, from producer dashboards with live previews. |
| [OBS Control](obs-control.md) | planned | Switch scenes, trigger hotkeys and toggle sources in OBS from producer dashboards. |
| [Overlay Components](overlay-components.md) | planned | Pre-made, configurable building blocks placed on screens, such as rosters, game info and skater spotlights. |
| [Screen Builder](screen-builder.md) | planned | Design overlay screens by dragging pre-made components onto a canvas of any size; each screen goes into OBS as a browser source. |
| [Team Builder](team-builder.md) | planned | Create teams with skaters and bench staff, including names, numbers, roles and photos. |
| [Theme Builder](theme-builder.md) | planned | Define reusable visual styles (colors, fonts, borders, corner radius) that restyle every overlay. |
| [Users and Access](users-and-access.md) | planned | Username and password login with Admin, Producer and Announcer roles, enforced on the server. |
<!-- /generated:features -->
