'use strict';

// How cli.js and mcp.js read the Claude Code quota outside VS Code: the same
// read-only credentials file and usage endpoint as the extension.
// CLAUDE_CREDENTIALS_PATH overrides the credentials location (default
// ~/.claude/.credentials.json).

const api = require('./api');
const credentials = require('./credentials');
const quota = require('./quota');

async function load() {
  const cred = credentials.loadCredentials({ credentialsPath: process.env.CLAUDE_CREDENTIALS_PATH });
  const body = await api.fetchUsage(cred.accessToken);
  const parsed = quota.parseUsageResponse(body);
  if (!parsed) {
    throw Object.assign(new Error('usage response had no 5-hour or weekly window'), { reason: 'shape' });
  }
  parsed.planType = cred.subscriptionType;
  return { parsed };
}

module.exports = {
  provider: 'claude',
  load,
  extra: (parsed) => ({ extraUsageEnabled: parsed.extraUsageEnabled }),
  helpExtra: 'Environment: CLAUDE_CREDENTIALS_PATH (default ~/.claude/.credentials.json).',
};
