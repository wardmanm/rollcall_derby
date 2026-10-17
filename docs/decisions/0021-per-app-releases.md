---
title: Each rcl app is released on its own
status: accepted
date: 2026-10-16
---
# 0021. Each rcl app is released on its own

Supersedes [ADR-0010](0010-deliberate-releases-patch-tracking.md).

## Context

Rollcall is a suite of rcl apps in one repository ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). rcl-core is the server, and it hosts each app as a module ([ADR-0019](0019-rcl-apps-as-modules.md)). ADR-0010's release process was built for one app, OBS Producer. It used one changelog, one tag prefix (`obs-producer-v`), one milestone prefix and one release workflow. ADR-0016 held off cutting releases until this decision.

rcl-core and rcl-producer change at different speeds. A fix to the overlay shouldn't force a new rcl-core version, and the other way round. Each app already declares which rcl-core versions it works with (`rollcall.requiresCore`, ADR-0019).

Options considered:
- **One version for the whole suite.** Rejected: every release would bump every app, and its notes would mix changes for different people.
- **A repository per app.** Rejected: the apps share packages, end-to-end tests and the wiki, and they're built and tested together.
- **A separate release workflow per app.** Rejected: two copies of the same checks would drift apart.

ADR-0010's other decisions stand. They're restated below so this ADR is complete on its own.

## Decision

- **Each rcl app is released on its own.** The apps are `rcl-core` and `rcl-producer`. Each has its own versions, release notes and tags. Shared code (`packages/`), the end-to-end tests and the repository root aren't released, so their package versions don't change.
- **Names**, for app `<app>` and version `<semver>`:
  - release notes: `<app>/CHANGELOG.md`;
  - versions: every `<app>/*/package.json`;
  - tag: `<app>-v<semver>`, e.g. `rcl-core-v0.1.0`;
  - milestone: `<app> v<semver>`, e.g. `rcl-core v0.1.0`;
  - release: "Rollcall Core v`<semver>`" or "Rollcall Producer v`<semver>`".
- **One release workflow, started per app.** `release.yml` holds every check and step and can only be called. `rcl-core-release.yml` and `rcl-producer-release.yml` are the only ways to start it, each with its own app. `scripts/release.mjs` takes `--app` on every command.
- **The checks before approval** are everything CI runs: `yarn check`, the production build, the story tests and the end-to-end tests. They run on the whole repository whichever app is released, because the apps run in one server.
- **rcl-producer keeps OBS Producer's history.** Its changelog continues from OBS Producer 0.1.0, so its next release is 0.2.0. rcl-core's first release is 0.1.0. A release of rcl-core can fall outside another app's `requiresCore` range: whoever prepares it decides whether that app still works, and widens the range before the release (ADR-0019).
- **Milestones are for planned releases only.**
  - Minor and major releases (`x.y.0`) get a milestone, and can only be released once it has no open issues.
  - Patch releases and pre-releases don't need a milestone. If one exists with the exact title anyway, the same check applies.
- **One `patch` label** marks issues that should ship in the next patch release of their app.
- **Where each issue shipped is recorded automatically.** Changelog entries end with their issue number, e.g. `(#12)`. A change to both apps gets an entry in each changelog. When a release is published, the workflow:
  - comments `Released in <release name>: <release URL>` on every issue referenced in that version's notes, and on the milestone's closed issues;
  - removes the `patch` label from those issues.
- **Release notes come from the app's changelog** ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)). Each user-visible change adds a line under `Unreleased` in the same change.
- **Releasing takes two steps, each done by a person:**
  1. **Prepare.** A commit moves the app's `Unreleased` notes under the new version and bumps the app's package versions. Use `node scripts/release.mjs prepare <version> --app <app>` or the user-only `/release` skill.
  2. **Publish.** Start the app's release workflow, such as **rcl-core release**.
     - Its only trigger is `workflow_dispatch`, and it's a dry run by default.
     - It checks the branch, version, tag, changelog, milestone (for `x.y.0`), docs lint and tests.
     - It then waits for approval in the protected `release` environment.
     - After approval it checks the tag and milestone again, creates the app's tag on the checked commit, and publishes the GitHub Release. The notes are the changelog notes plus, for milestone releases, a milestone link and the closed issues.
     - Finally it closes the milestone and marks the issues as released.
- **Release tags are permanent.** A tag ruleset blocks moving or deleting `*-v*` tags, and GitHub immutable releases is on, so a published version's tag can never be reused. Mistakes are fixed forward with a new patch release.
- **SemVer, `0.x` until an app is ready for general use.** A pre-release suffix (`-beta.1`) publishes a GitHub pre-release.

**Hard rule:** **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version.

## Consequences

- Nothing ships by accident. Every release still takes at least three human actions: the prepare commit, turning off dry run and starting the workflow, and approving.
- Each release's notes are written for that app's users. A change to both apps needs a line in both changelogs.
- An issue that both apps' notes reference gets a "Released in" comment from each release.
- Searching `"Released in Rollcall Core v0.1.0" in:comments` finds everything in a release.
- A new rcl app needs an entry in `APPS` in `scripts/release.mjs`, its own `CHANGELOG.md` and its own `<app>-release.yml`. Script tests fail until all three exist.
- The repository goes public before the first release. On Mike's GitHub plan, the `release` environment's required reviewer only works on a public repository.
- The publish job has no build artifacts yet. Build and packaging steps get added to it once the apps are ready for general use.
