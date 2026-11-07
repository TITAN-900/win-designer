import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoginHandler} from '../api/portfolio-login.js';
const env={VITE_SUPABASE_URL:'https://test.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',PORTFOLIO_ADMIN_USERNAME:'test-owner',PORTFOLIO_ADMIN_AUTH_EMAIL:'test@example.invalid'};
async function invoke(body, responses, extra={}) {
 const calls=[]; const handler=createLoginHandler({env,delay:async()=>{},fetcher:async(url,options)=>{calls.push({url,...options});return responses.shift();}});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
 await handler({method:'POST',headers:{'content-type':'application/json',host:'localhost',origin:'http://localhost'},body,...extra},res);
 return {res,calls};
}
test('username login issues token only after Auth and owner RLS succeed; does not return identity',async()=>{
 const {res,calls}=await invoke({username:' TEST-OWNER ',password:'test-only'},[Response.json({access_token:'jwt',refresh_token:'private',user:{email:env.PORTFOLIO_ADMIN_AUTH_EMAIL}}),Response.json(true)]);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body,{access_token:'jwt'});
 assert.deepEqual(JSON.parse(calls[0].body),{email:env.PORTFOLIO_ADMIN_AUTH_EMAIL,password:'test-only'});
 assert.match(res.headers['Cache-Control'],/no-store/);
});
test('wrong username and wrong password have identical failure responses and same Auth target',async()=>{
 const a=await invoke({username:'unknown',password:'test-only'},[Response.json({}, {status:400})]);
 const b=await invoke({username:'test-owner',password:'wrong'},[Response.json({}, {status:400})]);
 assert.equal(a.res.statusCode,401);assert.deepEqual(a.res.body,b.res.body);
 assert.equal(JSON.parse(a.calls[0].body).email,JSON.parse(b.calls[0].body).email);
 assert.notEqual(JSON.parse(a.calls[0].body).password,'test-only');
});
test('valid Auth token without owner role is rejected and revoked',async()=>{
 const {res,calls}=await invoke({username:'test-owner',password:'test-only'},[Response.json({access_token:'jwt'}),Response.json(false),new Response(null,{status:204})]);
 assert.equal(res.statusCode,401);assert.match(calls[2].url,/logout/);assert.ok(!res.body.access_token);
});
test('rate limits, malformed requests and cross-site requests fail closed',async()=>{
 assert.equal((await invoke({username:'test-owner',password:'x'},[new Response(null,{status:429})])).res.statusCode,429);
 assert.equal((await invoke({username:[],password:'x'},[])).res.statusCode,401);
 assert.equal((await invoke({},[],{headers:{origin:'https://attacker.invalid',host:'localhost'}})).res.statusCode,403);
 assert.equal((await invoke({},[],{method:'GET'})).res.statusCode,405);
});
test('missing mapping fails clearly without authenticating anyone',async()=>{
 const handler=createLoginHandler({env:{},fetcher:()=>{throw Error('must not call')}});
 const res={setHeader(){},end(v){this.body=JSON.parse(v)}};
 await handler({method:'POST',headers:{'content-type':'application/json'}},res);
 assert.equal(res.statusCode,503);
});
test('frontend uses username text field and never contains mapping configuration',()=>{
 const source=readFileSync('src/admin.js','utf8')+readFileSync('src/admin-view.js','utf8');
 assert.match(source,/name="username" type="text"/);assert.doesNotMatch(source,/name="email"|form\.email/);
 for(const file of ['src/admin.js','src/portfolio-api.js'])assert.doesNotMatch(readFileSync(file,'utf8'),/PORTFOLIO_ADMIN_AUTH_EMAIL|PORTFOLIO_ADMIN_USERNAME/);
});
