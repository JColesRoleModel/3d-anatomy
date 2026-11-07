// Offline test: runs the Worker against a fake Google (token, account lookup, Firestore REST) with made-up data.
import assert from 'node:assert/strict';
import worker from './src/index.js';
import { encodeFields, _resetForTests } from './src/firestore.js';

const { privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
const env = {
  MCP_SECRET: 'test-secret', OWNER_EMAIL: 'owner@example.com', TZ_NAME: 'America/Los_Angeles',
  FIREBASE_SA: JSON.stringify({ project_id: 'demo', client_email: 'sa@demo.iam', token_uri: 'https://oauth2.googleapis.com/token', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n` }),
};

// Fake data, all "today" in Los Angeles.
const now = Date.now();
const db = {
  activity: { a1: { source: 'watch', ring: 'mind', title: 'Marcus Aurelius', seconds: 1200, startedAt: now - 3 * 3600e3, endedAt: now - 3 * 3600e3 + 1200e3 } },
  sessions: { s1: { section: 'Breathwork Toolkit', routine: 'Open breathing', movement: 'Open breathing', duration: 600, timestamp: now - 2 * 3600e3 }, s2: { section: 'Lower Body Innervation', routine: 'HIPS1', movement: 'Hip circles', duration: 300, timestamp: now - 3600e3 } },
  tasks: { t1: { title: 'Review cranial nerves', section: 'general', due: null, dueTime: null, completed: false, createdAt: 1, updatedAt: 1 } },
  checkins: { c1: { startedAt: now - 86400e3, kind: 'quick', modules: { feel: { score: 7 }, math: { perMinute: 18, trials: Array(30).fill(1) } } } },
  prefs: { main: { goals: { body: 30, mind: 30, spirit: 15 } } },
};
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push(`${init.method || 'GET'} ${url.replace(/^https:\/\/[^/]+/, '')}`);
  const res = (status, body) => new Response(JSON.stringify(body), { status });
  if (url.startsWith('https://oauth2.googleapis.com/token')) { assert.match(String(init.body), /assertion=[\w-]+\.[\w-]+\.[\w-]+/); return res(200, { access_token: 'tok', expires_in: 3600 }); }
  assert.equal(init.headers.authorization, 'Bearer tok');
  if (url.includes('accounts:lookup')) return res(200, { users: [{ localId: 'u1' }] });
  const m = /documents\/users\/u1(?::runQuery|\/(\w+)\/([^?]+))/.exec(url);
  assert.ok(m, 'unexpected url ' + url);
  if (url.includes(':runQuery')) {
    const q = JSON.parse(init.body).structuredQuery, col = q.from[0].collectionId, f = q.where?.fieldFilter;
    const docs = Object.entries(db[col] || {}).filter(([, d]) => !f || d[f.field.fieldPath] >= Number(f.value.integerValue ?? f.value.doubleValue));
    return res(200, docs.map(([id, d]) => ({ document: { name: `projects/demo/databases/(default)/documents/users/u1/${col}/${id}`, fields: encodeFields(d) } })));
  }
  const [, col, id] = m, name = `projects/demo/databases/(default)/documents/users/u1/${col}/${decodeURIComponent(id)}`;
  if (init.method === 'DELETE') { delete db[col][decodeURIComponent(id)]; return res(200, {}); }
  if (init.method === 'PATCH') {
    const fields = JSON.parse(init.body).fields, cur = db[col][decodeURIComponent(id)];
    if (url.includes('currentDocument.exists=true') && !cur) return res(404, { error: { message: 'not found' } });
    const decoded = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? v.booleanValue ?? (v.nullValue === null ? null : v))]));
    db[col][decodeURIComponent(id)] = url.includes('updateMask') ? { ...cur, ...decoded } : decoded;
    return res(200, { name, fields: encodeFields(db[col][decodeURIComponent(id)]) });
  }
  const d = db[col]?.[decodeURIComponent(id)];
  return d ? res(200, { name, fields: encodeFields(d) }) : res(404, { error: { message: 'not found' } });
};

const rpc = async (method, params, path = '/test-secret/mcp') => {
  const r = await worker.fetch(new Request('https://x.workers.dev' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), env);
  return { status: r.status, body: r.status === 202 || r.status === 404 ? null : await r.json() };
};
const call = async (name, args) => { const { body } = await rpc('tools/call', { name, arguments: args }); if (body.result.isError) throw new Error(body.result.content[0].text); return body.result.structuredContent; };

_resetForTests();
// Wrong secret is a 404, notifications are 202.
assert.equal((await rpc('ping', {}, '/nope/mcp')).status, 404);
const n = await worker.fetch(new Request('https://x.workers.dev/test-secret/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), env);
assert.equal(n.status, 202);
// Handshake + tool list.
const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).body.result;
assert.equal(init.protocolVersion, '2025-06-18');
const tools = (await rpc('tools/list', {})).body.result.tools.map((t) => t.name);
assert.deepEqual(tools, ['get_rings', 'list_time', 'log_time', 'delete_logged_time', 'list_tasks', 'add_task', 'update_task', 'get_checkins']);

// Rings: 20m mind, 10m spirit, 5m body today.
const rings = await call('get_rings', {});
assert.equal(rings.todayProgress.mind.time, '20m 00s');
assert.equal(rings.todayProgress.spirit.time, '10m 00s');
assert.equal(rings.todayProgress.body.time, '5m 00s');
assert.equal(rings.days.length, 7);
console.log('rings ok', rings.todayProgress);

// Log 15 minutes of breathwork ending now → spirit goal met.
const logged = await call('log_time', { what: 'Box breathing', ring: 'spirit', minutes: 15, tags: ['#calm'] });
assert.equal(logged.length, '15m 00s'); assert.deepEqual(logged.tags, ['calm']);
const rings2 = await call('get_rings', {});
assert.equal(rings2.todayProgress.spirit.time, '25m 00s');
assert.ok(rings2.days.at(-1).spirit.goalMet);
const time = await call('list_time', {});
assert.equal(time.sessions[0].title, 'Box breathing');
console.log('log_time ok', logged);
// Start/end across midnight and errors.
const late = await call('log_time', { what: 'Night meditation', ring: 'spirit', date: '2026-01-10', start: '11:30pm', end: '12:15am' });
assert.equal(late.length, '45m 00s');
await assert.rejects(call('log_time', { what: 'x', ring: 'heart', minutes: 5 }), /body, mind or spirit/);
await assert.rejects(call('log_time', { what: 'x', ring: 'body', date: '2099-01-01', minutes: 5 }), /hasn't happened/);
await call('delete_logged_time', { id: late.id });
await assert.rejects(call('delete_logged_time', { id: 'a1' }), /Only time logged by hand/);

// Tasks.
const added = await call('add_task', { title: 'Study brachial plexus', due_date: '2026-11-20', due_time: '2:30pm' });
assert.equal(added.list, 'due'); assert.equal(added.dueTime, '14:30');
let tasks = await call('list_tasks', {});
assert.equal(tasks.open, 2);
await call('update_task', { task_id: added.id, done: true });
tasks = await call('list_tasks', {});
assert.equal(tasks.open, 1);
const moved = await call('update_task', { task_id: 't1', due_date: '2026-11-21' });
assert.equal(moved.task.list, 'due');
await assert.rejects(call('update_task', { task_id: 'nope', done: true }), /No task/);
console.log('tasks ok', tasks.groups.map((g) => g.when));

// Check-ins drop raw trials.
const ci = await call('get_checkins', {});
assert.equal(ci.count, 1); assert.equal(ci.checkins[0].kind, 'daily'); assert.equal(ci.checkins[0].modules.math.trials, undefined);
console.log('checkins ok', JSON.stringify(ci.checkins[0]));
console.log('\nALL PASSED (' + calls.length + ' fake Google calls)');
