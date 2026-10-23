<p align="center"><img src="assets/logo.png" alt="EVILE" width="96" height="96"></p>

# Claude Quota

Show Claude Code (claude.ai subscription) quota usage in the VS Code status bar.

## Install

Requires VS Code 1.74.0 or newer. Download **claude-quota-0.2.2.vsix** from the
[EVILE project page](https://evile.uk/redesign/projects/claude-quota/).

1. Open **Extensions → … → Install from VSIX…**.
2. Select the downloaded file.
3. Run **Developer: Reload Window** if the extension has not appeared.

Or install from a terminal:

```sh
code --install-extension claude-quota-0.2.2.vsix
```

Show your Claude Code quota usage in the VS Code status bar — the same
5-hour and weekly numbers Claude Code's `/usage` command shows, without
leaving the editor.

```
$(sparkle) Claude 5h 71% · W 83%
```

Reads the same usage endpoint Claude Code's `/usage` command uses
(claude.ai Pro/Max subscriptions) and renders:

- status bar text with both windows' remaining percentages
- red / amber / green color bands (configurable thresholds)
- a hover tooltip with used %, reset times, and rate-limit status
- single click to refresh, double click to open claude.ai usage settings

Companion extensions: [Codex Quota](https://github.com/1larity/codex-quota) and
[GLM Quota](https://github.com/1larity/zai-quota).

## How it works

1. Reads the Claude Code OAuth credentials from
   `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`).
2. Calls `GET https://api.anthropic.com/api/oauth/usage` with that token.
3. Parses the JSON:

   | Field | Meaning |
   | --- | --- |
   | `five_hour.utilization` | percent of the 5-hour window used (29 → 71% left) |
   | `seven_day.utilization` | percent of the weekly window used |
   | `seven_day_opus` / `seven_day_sonnet` | model-scoped weekly windows, when the plan has them (tooltip and color band only) |
   | `*.resets_at` | ISO 8601 reset time |
   | `extra_usage.is_enabled` | whether extra usage is turned on |

   Contract verified live 2026-10 (plain `Bearer` token, no beta header).

**Cost:** none. The endpoint is read-only: no prompt is sent and no quota
is consumed. Only the focused VS Code window polls; other windows catch up
when they regain focus.

## Token handling

- The credentials file is strictly **read-only** to this extension. It
  never refreshes tokens itself: refresh tokens are single-use, so doing so
  would invalidate the copy a running `claude` process holds.
- When the access token has expired, the last numbers stay up (marked
  stale in the tooltip) until Claude Code renews the token the next time
  you use it; the file is re-read on every poll.
- If the token is rejected or the credentials are missing, the status bar
  shows `$(key) Claude ?` with instructions to run `claude` to log in.
- The token never appears in errors, logs, or diagnostics; the output
  channel logs reasons and status strings only.
- **macOS:** Claude Code stores credentials in the login Keychain, which
  this extension cannot read — it is Linux/Windows only for now.

## Requirements

- Claude Code logged in with a claude.ai subscription (Pro/Max). Console
  API-key accounts have no subscription usage windows; the extension shows
  a clear error in that case.
- VS Code ^1.74.0. No dependencies, no build step.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeQuota.credentialsPath` | `~/.claude/.credentials.json` | Custom credentials file location |
| `claudeQuota.refreshIntervalSeconds` | `60` (min 15) | Refresh cadence |
| `claudeQuota.thresholds` | `red < 10`, `amber < 30` | Percent-remaining color bands |

## Commands

- `Claude Quota: Refresh`
- `Claude Quota: Open Usage Page` (https://claude.ai/settings/usage)

## Privacy and workspace trust

This extension is disabled in untrusted and virtual workspaces. Set `claudeQuota.credentialsPath` in **User settings**; project settings cannot choose a credentials file. The extension reads an existing OAuth access token and sends it only to Anthropic over HTTPS. It never renews tokens.
No telemetry is sent by this extension. Review provider-specific credential
handling above. Never include keys, tokens or account responses in bug reports.

## Licence

Copyright © 2026 Richard Beech / 1larity. User-owned code, documentation and assets
are licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(**CC BY-NC-SA 4.0**). Credit the author and source, link the licence, indicate
changes, use non-commercially and share adaptations under the same licence.
Third-party material retains its own terms; previous licence grants are not revoked.
See [LICENSE](LICENSE) for the legal text.

## Developer guide

The extension is plain CommonJS JavaScript with **no runtime npm dependencies**
and no compilation step. Use Node.js 22+ for development.

```sh
npm test
node --check extension.js
npx --yes @vscode/vsce@4.0.0 package --no-dependencies
```

Open the checkout in VS Code and press **F5** to launch an Extension Development
Host. Tests run locally with synthetic fixtures; they do not prove live provider
availability or interactive UI acceptance.

- `extension.js`: VS Code integration.
- `lib/` (quota monitors): provider clients, parsers and monitor lifecycle.
- `test/`: offline regression coverage.
- `.vscodeignore`: package allow-list; excludes tests, screenshots, credentials,
  local editor settings, source artwork and previous VSIX files.

Gitea is the canonical development home. GitHub's `public` branch is a curated
standalone snapshot; it intentionally does not contain private development
history, experimental branches or tags. Each checkout can run its tests without
access to the canonical workspace. Shared quota modules are vendored locally;
changes must also be synchronized in the canonical quota workspace before a release.

See [SECURITY.md](SECURITY.md) for sensitive reporting guidance.
