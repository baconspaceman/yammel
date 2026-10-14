# Code signing

Release files are currently **unsigned**, so Windows SmartScreen shows "Unknown publisher" the first time someone runs them. This page is the maintainer's plan for fixing that with the free [SignPath Foundation](https://signpath.org/) program for open source projects. Nothing here is active yet. Until the project is approved, the README and release notes must not claim that files are signed.

## Status

| Step | State |
|---|---|
| Project metadata matches SignPath's rules (product name, version, publisher in the exe) | Done |
| [PRIVACY.md](../../PRIVACY.md) published | Done |
| MIT licence, public source, public CI | Done |
| Apply at signpath.org | Not done (maintainer must do it) |
| Approval | Not done |
| Signing step in the Release workflow | Not done, added only after approval |
| "Code signing policy" section in the README | Not done, added only after approval |

SignPath asks for a "verifiable reputation" for the programs it signs. A brand-new project with no history may be declined at first. If that happens, it is fine to wait for some stars, users and release history and apply again.

## Application checklist (maintainer)

1. Turn on multi-factor authentication for the GitHub account (`baconspaceman`). SignPath requires it.
2. Apply at <https://signpath.org/> for the open source program, using the repository `github.com/baconspaceman/yammel`.
3. Create a SignPath account. Turn on multi-factor authentication there too.
4. Roles: the maintainer is author, reviewer and approver. Each release is approved by hand in SignPath before the signed file comes back.
5. Wait for the decision.

## Text for the application

Short description:

> Yammel is a free, open source (MIT) Windows desktop app for making and checking Archipelago randomizer YAML files. It works fully offline. It has no account, login, telemetry or automatic updates.

Builds: public GitHub Actions workflow (`.github/workflows/release.yml`) on a `v*` tag, from the public repository.

## After approval

1. Add the SignPath secrets and project/policy slugs to the repository settings.
2. In `release.yml`, upload the unsigned installer and portable exe as an artifact, submit them with `signpath/github-action-submit-signing-request`, wait for the signed files, then compute `SHA256SUMS.txt` from the signed files.
3. Add this section to the README and to release pages:

   > **Code signing policy.** Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/). The maintainer is the author, reviewer and approver of every release. See the [privacy policy](../../PRIVACY.md).

4. Keep publishing checksums, and update this page's status table.
