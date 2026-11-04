import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();
const normalize = value => value.trim().toLowerCase();
const INVALID = '用户名或密码不正确。';

// No admin key: Supabase authenticates the password, then RLS verifies ownership.
// Dependencies are injectable only for isolated tests, never via an HTTP request.
export function createLoginHandler({ env = process.env, fetcher = fetch, delay = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return send(405,{message:'Method not allowed'}); }
    if (req.headers['sec-fetch-site'] === 'cross-site') return send(403,{message:'Request denied'});
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return send(403,{message:'Request denied'}); }
      catch { return send(403,{message:'Request denied'}); }
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415,{message:'JSON required'});
    const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const owner = env.PORTFOLIO_ADMIN_USERNAME, email = env.PORTFOLIO_ADMIN_AUTH_EMAIL;
    if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_') || !/^[a-z0-9][a-z0-9._-]{2,47}$/.test(owner || '') || !email?.includes('@')) {
      return send(503,{message:'管理员登录尚未完成服务端配置。'});
    }
    const start = Date.now();
    const fail = async (status=401) => { await delay(Math.max(0,800-(Date.now()-start)+Math.floor(Math.random()*100))); return send(status,{message:status===429?'登录尝试过多，请稍后再试。':INVALID}); };
    let body;
    try {
      if (req.body !== undefined) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      else {
        let size=0; const chunks=[];
        for await (const chunk of req) { size+=Buffer.byteLength(chunk); if(size>4096)return send(413,{message:'Request too large'});chunks.push(Buffer.from(chunk)); }
        body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
    } catch { return fail(); }
    if (!body || typeof body.username!=='string' || body.username.length>48 || typeof body.password!=='string' || !body.password.length || body.password.length>1024) return fail();
    const matches = timingSafeEqual(digest(normalize(body.username)),digest(owner));
    // Unknown names still hit the SAME account's Auth rate limits/password path.
    // Never authenticate an unknown name even when its supplied password is correct.
    const password = matches ? body.password : randomBytes(48).toString('base64url');
    try {
      const auth = await fetcher(`${url}/auth/v1/token?grant_type=password`,{
        method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
        body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000)
      });
      if(auth.status===429)return fail(429);
      if(!auth.ok)return fail();
      const session=await auth.json();
      if(!session.access_token)return fail();
      const headers={apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
      const permission=await fetcher(`${url}/rest/v1/rpc/portfolio_is_admin`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(15000)});
      if(!matches || !permission.ok || await permission.json() !== true){
        await fetcher(`${url}/auth/v1/logout?scope=local`,{method:'POST',headers,signal:AbortSignal.timeout(5000)}).catch(()=>{});
        return fail();
      }
      // Do not return the Auth user object, email mapping, or refresh token.
      return send(200,{access_token:session.access_token,expires_in:session.expires_in});
    } catch { return send(503,{message:'登录服务暂时不可用，请稍后重试。'}); }
  };
}
export default createLoginHandler();
