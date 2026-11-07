// Firestore over REST, signed in as the Firebase service account (no SDK, so it runs in a Worker).

let token = null; // { value, exp, email }
let ownerUid = null;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));

function serviceAccount(env) {
  if (!env.FIREBASE_SA) throw new Error('The connector is missing its Firebase key (FIREBASE_SA).');
  return typeof env.FIREBASE_SA === 'string' ? JSON.parse(env.FIREBASE_SA) : env.FIREBASE_SA;
}
export const projectId = (env) => serviceAccount(env).project_id;

async function accessToken(env) {
  const sa = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  if (token && token.email === sa.client_email && token.exp - 120 > now) return token.value;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const claims = {
    iss: sa.client_email, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
  };
  const unsigned = `${b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlStr(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(claims.aud, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(sig)}`,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google sign-in for the connector failed (${res.status}): ${j.error_description || j.error || ''}`);
  token = { value: j.access_token, exp: now + (j.expires_in || 3600), email: sa.client_email };
  return token.value;
}

async function google(env, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Firebase said ${res.status}: ${data?.error?.message || text.slice(0, 200)}`);
  return data;
}

/** Brian's account id, looked up once by his sign-in email. */
export async function uid(env) {
  if (ownerUid) return ownerUid;
  if (!env.OWNER_EMAIL) throw new Error('The connector is missing OWNER_EMAIL.');
  const r = await google(env, `https://identitytoolkit.googleapis.com/v1/projects/${projectId(env)}/accounts:lookup`, { method: 'POST', body: JSON.stringify({ email: [env.OWNER_EMAIL] }) });
  ownerUid = r.users?.[0]?.localId;
  if (!ownerUid) throw new Error('No 3D Anatomy account found for the owner email.');
  return ownerUid;
}

const base = (env) => `https://firestore.googleapis.com/v1/projects/${projectId(env)}/databases/(default)/documents`;
const userPath = async (env) => `${base(env)}/users/${await uid(env)}`;

/* ---------- value encoding ---------- */
export function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
export const decodeFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));
export function encode(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encode) } };
  return { mapValue: { fields: encodeFields(x) } };
}
export const encodeFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
const fromDoc = (d) => ({ id: d.name.split('/').pop(), ...decodeFields(d.fields) });

/* ---------- reads and writes under users/<uid> ---------- */
export async function query(env, collection, { field, op = 'GREATER_THAN_OR_EQUAL', value, limit } = {}) {
  const structuredQuery = { from: [{ collectionId: collection }] };
  if (field) {
    structuredQuery.where = { fieldFilter: { field: { fieldPath: field }, op, value: encode(value) } };
    structuredQuery.orderBy = [{ field: { fieldPath: field }, direction: 'ASCENDING' }];
  }
  if (limit) structuredQuery.limit = limit;
  const rows = await google(env, `${await userPath(env)}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  return rows.filter((r) => r.document).map((r) => fromDoc(r.document));
}
export async function getDoc(env, collection, id) {
  try { return fromDoc(await google(env, `${await userPath(env)}/${collection}/${encodeURIComponent(id)}`)); }
  catch (e) { if (/ 404:/.test(e.message)) return null; throw e; }
}
/** Writes the whole document (create or replace). */
export async function setDoc(env, collection, id, data) {
  return fromDoc(await google(env, `${await userPath(env)}/${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(data) }) }));
}
/** Changes only the given fields of an existing document. */
export async function patchDoc(env, collection, id, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return fromDoc(await google(env, `${await userPath(env)}/${collection}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(data) }) }));
}
export async function deleteDoc(env, collection, id) {
  await google(env, `${await userPath(env)}/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function _resetForTests() { token = null; ownerUid = null; }
