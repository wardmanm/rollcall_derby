# OBS Producer

A web app for producing roller derby streams in [OBS Studio](https://obsproject.com/). You host it on a laptop at the venue, and anyone on the local network can reach it.

- **Team Builder**: teams with skaters, bench staff, roles, numbers and photos.
- **Theme Builder**: shared visual styles such as colors, fonts, borders and corner radius.
- **Screen Builder**: drag-and-drop overlay screens at any canvas size. Each screen is added to OBS as a browser source.
- **Live Mode**: set up events, games and tracks. Producer dashboards preview and control every screen, even with several games running at once.
- **Integrations**: switch OBS scenes and fire hotkeys from the dashboard, and drive overlays from [CRG scoreboard](https://github.com/rollerderby/scoreboard) events. CRG is read-only: the app only listens to it.

> **Status:** early development. The foundation runs (server, web app shell and a transparent OBS overlay page); the features above arrive from roadmap Phase 1. To run it, see [local development](docs/guides/local-development.md).

## Documentation

- **[Wiki](docs/README.md)**: product vision, features, architecture, decisions, and guides.
- **[AGENTS.md](AGENTS.md)**: contributor rules, commands, and the definition of done. It's written for AI agents but applies to humans too.
- **[CHANGELOG](CHANGELOG.md)**: what changed in each release.

## License

MIT. See [LICENSE](../LICENSE).
