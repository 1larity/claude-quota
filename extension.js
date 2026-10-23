'use strict';

const vscode = require('vscode');
const api = require('./lib/api');
const credentials = require('./lib/credentials');
const { createMonitor } = require('./lib/monitor');
const quota = require('./lib/quota');

const USAGE_URL = 'https://claude.ai/settings/usage';

// lib/ errors are classified (err.reason) and already carry a user-facing
// message; anything else is unexpected.
function friendlyError(error) {
  if (error && error.reason === 'timeout') {
    return 'Claude usage endpoint did not respond in time.';
  }
  if (error && error.reason && error.message) {
    return error.message;
  }
  return `Claude quota unavailable: ${(error && error.message) || 'unknown error'}`;
}

async function load() {
  // Re-read every time: Claude Code rewrites the file when it renews tokens.
  const cred = credentials.loadCredentials({
    credentialsPath: vscode.workspace.getConfiguration('claudeQuota').get('credentialsPath'),
  });
  const body = await api.fetchUsage(cred.accessToken);
  const parsed = quota.parseUsageResponse(body);
  if (!parsed) {
    throw Object.assign(new Error('usage response had no 5-hour or weekly window'), {
      reason: 'shape',
      diagnostic: `top-level keys: ${Object.keys(body).slice(0, 24).join(', ')}`,
    });
  }
  parsed.planType = cred.subscriptionType;
  return { parsed, summary: `windows=${parsed.windows.length}` };
}

function activate(context) {
  createMonitor(vscode, context, {
    section: 'claudeQuota',
    name: 'Claude Quota',
    label: 'Claude',
    icon: '$(sparkle)',
    priority: 48,
    usageUrl: USAGE_URL,
    load,
    statusText: (parsed) => quota.statusText(parsed.windows),
    tooltip: quota.tooltipText,
    friendlyError,
    // 'expired' is deliberately absent: the last numbers stay up (marked
    // stale) until Claude Code renews the token.
    credentialReasons: ['not-found', 'malformed', 'unauthorized'],
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
