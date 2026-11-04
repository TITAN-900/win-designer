// Live security checks against the configured project. No owner credentials used.
// Every attempted mutation must fail; random IDs prevent touching real projects.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
const origin = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(origin?.startsWith('https://') && key?.startsWith('sb_publishable_'));
const id = randomUUID(), photoId = randomUUID();
const path = `${id}/${photoId}.jpg`;
const call = async (route, method = 'GET', body, type = 'application/json') => {
  const response = await fetch(origin + route, {
    method, headers: { apikey: key, 'Content-Type': type },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
};
const checks = [];
for (const [label, route, method, body] of [
  ['create project', '/rest/v1/portfolio_projects', 'POST', { id, slug: `security-check-${id}`, name: 'DISPOSABLE SECURITY CHECK', status: 'DRAFT' }],
  ['edit project', `/rest/v1/portfolio_projects?id=eq.${id}`, 'PATCH', { name: 'UNAUTHORIZED' }],
  ['publish project', `/rest/v1/portfolio_projects?id=eq.${id}`, 'PATCH', { status: 'PUBLISHED' }],
  ['delete project', `/rest/v1/portfolio_projects?id=eq.${id}`, 'DELETE'],
  ['grant administrator', '/rest/v1/portfolio_admins', 'POST', {user_id: id}],
  ['read administrator list', '/rest/v1/portfolio_admins', 'GET'],
]) {
  const result = await call(route, method, body);
  assert.ok([401,403].includes(result.status), `${label}: expected permission denial, got ${result.status}`);
  checks.push({check:label, status:result.status, result:'denied'});
}
const owner = await call('/rest/v1/rpc/portfolio_is_admin', 'POST', {});
assert.equal(owner.status, 200); assert.equal(owner.data, false);
checks.push({check:'anonymous owner RPC',result:false});
for (const [label, method, route, body, type] of [
  ['upload photo','POST',`/storage/v1/object/portfolio/${path}`,Buffer.from([255,216,255,217]),'image/jpeg'],
  ['delete photo','DELETE','/storage/v1/object/portfolio',{prefixes:[path]},'application/json']
]) {
  const result = await call(route,method,body,type);
  const denied = [401,403].includes(result.status) || [401,403].includes(Number(result.data?.statusCode));
  // Storage DELETE may return [] under RLS, which means no objects were deleted.
  assert.ok(denied || (method==='DELETE' && result.status===200 && Array.isArray(result.data) && result.data.length===0), `${label}: unexpected ${JSON.stringify(result)}`);
  checks.push({check:label,status:result.status,result:denied?'denied':'no authorized objects'});
}
console.log(JSON.stringify({project:'win-journey-portfolio',checks},null,2));
