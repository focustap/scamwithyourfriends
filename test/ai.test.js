import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dialogue } from '../server/ai.js';
import { configFromEnv } from '../server/config.js';
import { NPCS } from '../assets/npcs.js';
import { evaluatePersuasion } from '../server/persuasion.js';
const words = 'The price is forty imaginary dollars with no recurring bill.';
const answer = (extra = {}) => ({ reply:'Does that include the flamingos?',intent:'explanation',concernId:'cost',evidence:words,quality:2,objection:'What does it do?',disposition:'considering',wantsToEnd:false,memory:[],mode:'GPT-5.6 Luna',...extra });
const state = () => ({ trust:34,susp:17,turns:1,preoccupation:'goose',history:[{ who:'system',text:'Connected' },{ who:'me',text:words }],memory:[],resolved:[],offerPrice:140 });
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
test('Node preserves ten latest messages and passes credited concerns for NPC judgment',async () => {
  let sent;
  const d = new Dialogue({ aiEnabled:true,functionUrl:'https://test.supabase.co/functions/v1/npc-dialogue',gameServerToken:'private-test' },async (_url,init) => {
    sent = JSON.parse(init.body);
    return Response.json({ error:'DAILY_BUDGET' },{ status:429 });
  });
  const old = Array.from({length:13},(_,i)=>({ who:i%2 ? 'bot':'me',text:'message '+i }));
  await assert.rejects(d.reply(NPCS[1],{ ...state(),history:[{ who:'system',text:'Line connected' },...old,{ who:'me',text:words }],resolved:['cost'] },words,'Office open'),/budget/);
  assert.equal(sent.history.length,4);
  assert.equal(sent.history[0].content,'message 9');
  assert.deepEqual(sent.context.resolved,['cost']);
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

test('stating the selling price earns PRICE even when customer wants additional assurances',()=>{
  const npc=NPCS.find(n=>n.id==='vince');
  const call={trust:22,susp:44,turns:1,resolved:[],contributions:{},pitches:[],computer:{completed:false}};
  const opening='Hello Sir, I would like to talk to you about selling you a haunted mirror polishing for 210$?';
  const cautious={reply:'What does that price cover?',intent:'discovery',concernId:null,evidence:'',quality:0,objection:'What protection against damage?',disposition:'considering',wantsToEnd:false,memory:[]};
  const scored=evaluatePersuasion(npc,call,opening,cautious);
  assert.deepEqual(call.resolved,['cost']);
  assert.equal(scored.trust,0);
  assert.equal(call.discovered,undefined);
  assert.equal(scored.ready,false);
  const second='It will prevent your mirror from becoming haunted, 210 dollars is a fair price for polishing';
  const again=evaluatePersuasion(npc,call,second,{...cautious,intent:'explanation'});
  assert.equal(call.resolved.filter(id=>id==='cost').length,1);
  assert.equal(again.trust,0);
});
test('a discovery bonus requires a question about customer needs, not a sales introduction',()=>{
  const npc=NPCS[0],result={reply:'Hmm.',intent:'discovery',concernId:null,evidence:'',quality:0,objection:'Why?',disposition:'considering',wantsToEnd:false,memory:[]};
  const call={resolved:[],pitches:[],contributions:{}};
  assert.equal(evaluatePersuasion(npc,call,'I am here to sell you insurance, are you interested?',result).trust,0);
  assert.equal(evaluatePersuasion(npc,call,'What usually goes wrong with your old toaster?',result).trust,3);
});
test('unrelated money and unrealistic prices do not earn the PRICE mark',()=>{
  const npc=NPCS.find(n=>n.id==='vince'), result={reply:'Okay.',intent:'smalltalk',concernId:null,evidence:'',quality:0,objection:'Details?',disposition:'considering',wantsToEnd:false,memory:[]};
  for(const words of ['I have $210 in my wallet.','I collect 210 mirrors.','I can sell this polishing for $9000.']){
    const call={resolved:[],pitches:[],contributions:{}};
    evaluatePersuasion(npc,call,words,result);
    assert.deepEqual(call.resolved,[],words);
  }
});

test('an AI-selected hangup can end an abusive call immediately but not arbitrarily',()=>{
  const npc=NPCS[0],rejected={reply:'Please leave me alone.',intent:'abuse',concernId:null,evidence:'',quality:0,objection:'',disposition:'declines',wantsToEnd:true,memory:[]};
  const call={resolved:[],contributions:{},pitches:[]};
  assert.equal(evaluatePersuasion(npc,call,'Shut up you idiot, do what I say.',rejected).hangup,true);
  const mild={...rejected,intent:'smalltalk'};
  const other={resolved:[],contributions:{},pitches:[]};
  assert.equal(evaluatePersuasion(npc,other,'I was hoping to hear more about you.',mild).hangup,false);
});
test('short relevant evidence and low-quality explanations can earn one benefit mark',()=>{
  const npc=NPCS[0],call={resolved:[],contributions:{},pitches:[]};
  const response={reply:'That sounds useful.',intent:'explanation',concernId:'usefulness',evidence:'repair your toaster',quality:1,objection:'How?',disposition:'considering',wantsToEnd:false,memory:[]};
  evaluatePersuasion(npc,call,'We will repair your toaster promptly.',response);
  assert.deepEqual(call.resolved,['usefulness']);
});
