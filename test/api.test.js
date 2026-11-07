import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { stateSchema } from '../src/validation.js';

const records = [];
const users = {
  async findOne(query) { return records.find(user => Object.entries(query).every(([k, v]) => user[k] === v)); },
  async insertOne(user) { records.push(structuredClone(user)); },
  async updateOne(query, update) {
    const user = await this.findOne(query); if (!user) return { matchedCount: 0 };
    Object.assign(user, structuredClone(update.$set)); user.revision += update.$inc.revision; return { matchedCount: 1 };
  },
};
let server, base;
before(async () => { server = createApp({ users, secret: 'test-secret-with-more-than-thirty-two-characters' }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));
async function call(path, body, token, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
test('accounts isolate progress, reject stale writes, and require valid credentials', async () => {
  const a = await call('/auth/register', { email: 'One@example.com', password: 'long-password-one' }); assert.equal(a.status, 200);
  const b = await call('/auth/register', { email: 'two@example.com', password: 'long-password-two' }); assert.equal(b.status, 200);
  assert.equal((await call('/state', null, undefined, 'GET')).status, 401);
  assert.equal((await call('/auth/login', { email: 'one@example.com', password: 'incorrect-password' })).status, 401);
  const challenge = { id: 'read', title: 'Read', category: 'Mind', days: [1, 3, 5] };
  const state = { challenges: [challenge], entries: [{ date: '2026-11-07', challenges: [challenge], completed: ['read'], note: 'Done' }] };
  const saved = await call('/state', { state, revision: 0 }, a.data.token, 'PUT'); assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
  assert.equal((await call('/state', { state, revision: 0 }, a.data.token, 'PUT')).status, 409);
  assert.deepEqual((await call('/state', null, b.data.token, 'GET')).data.state.entries, []);
  assert.deepEqual((await call('/state', null, a.data.token, 'GET')).data.state, state);
  assert.equal((await call('/auth/login', { email: 'ONE@example.com', password: 'long-password-one' })).status, 200);
  assert.equal((await call('/auth/register', { email: 'one@example.com', password: 'long-password-one' })).status, 409);
});
test('API accepts daily legacy habits and valid schedules, rejects malformed weekdays', () => {
  const challenge = { id: 'walk', title: 'Walk', category: 'Health' };
  const valid = days => stateSchema.safeParse({ challenges: [{ ...challenge, days }], entries: [] }).success;
  assert.equal(valid(undefined), true);
  assert.equal(valid([0, 2, 6]), true);
  for (const days of [[], [7], [-1], [1.5], [1, 1], ['Monday']]) assert.equal(valid(days), false);
});
test('validation rejects fabricated completions, impossible dates, and duplicate snapshots', () => {
  const challenge = { id: 'a', title: 'Walk', category: 'Health' };
  const entry = { date: '2026-02-28', challenges: [challenge], completed: ['a'], note: '' };
  const state = { challenges: [challenge], entries: [entry] };
  assert.equal(stateSchema.safeParse(state).success, true);
  for (const patch of [{ completed: ['other'] }, { completed: ['a', 'a'] }, { date: '2026-02-30' }]) assert.equal(stateSchema.safeParse({ ...state, entries: [{ ...entry, ...patch }] }).success, false);
  assert.equal(stateSchema.safeParse({ ...state, entries: [entry, entry] }).success, false);
});
