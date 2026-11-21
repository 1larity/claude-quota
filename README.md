<p align="center"><img src="assets/logo.png" alt="Claude Quota" width="640"></p>

# Claude Quota

Show Claude Code (claude.ai subscription) quota usage in the VS Code status bar.

## Install

Requires VS Code 1.74.0 or newer. Download **claude-quota-0.3.0.vsix** from the
[EVILE project page](https://evile.uk/redesign/projects/claude-quota/).

1. Open **Extensions → … → Install from VSIX…**.
2. Select the downloaded file.
3. Run **Developer: Reload Window** if the extension has not appeared.

Or install from a terminal:

```sh
code --install-extension claude-quota-0.3.0.vsix
```

Show your Claude Code quota usage in the VS Code status bar: the same
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
  this extension cannot read, so it supports Linux and Windows.

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
| `claudeQuota.mcp.enabled` | `false` | Lets coding agents read this quota through the MCP server. Toggle it from the link at the foot of the status bar tooltip. |

## Commands

- `Claude Quota: Refresh`
- `Claude Quota: Open Usage Page` (https://claude.ai/settings/usage)
- `Claude Quota: Toggle MCP Server`: turn the MCP server for coding agents on or off; the link at the foot of the tooltip does the same

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

## JSON command line for coding agents

`claude-quota` prints the quota shown in the status bar as one JSON document, so an
agent can check its own limits before starting long work.

```sh
node cli.js --pretty        # from the extension folder
npx . --pretty              # or install the claude-quota command: npm link
```

Fields: `ok`, `provider`, `plan`, `band` (`green`, `amber` or `red`, from the
most constrained window), `status` (the status bar text) and `windows[]` with
`kind`, `label`, `usedPercent`, `remainingPercent`, `resetAt` (ISO 8601) and
`resetsInSeconds`. `extraUsageEnabled` reports whether extra usage is on.
When the quota cannot be read, `ok` is `false`, `error.reason` and
`error.message` say why, and the exit code is 1. `CLAUDE_CREDENTIALS_PATH` overrides the credentials file.

### All installed quota extensions in one document

`claude-quota --all` collates the quota of every installed Claude, Codex and GLM
quota extension into one JSON document: `providers` holds each extension's
own document keyed by `claude`, `codex` or `glm`, and `summary` gives the
worst `band` and the `tightest` window across them. Extensions that are not
installed are left out, and a provider that fails shows `ok: false` without
affecting the others. The exit code is 0 when at least one provider answered.

Each extension records the location of its `cli.js` in
`~/.config/quota-monitor/` (`$XDG_CONFIG_HOME`, `$QUOTA_MONITOR_DIR` or
`%APPDATA%` where set) when it activates or its CLI runs. Any one installed
extension can therefore produce the combined view.

## MCP server for coding agents

`mcp.js` is a Model Context Protocol server (stdio) with two read-only tools:

- `get_quota` returns one provider's document, the same one the command line prints. `provider` picks `claude`, `codex` or `glm` and defaults to `claude`.
- `get_all_quotas` returns the combined document of `--all`.

The server is off by default. Turn it on with the link at the foot of the status bar tooltip, the **Claude Quota: Toggle MCP Server** command, or the `claudeQuota.mcp.enabled` setting. Each provider answers only while its own extension's toggle is on; otherwise its document has `ok: false` and `error.reason` `mcp-disabled`. A change applies from the next tool call, with no agent restart.

While it is on, VS Code 1.101 and later list the server under their MCP servers, running with this extension's own settings and credentials. Other agents start it with `node <folder>/mcp.js`, where `<folder>` is this extension's folder or a source checkout. The installed folder name includes the version, so a source checkout gives a path that survives updates.

```sh
# Claude Code
claude mcp add -s user quota -- node <folder>/mcp.js
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.quota]
command = "node"
args = ["<folder>/mcp.js"]
```

```jsonc
// Kilo: ~/.config/kilo/kilo.jsonc
"mcp": { "quota": { "type": "local", "command": ["node", "<folder>/mcp.js"], "enabled": true } }
```

Any one server reports all installed providers, so one entry per agent is enough. Give that entry `ZAI_API_KEY_COMMAND` (see the GLM Quota README) so GLM can answer through it too.

## Developer guide

The extension is plain CommonJS JavaScript with **no runtime npm dependencies**
and no compilation step. Use Node.js 22+ for development.

```sh
npm test
node --check extension.js
npx --yes @vscode/vsce@4.0.0 package --no-dependencies
```

Open the checkout in VS Code and press **F5** to launch an Extension Development
Host. Run `npm test` for the offline test suite.

- `extension.js`: VS Code integration.
- `lib/`: provider clients, parsers and monitor lifecycle.
- `test/`: offline regression coverage.
- `.vscodeignore`: files included in the extension package.

See [SECURITY.md](SECURITY.md) for sensitive reporting guidance.
