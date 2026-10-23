'use strict';

// Pure parsing/formatting helpers for Claude Code usage data.
// Source: GET https://api.anthropic.com/api/oauth/usage (the endpoint behind
// Claude Code's /usage command). Verified live 2026-10:
//   { five_hour: { utilization: 16, resets_at: "2026-10-23T17:29:59.5+00:00" },
//     seven_day: { utilization: 25, resets_at: "..." },
//     seven_day_opus: null, seven_day_sonnet: null,
//     extra_usage: { is_enabled: false, ... }, ... }
// `utilization` is percent USED (0..100); `resets_at` is ISO 8601. Model-
// scoped weekly windows are null unless the plan has them. Unknown/extra
// fields are ignored. No vscode import, no fs, no network.

const common = require('./common');
const { clampPercent } = common;

// Response key -> window identity. Model-scoped weekly windows show in the
// tooltip and count toward the color band, but stay out of the status text.
const WINDOWS = [
  { key: 'five_hour', kind: '5h', label: '5-hour', short: '5h' },
  { key: 'seven_day', kind: 'week', label: 'Weekly', short: 'W' },
  { key: 'seven_day_opus', kind: 'week-opus', label: 'Weekly (Opus)', short: 'Op', inStatus: false },
  { key: 'seven_day_sonnet', kind: 'week-sonnet', label: 'Weekly (Sonnet)', short: 'So', inStatus: false },
];

// 16 or "16" -> 16 (clamped to 0..100); anything else -> undefined.
function parsePercent(value) {
  const n = typeof value === 'string' ? Number.parseFloat(value.trim()) : value;
  return clampPercent(n);
}

// ISO 8601 string (or unix seconds/ms) -> Date, or null.
function parseResetAt(value) {
  let ms;
  if (typeof value === 'string' && value.trim()) {
    ms = Date.parse(value);
  } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    ms = value >= 1e12 ? value : value * 1000;
  } else {
    return null;
  }
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// Adapt one usage entry into a UsageWindow; null when the entry is absent.
// Percentages are rounded to 0.1% to keep float noise out of the display.
function adaptWindow(entry, def) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const used = parsePercent(entry.utilization);
  return {
    kind: def.kind,
    label: def.label,
    short: def.short,
    inStatus: def.inStatus !== false,
    usedPercent: used === undefined ? undefined : Math.round(used * 10) / 10,
    remainingPercent: used === undefined ? undefined : Math.round((100 - used) * 10) / 10,
    resetAt: parseResetAt(entry.resets_at),
  };
}

// Parse a usage response body. Returns { windows, extraUsageEnabled,
// planType: null } or null when no window was found. Never throws.
function parseUsageResponse(body) {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const windows = WINDOWS.map((def) => adaptWindow(body[def.key], def)).filter((w) => w !== null);
  if (windows.length === 0) {
    return null;
  }
  const extra = body.extra_usage;
  return {
    windows,
    extraUsageEnabled:
      extra && typeof extra === 'object' && typeof extra.is_enabled === 'boolean'
        ? extra.is_enabled
        : null,
    planType: null, // filled from the credentials file by the caller
  };
}

// Compact status bar text (without prefix), e.g. "5h 84% · W 75%".
function statusText(windows) {
  return common.statusText(windows);
}

// Detailed hover tooltip. `staleError` (optional) marks the data as stale.
function tooltipText(parsed, fetchedAt, staleError) {
  const sections = parsed.windows.map((w) => common.windowLines(w, fetchedAt));
  if (parsed.extraUsageEnabled !== null) {
    sections.push([`Extra usage: ${parsed.extraUsageEnabled ? 'enabled' : 'disabled'}`]);
  }
  return common.tooltipText('Claude Code quota', parsed.planType, fetchedAt, staleError, sections);
}

module.exports = {
  parsePercent,
  parseResetAt,
  parseUsageResponse,
  normalizeThresholds: common.normalizeThresholds,
  severityBand: common.severityBand,
  statusText,
  formatDurationMs: common.formatDurationMs,
  formatResets: common.formatResets,
  tooltipText,
};
