import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dialogue } from '../server/ai.js';
import { configFromEnv } from '../server/config.js';
import { NPCS } from '../assets/npcs.js';
import { evaluatePersuasion } from '../server/persuasion.js';
const words = 'The price is forty imaginary dollars with no recurring bill.';
const answer = (extra = {}) => ({ reply:'Does that include the flamingos?',intent:'explanation',concernId:'cost',evidence:words,quality:2,objection:'What does it do?',disposition:'considering',wantsToEnd:false,memory:[],mode:'GPT-5.6 Luna',...extra });
const state = () => ({ trust:34,susp:17,turns:1,preoccupation:'goose',history:[{ who:'system',text:'Connected' },{ who:'me',text:words }],memory:[] });
test('Node calls only the Supabase function, sends no OpenAI key and never retries failures', async () => {
  let count = 0, sent;
  const d = new Dialogue({ aiEnabled:true,functionUrl:'https://test.supabase.co/functions/v1/npc-dialogue',gameServerToken:'private-test' },async (url,init) => {
    count++; sent = { url,init,body:JSON.parse(init.body) }; return Response.json({ error:'DAILY_BUDGET' },{ status:429 });
  });
  await assert.rejects(d.reply(NPCS[1],state(),words,'Office open'),/budget/);
  assert.equal(count,1); assert.ok(sent.url.endsWith('npc-dialogue')); assert.equal(sent.body.profile.age,48);
  assert.equal(sent.body.text,words); assert.equal(sent.body.history.length,0); assert.equal(sent.body.model,undefined);
  await assert.rejects(d.reply(NPCS[1],state(),words,'Office open'),/busy/); assert.equal(count,1);
});
test('practice mode is explicit and cannot accidentally make a model call', async () => {
  const d = new Dialogue({ aiEnabled:false },async () => { throw new Error('network forbidden'); });
  assert.match((await d.reply(NPCS[1],state(),words,'Office open')).mode,/Practice/);
});
test('persuasion requires grounded relevant evidence; repetition and repeated concerns diminish', () => {
  const c = state();
  assert.equal(evaluatePersuasion(NPCS[1],c,words,answer()).trust,12);
  assert.equal(evaluatePersuasion(NPCS[1],c,words,answer()).trust,0);
  const next = 'You can cancel tomorrow and no more invoices will arrive.';
  assert.equal(evaluatePersuasion(NPCS[1],c,next,answer({ evidence:next })).trust,4);
  assert.equal(evaluatePersuasion(NPCS[1],c,'Our company is really wonderful and very nice.',answer({ evidence:'a completely invented quotation' })).trust,0);
  assert.equal(c.resolved.length,1);
  assert.equal(evaluatePersuasion(NPCS[1],c,'I like you and your whole family very much.',answer({ intent:'smalltalk',quality:3 })).trust,0);
});
test('a model cannot directly set scores or arbitrarily hang up', () => {
  const c = state(), r = answer({ wantsToEnd:true,trustDelta:999999,hangup:true });
  const result = evaluatePersuasion(NPCS[1],c,words,r);
  assert.equal(result.trust,12); assert.equal(result.hangup,false); assert.equal(result.ready,false);
  const insult = 'You are an idiot, hurry up.';
  evaluatePersuasion(NPCS[1],c,insult,answer({ intent:'abuse',wantsToEnd:true }));
  assert.equal(evaluatePersuasion(NPCS[1],c,'Shut up you idiot.',answer({ intent:'abuse',wantsToEnd:true })).hangup,true);
});
test('Node rejects OpenAI keys and production works with no persistent Render disk', () => {
  assert.throws(() => configFromEnv({ OPENAI_API_KEY:'test' }),/only in Supabase/);
  assert.throws(() => configFromEnv({ AI_ENABLED:'true' }),/GAME_SERVER_TOKEN/);
  const config = configFromEnv({ NODE_ENV:'production',PRIVATE_GAME_PASSWORD:'private-test',AI_ENABLED:'true',GAME_SERVER_TOKEN:'x'.repeat(32),SUPABASE_URL:'https://test.supabase.co' });
  assert.equal(config.functionUrl,'https://test.supabase.co/functions/v1/npc-dialogue'); assert.equal(config.dataDir,undefined);
});
