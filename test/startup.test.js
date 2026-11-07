import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('startup explains invalid hosted environment settings without leaking values', () => {
  const uri = 'private-invalid-uri-do-not-log';
  const secret = 'private-short-secret';
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, MONGODB_URI: uri, JWT_SECRET: secret, PORT: 'invalid-private-port' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /MONGODB_URI must begin/);
  assert.match(output, /JWT_SECRET must be/);
  assert.match(output, /PORT must be/);
  for (const value of [uri, secret, 'invalid-private-port']) assert.equal(output.includes(value), false);
  assert.equal(output.includes('Connecting to MongoDB'), false);
});
