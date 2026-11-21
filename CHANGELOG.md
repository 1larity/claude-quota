## 0.3.3 - 2026-11-21

- Published on the Visual Studio Marketplace as **Quota Monitor for Claude Code** (`RichardBeech.quota-monitor-claude-code`). The extension ID changed: uninstall an earlier VSIX build before installing this one.
- Square Marketplace icon.

## 0.3.0 - 2026-11-21

- `cli.js` prints the Claude Code quota as one JSON document for coding agents; `--all` adds every other installed quota extension.
- Optional MCP server for coding agents, off by default: `mcp.js` with the tools `get_quota` and `get_all_quotas`. Toggle it from the link at the foot of the status bar tooltip, the **Claude Quota: Toggle MCP Server** command, or `claudeQuota.mcp.enabled`. While on, VS Code lists the server under its MCP servers.

## 0.2.2 - 2026-10-23

- User-owned material now CC BY-NC-SA 4.0; third-party and earlier grants preserved.
- Credential path is machine-scoped; disabled in untrusted workspaces.

