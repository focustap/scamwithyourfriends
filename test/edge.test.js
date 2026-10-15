import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { createHandler } from '../supabase/functions/npc-dialogue/handler.js';
import { NPCS } from '../assets/npcs.js';
import { Dialogue } from '../server/ai.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const token = 'test-server-token-with-at-least-32-characters';
const usage = { date:'2026-10-15',mode:'live',enabled:true,liveAllowed:true,tokens:100,requests:1,tokenLimit:50000,requestLimit:10,outputLimit:320,blocked:false };
const assessment = { reply:'Seven flamingos? Which one is in charge of security?',intent:'discovery',concernId:null,evidence:'',quality:1,objection:'What would this cost?',disposition:'considering',wantsToEnd:false,memory:['Doug has seven flamingos.'] };
const payload = () => ({ action:'dialogue',requestId:randomUUID(),profile:structuredClone(NPCS[1]),text:'My antenna watches the lawn, what worries you?',history:[{ role:'assistant',content:'Who is this?' }],memory:['Earl borrowed the rake.'],context:{ trust:34,suspicion:17,event:'Office open',preoccupation:'a goose stole the driveway' } });
function setup(options = {}) {
  const calls = [], env = { GAME_SERVER_TOKEN:token,SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEYS:JSON.stringify({ default:'sb_secret_test-only' }),OPENAI_API_KEY:'fake-key-test-only' };
  const handler = createHandler({ env:n => env[n], fetcher:async (url,init) => {
    calls.push({ url,init,body:JSON.parse(init.body) });
    if (url.includes('/rest/') && options.databaseFail) return Response.json({ message:'private database error' },{ status:503 });
    if (url.endsWith('npc_usage_status')) return Response.json({ ...usage,...options.usage });
    if (url.endsWith('npc_reserve') && options.reject) return Response.json({ message:options.reject },{ status:400 });
    if (url.includes('/rest/')) return Response.json({ ...usage,...options.usage });
    if (options.fail) throw new Error('secret provider message');
    return Response.json({ status:options.incomplete ? 'incomplete' : 'completed',usage:{ input_tokens:900,output_tokens:120,total_tokens:1020 },output:[{ type:'message',content:[{ type:'output_text',text:options.invalid ? 'nonsense' : JSON.stringify(assessment) }] }] });
  } });
  const send = (body = payload(),headers = {}) => handler(new Request('https://test.supabase.co/functions/v1/npc-dialogue',{ method:'POST',headers:{ 'Content-Type':'application/json',Authorization:'Bearer ' + token,...headers },body:JSON.stringify(body) }));
  return { handler,send,calls,env };
}
test('Edge rejects authorization and browser calls before any database/model work', async () => {
  const f = setup();
  assert.equal((await f.send(payload(),{ Authorization:'Bearer wrong' })).status,401);
  assert.equal((await f.send(payload(),{ Origin:'https://focustap.github.io' })).status,403);
  assert.equal(f.calls.length,0);
  f.env.GAME_SERVER_TOKEN = '';
  assert.equal((await f.send()).status,503); assert.equal(f.calls.length,0);
});
test('Edge validates profiles, history, stream size and actions before paid work', async () => {
  const f = setup(), p = payload(); delete p.profile.age;
  assert.equal((await f.send(p)).status,400); assert.equal(f.calls.length,0);
  assert.equal((await f.send({ action:'arbitrary' })).status,400);
  assert.equal((await f.send({ ...payload(),text:'x'.repeat(25000) })).status,413);
  assert.equal(f.calls.length,0);
});
test('Edge calls Responses only after durable reservation and settles reported usage', async () => {
  const f = setup(), p = payload(); const response = await f.send(p); assert.equal(response.status,200);
  const result = await response.json(); assert.equal(result.mode,'GPT-5.6 Terra'); assert.equal(result.reply,assessment.reply);
  assert.deepEqual(f.calls.map(c => c.url.split('/').at(-1)),['npc_usage_status','npc_reserve','responses','npc_settle']);
  const provider = f.calls[2].body; assert.equal(provider.model,'gpt-5.6-terra'); assert.equal(provider.store,false); assert.equal(provider.reasoning.effort,'none');
  assert.ok(provider.instructions.includes(p.profile.background)); assert.ok(provider.instructions.includes(p.memory[0]));
  assert.equal(provider.input.at(-1).content,p.text); assert.equal(provider.input.length,2);
  assert.ok(f.calls[1].body.p_tokens > provider.max_output_tokens); assert.equal(f.calls[1].body.p_payload_hash.length,64);
  assert.equal(f.calls[3].body.p_total,1020);
  assert.equal(f.calls[0].init.headers.Authorization,undefined); // modern DB key is apikey-only
  assert.doesNotMatch(JSON.stringify(result),/fake-key|test-server-token|sb_secret/);
});
test('budget, duplicate, disabled and database failures generate no model request', async () => {
  for (const reject of ['DAILY_BUDGET','RATE_LIMIT','DUPLICATE_REQUEST']) {
    const f = setup({ reject }); assert.ok((await f.send()).status >= 400);
    assert.equal(f.calls.some(c => c.url.includes('openai.com')),false);
  }
  const f = setup({ usage:{ enabled:false } }); assert.equal((await f.send()).status,403);
  assert.equal(f.calls.length,1);
});
test('provider failure keeps reservation, never retries, never returns canned Luna dialogue', async () => {
  const f = setup({ fail:true }), response = await f.send(); assert.equal(response.status,502);
  assert.equal(f.calls.filter(c => c.url.includes('openai.com')).length,1);
  assert.equal(f.calls.at(-1).url.endsWith('npc_fail'),true);
  const result = await response.json(); assert.equal(result.reply,undefined); assert.equal(result.mode,undefined);
  assert.doesNotMatch(JSON.stringify(result),/secret provider/);
});
test('mock mode is explicit, separately budgeted, and makes zero provider requests', async () => {
  const f = setup({ usage:{ mode:'mock',liveAllowed:false } }), response = await f.send();
  assert.equal(response.status,200); const result = await response.json(); assert.match(result.mode,/mock/);
  assert.match(result.reply,/MOCK/); assert.equal(f.calls.some(c => c.url.includes('openai.com')),false);
});
test('malformed/incomplete model output is rejected after known usage is settled', async () => {
  for (const option of [{ invalid:true },{ incomplete:true }]) {
    const f = setup(option); assert.equal((await f.send()).status,502);
    assert.ok(f.calls.some(c => c.url.endsWith('npc_settle')));
  }
});

test('database failures fail closed before OpenAI and never expose raw errors',async () => {
  const f = setup({ databaseFail:true }), response = await f.send();
  assert.equal(response.status,503); assert.equal(f.calls.some(c => c.url.includes('openai.com')),false);
  assert.deepEqual(await response.json(),{ error:'ACCOUNTING_UNAVAILABLE' });
});

test('Node-to-Edge-to-Responses bridge passes actual player words and bounded NPC memory',async () => {
  const f = setup(), words = 'Why did your flamingos form a neighborhood union?';
  const node = new Dialogue({ aiEnabled:true,functionUrl:'https://test.supabase.co/functions/v1/npc-dialogue',gameServerToken:token },
    (url,init) => f.handler(new Request(url,init)));
  const reply = await node.reply(NPCS[1],{ trust:34,susp:17,preoccupation:'a goose moved in',
    history:[{ who:'bot',text:'My flamingos need insurance.' },{ who:'me',text:words }],memory:['Earl has the rake.'] },words,'Office open');
  assert.equal(reply.mode,'GPT-5.6 Terra'); assert.equal(node.ledger.snapshot().available,true);
  const request = f.calls.find(c => c.url.includes('openai.com')).body;
  assert.equal(request.input.at(-1).content,words); assert.equal(request.input.length,2);
  assert.ok(request.instructions.includes('Earl has the rake.')); assert.ok(request.instructions.includes(NPCS[1].speechStyle));
});
