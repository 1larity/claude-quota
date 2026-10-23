'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const credentials = require('../lib/credentials.js');

// Injectable fake fs: read-only on purpose. Any write attempt would throw,
// which is the point: the extension must never touch the credentials file.
function fakeFs(files) {
  return {
    readFileSync(p) {
      if (!(p in files)) {
        throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
      }
      return files[p];
    },
  };
}

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const PATH = '/home/u/.claude/.credentials.json';

function credFile(overrides = {}) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: 'tok-valid',
      refreshToken: 'rt-1',
      expiresAt: NOW + 60 * 60 * 1000,
      scopes: ['user:inference'],
      subscriptionType: 'pro',
      ...overrides,
    },
  });
}

test('reads a valid unexpired token', () => {
  const cred = credentials.loadCredentials({
    credentialsPath: PATH,
    fsImpl: fakeFs({ [PATH]: credFile() }),
    now: NOW,
  });
  assert.equal(cred.accessToken, 'tok-valid');
  assert.equal(cred.subscriptionType, 'pro');
  assert.equal(cred.credentialsPath, PATH);
});

test('missing file -> not-found; malformed JSON / missing oauth block -> malformed', () => {
  assert.throws(
    () => credentials.loadCredentials({ credentialsPath: PATH, fsImpl: fakeFs({}) }),
    (err) => err.reason === 'not-found' && /Run 'claude'/.test(err.message)
  );
  assert.throws(
    () => credentials.loadCredentials({ credentialsPath: PATH, fsImpl: fakeFs({ [PATH]: '{oops' }) }),
    (err) => err.reason === 'malformed'
  );
  assert.throws(
    () =>
      credentials.loadCredentials({
        credentialsPath: PATH,
        fsImpl: fakeFs({ [PATH]: '{"apiKeyHelper":"x"}' }),
      }),
    (err) => err.reason === 'malformed'
  );
});

test('other read errors -> io', () => {
  const fsImpl = {
    readFileSync() {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    },
  };
  assert.throws(
    () => credentials.loadCredentials({ credentialsPath: PATH, fsImpl }),
    (err) => err.reason === 'io'
  );
});

test('~ paths expand against the provided home', () => {
  const cred = credentials.loadCredentials({
    credentialsPath: '~/.claude/.credentials.json',
    fsImpl: fakeFs({ [PATH]: credFile() }),
    home: '/home/u',
    now: NOW,
  });
  assert.equal(cred.credentialsPath, PATH);
});

test('expired token -> expired, without refreshing or writing anything', () => {
  // fakeFs has no write methods, so any write attempt would throw TypeError.
  assert.throws(
    () =>
      credentials.loadCredentials({
        credentialsPath: PATH,
        fsImpl: fakeFs({ [PATH]: credFile({ expiresAt: NOW - 1000 }) }),
        now: NOW,
      }),
    (err) => err.reason === 'expired' && !/tok-/.test(err.message)
  );
});

test('expiry boundary and missing expiresAt', () => {
  const at = (expiresAt) =>
    credentials.isExpired(credentials.extractOauth(JSON.parse(credFile({ expiresAt })), PATH), NOW);
  assert.equal(at(NOW + 1), false);
  assert.equal(at(NOW), true);
  assert.equal(at(undefined), false); // unknown expiry: let the server decide
});

// Load the production module with native Windows path semantics on any host.
test('Windows default and backslash tilde paths resolve under the home directory', () => {
  const fs = require('fs');
  const vm = require('vm');
  const path = require('path').win32;
  const home = 'C:\\Users\\Test';
  const expected = path.join(home, '.claude', '.credentials.json');
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/credentials'), 'utf8'), {
    module: mod,
    require: (id) => id === 'path' ? path : id === 'os' ? { homedir: () => home } : require(id),
  });
  for (const credentialsPath of [undefined, '~\\.claude\\.credentials.json', '~/.claude/.credentials.json']) {
    const cred = mod.exports.loadCredentials({ credentialsPath, fsImpl: fakeFs({ [expected]: credFile() }), now: NOW });
    assert.equal(cred.credentialsPath, expected);
  }
});
