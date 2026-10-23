'use strict';

// Minimal HTTPS client for Claude Code's usage endpoint.
// GET https://api.anthropic.com/api/oauth/usage with the Claude Code OAuth
// access token returns the same numbers as Claude Code's /usage command
// (verified live 2026-10; plain Bearer works, no beta header needed). It is
// read-only: no prompt is sent and no quota is consumed. The token never
// appears in errors or returned data.

const https = require('https');

const HOST = 'api.anthropic.com';
const PATH = '/api/oauth/usage';
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 256 * 1024;

function classified(reason, message) {
  return Object.assign(new Error(message), { reason });
}

// One GET round-trip. Resolves { status, body } (body is parsed JSON or
// null) or rejects with err.reason in ('timeout' | 'network' | 'http').
function requestJson(accessToken, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadline = null;
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };
    const req = https.request(
      {
        host: HOST,
        path: PATH,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        // A disconnected response does not necessarily emit a request error
        // or timeout. Always settle it so the monitor can poll again.
        const interrupted = () => finish(reject, classified('network', 'Claude usage response was interrupted.'));
        res.on('error', interrupted);
        res.on('aborted', interrupted);
        res.on('close', () => { if (!res.complete) interrupted(); });
        let receivedBytes = 0;
        let text = '';
        res.on('data', (chunk) => {
          receivedBytes += Buffer.byteLength(chunk);
          text += chunk;
          if (receivedBytes > MAX_BODY_BYTES) {
            finish(reject, classified('http', 'Claude usage response was too large.'));
            req.destroy();
          }
        });
        res.on('end', () => {
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            // non-JSON; the caller reports it by status
          }
          finish(resolve, { status: res.statusCode, body });
        });
      }
    );
    const onTimeout = () => {
      finish(reject, classified('timeout', 'Claude usage endpoint timed out.'));
      req.destroy();
    };
    req.on('timeout', onTimeout);
    // Socket inactivity timeouts alone do not bound DNS/TLS or trickle reads.
    deadline = setTimeout(onTimeout, timeoutMs);
    req.on('error', (err) => {
      finish(reject, classified('network', 'Usage endpoint network request failed.'));
    });
    req.end();
  });
}

// Resolves the parsed usage body. Rejects with err.reason in
// ('unauthorized' | 'rate-limited' | 'http' | 'shape' | 'timeout' | 'network').
async function fetchUsage(accessToken, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  let res;
  try {
    res = await requestJson(accessToken, timeoutMs);
  } catch (err) {
    if (err.reason === 'timeout' || err.reason === 'network') {
      // one quick retry for transient transport failures
      res = await requestJson(accessToken, timeoutMs);
    } else {
      throw err;
    }
  }
  if (res.status === 401 || res.status === 403) {
    throw classified(
      'unauthorized',
      `Claude Code token was rejected (HTTP ${res.status}).\nRun 'claude' in a terminal to log in again, then refresh.`
    );
  }
  if (res.status === 429) {
    throw classified('rate-limited', 'Claude usage endpoint rate-limited the request.');
  }
  if (res.status !== 200) {
    throw classified('http', `Claude usage endpoint returned HTTP ${res.status}.`);
  }
  if (!res.body || typeof res.body !== 'object') {
    throw classified('shape', 'Claude usage endpoint returned a non-JSON response.');
  }
  return res.body;
}

module.exports = { fetchUsage, HOST, PATH };
