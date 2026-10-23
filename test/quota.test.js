'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const quota = require('../lib/quota.js');

// Body observed live from GET /api/oauth/usage with a claude.ai OAuth token
// (2026-10), trimmed to the fields that matter plus a few unknown ones.
const REAL_BODY = {
  five_hour: {
    utilization: 29,
    resets_at: '2026-10-23T17:29:59.505779+00:00',
    limit_dollars: null,
    locked_reason: null,
  },
  seven_day: {
    utilization: 17,
    resets_at: '2026-10-27T17:59:59.505803+00:00',
    limit_dollars: null,
    locked_reason: null,
  },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: { is_enabled: false, monthly_limit: null, user_disabled: false },
  limits: [{ kind: 'session', group: 'session', percent: 29, severity: 'normal' }],
  some_future_field: { nested: true },
};

test('parses the verified body: utilization is percent USED, resets are ISO', () => {
  const parsed = quota.parseUsageResponse(REAL_BODY);
  assert.ok(parsed);
  assert.equal(parsed.windows.length, 2); // null model-scoped windows skipped
  const five = parsed.windows[0];
  assert.equal(five.kind, '5h');
  assert.equal(five.label, '5-hour');
  assert.equal(five.usedPercent, 29);
  assert.equal(five.remainingPercent, 71);
  assert.equal(five.resetAt.toISOString(), '2026-10-23T17:29:59.505Z');
  const week = parsed.windows[1];
  assert.equal(week.kind, 'week');
  assert.equal(week.usedPercent, 17);
  assert.equal(week.remainingPercent, 83);
  assert.equal(parsed.extraUsageEnabled, false);
});

test('model-scoped weekly windows join the band and tooltip, not the status text', () => {
  const parsed = quota.parseUsageResponse({
    ...REAL_BODY,
    seven_day_opus: { utilization: 95, resets_at: '2026-10-27T17:59:59+00:00' },
  });
  assert.equal(parsed.windows.length, 3);
  assert.equal(quota.statusText(parsed.windows), '5h 71% · W 83%');
  assert.equal(quota.severityBand(parsed.windows, null), 'red');
  assert.match(quota.tooltipText(parsed, new Date(), null), /Weekly \(Opus\)\nRemaining: 5%/);
});

test('no usable windows -> null (e.g. Console API key auth or new shape)', () => {
  assert.equal(quota.parseUsageResponse({}), null);
  assert.equal(quota.parseUsageResponse({ five_hour: null, seven_day: null }), null);
  assert.equal(quota.parseUsageResponse(null), null);
  assert.equal(quota.parseUsageResponse('junk'), null);
});

test('garbage values degrade per field instead of failing the parse', () => {
  const parsed = quota.parseUsageResponse({
    five_hour: { utilization: 'not-a-number', resets_at: 'bogus' },
    seven_day: { utilization: '130', resets_at: 1793124000 }, // clamped; unix seconds tolerated
  });
  assert.equal(parsed.windows[0].remainingPercent, undefined);
  assert.equal(parsed.windows[0].resetAt, null);
  assert.equal(parsed.windows[1].remainingPercent, 0);
  assert.equal(parsed.windows[1].resetAt.getTime(), 1793124000 * 1000);
  assert.equal(quota.statusText(parsed.windows), '5h · W 0%');
  assert.equal(parsed.extraUsageEnabled, null);
});

test('float utilization is rounded to 0.1% to avoid display noise', () => {
  const parsed = quota.parseUsageResponse({ five_hour: { utilization: 28.999999999999996 } });
  assert.equal(parsed.windows[0].usedPercent, 29);
  assert.equal(parsed.windows[0].remainingPercent, 71);
});

test('severityBand follows the most constrained window', () => {
  const parsed = quota.parseUsageResponse(REAL_BODY);
  assert.equal(quota.severityBand(parsed.windows, null), 'green');
  const drained = quota.parseUsageResponse({ ...REAL_BODY, five_hour: { utilization: 95 } });
  assert.equal(quota.severityBand(drained.windows, null), 'red');
  const middling = quota.parseUsageResponse({ ...REAL_BODY, five_hour: { utilization: 85 } });
  assert.equal(quota.severityBand(middling.windows, null), 'amber');
  assert.equal(quota.severityBand(middling.windows, { redBelowPercent: 5, amberBelowPercent: 10 }), 'green');
  // Invalid thresholds fall back to defaults, out-of-range values clamp.
  assert.equal(quota.severityBand(middling.windows, { redBelowPercent: 999, amberBelowPercent: -5 }), 'red');
  assert.equal(quota.severityBand([], null), null);
});

test('tooltip renders windows, plan, and extra usage; stale block on error', () => {
  const parsed = quota.parseUsageResponse(REAL_BODY);
  parsed.planType = 'pro';
  const now = new Date('2026-10-23T15:00:00Z');
  const tip = quota.tooltipText(parsed, now, null);
  assert.match(tip, /^Claude Code quota/);
  assert.match(tip, /Plan: pro/);
  assert.match(tip, /5-hour\nRemaining: 71%\nUsed: 29%\nResets: .+ \(in 2h 29m\)/);
  assert.match(tip, /Weekly\nRemaining: 83%/);
  assert.match(tip, /Extra usage: disabled/);

  parsed.planType = null;
  const stale = quota.tooltipText(parsed, now, 'timeout');
  assert.match(stale, /Last refresh failed: timeout/);
  assert.match(stale, /Data below may be stale\./);
  assert.doesNotMatch(stale, /Plan:/);
});
