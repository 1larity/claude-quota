'use strict';

// Shape-debugging helper: one real usage read with the local Claude Code
// credentials. CLAUDE_CREDENTIALS_PATH=... npm run smoke  (defaults to
// ~/.claude/.credentials.json)
// Output is sanitized: field names and window kinds only. Never tokens,
// percentages, or reset timestamps. Read-only: sends no prompt, consumes no
// quota, and never writes the credentials file.

const credentials = require('../lib/credentials');
const api = require('../lib/api');
const quota = require('../lib/quota');

(async () => {
  let cred;
  try {
    cred = credentials.loadCredentials({ credentialsPath: process.env.CLAUDE_CREDENTIALS_PATH });
  } catch (err) {
    console.error(`credentials failed: ${(err && err.reason) || 'error'} ${String(err && err.message).slice(0, 160)}`);
    process.exit(1);
  }
  console.log(`credentials: ${cred.credentialsPath}`);
  console.log(`subscription: ${cred.subscriptionType || 'unknown'}`);

  try {
    const body = await api.fetchUsage(cred.accessToken);
    console.log(`top-level fields: ${Object.keys(body).sort().join(', ')}`);
    const parsed = quota.parseUsageResponse(body);
    if (!parsed) {
      console.log('parser: null (unrecognized)');
      process.exit(1);
    }
    console.log(`parser windows: ${parsed.windows.map((w) => w.kind).join(', ')}`);
    console.log(`extra usage enabled: ${parsed.extraUsageEnabled}`);
    console.log(`severity band: ${quota.severityBand(parsed.windows, null)}`);
  } catch (err) {
    console.error(
      `usage fetch failed: ${(err && err.reason) || 'error'} ${String(err && err.message).replace(/\n/g, ' ').slice(0, 160)}`
    );
    process.exit(1);
  }
})();
