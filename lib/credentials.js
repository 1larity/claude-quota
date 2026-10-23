'use strict';

// Reads Claude Code OAuth credentials from ~/.claude/.credentials.json
// (Linux/Windows layout; macOS keeps them in the login Keychain instead, so
// the file is absent there). Shape:
//   { claudeAiOauth: { accessToken, refreshToken, expiresAt (epoch ms),
//     refreshTokenExpiresAt, scopes, subscriptionType, rateLimitTier } }
// Strictly read-only. The extension never refreshes the token itself: refresh
// tokens are single-use, so refreshing here would invalidate the copy a
// running `claude` process holds (and race other VS Code windows). When the
// access token has expired, Claude Code refreshes it the next time it runs
// and the next poll picks the new one up. The token never appears in errors,
// logs, or diagnostics. The fs is injectable for tests.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

function classified(reason, message) {
  return Object.assign(new Error(message), { reason });
}

function expandHome(p, home = os.homedir()) {
  if (p === '~') {
    return home;
  }
  if (p && (p.startsWith('~/') || p.startsWith('~\\'))) {
    return path.join(home, p.slice(2));
  }
  return p;
}

// Extract the usable OAuth fields from a parsed credentials file. Throws
// 'malformed' when the file has no claude.ai OAuth block.
function extractOauth(parsed, filePath) {
  const oauth = parsed && typeof parsed === 'object' ? parsed.claudeAiOauth : undefined;
  if (!oauth || typeof oauth !== 'object' || typeof oauth.accessToken !== 'string' || !oauth.accessToken) {
    throw classified(
      'malformed',
      `${filePath} has no claude.ai OAuth credentials.\nRun 'claude' in a terminal to log in with a claude.ai subscription.`
    );
  }
  const expiresAt =
    typeof oauth.expiresAt === 'number' && Number.isFinite(oauth.expiresAt) && oauth.expiresAt > 0
      ? oauth.expiresAt
      : null;
  return {
    accessToken: oauth.accessToken,
    expiresAt,
    subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
  };
}

function isExpired(cred, now = Date.now()) {
  return cred.expiresAt !== null && now >= cred.expiresAt;
}

// Resolve and read the credentials file. Returns
// { accessToken, subscriptionType, credentialsPath }.
// Options: { credentialsPath, home, now, fsImpl }. Throws classified errors
// with reason in ('not-found' | 'io' | 'malformed' | 'expired').
function loadCredentials(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const configured = typeof options.credentialsPath === 'string' && options.credentialsPath.trim()
    ? options.credentialsPath.trim()
    : path.join(options.home || os.homedir(), '.claude', '.credentials.json');
  const filePath = expandHome(configured, options.home);
  let raw;
  try {
    raw = fsImpl.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw classified(
        'not-found',
        `Claude Code credentials not found at ${filePath}.\nRun 'claude' in a terminal once to log in. On macOS credentials live in the Keychain, which this extension cannot read.`
      );
    }
    throw classified('io', `Could not read ${filePath}: ${(err && err.message) || 'unknown error'}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw classified('malformed', `${filePath} is not valid JSON.`);
  }
  const cred = extractOauth(parsed, filePath);
  const now = typeof options.now === 'number' ? options.now : Date.now();
  if (isExpired(cred, now)) {
    throw classified(
      'expired',
      'Claude Code access token has expired.\nIt is renewed the next time you use Claude Code; this item updates on its own after that.'
    );
  }
  return {
    accessToken: cred.accessToken,
    subscriptionType: cred.subscriptionType,
    credentialsPath: filePath,
  };
}

module.exports = {
  loadCredentials,
  expandHome,
  extractOauth,
  isExpired,
  DEFAULT_CREDENTIALS_PATH,
};
