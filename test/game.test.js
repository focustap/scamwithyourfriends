import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createApp } from '../server/index.js';
import { configFromEnv } from '../server/config.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (s, event, data = {}) => s.timeout(5000).emitWithAck(event, data);
async function fixture(t, overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-call-game-'));
  const server = createApp({ ...configFromEnv({}), port: 0, dataDir, password: 'private-test', ...overrides });
  server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const url = 'http://127.0.0.1:' + server.http.address().port, clients = [];
  t.after(async () => { clients.forEach(s => s.disconnect()); await server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function client(auth = {}, extra = {}) {
    const s = io(url, { forceNew: true, reconnection: false, auth: { password: 'private-test', ...auth }, ...extra }); clients.push(s);
    await once(s, 'connect'); return s;
  }
  return { server, url, client, clients };
}
test('2–4 players, isolated rooms, host controls, locked lines, cooperative puzzles, synchronized payout', async t => {
  const { client,server } = await fixture(t);
  const [a, b, c, d, fifth] = await Promise.all(Array.from({ length: 5 }, () => client()));
  const created = await emit(a, 'room:create', { name: 'Host' }); assert.equal(created.ok, true);
  assert.equal((await emit(a, 'shift:start')).ok, true);
  await emit(a,'shift:end');
  for (const [i, s] of [b, c, d].entries()) assert.equal((await emit(s, 'room:join', { name: 'Desk ' + i, code: created.code })).ok, true);
  assert.equal((await emit(fifth, 'room:join', { name: 'Extra', code: created.code })).ok, false);
  const other = await emit(fifth, 'room:create', { name: 'Other room' });
  assert.equal((await emit(b, 'shift:start')).ok, false);
  assert.equal((await emit(a, 'shift:start')).ok, true);
  assert.equal((await emit(a, 'call:dial', { npcId: 'doug' })).ok, true);
  assert.equal((await emit(b, 'call:dial', { npcId: 'doug' })).ok, false);
  assert.equal((await emit(b, 'call:dial', { npcId: 'mildred' })).ok, true);
  server.game.dealRoll=()=>100;
  const reckless=await emit(a,'call:deal',{earned:999999,trust:100});
  assert.equal(reckless.ok,true); assert.equal(reckless.closed,false);
  const before = (await emit(a, 'room:sync')).state;
  const pc = before.players.find(p => p.id === created.playerId).call.computer;
  assert.equal((await emit(c,'computer:answer',{ playerId:created.playerId,answer:pc.sequence[0] })).ok,false);
  await emit(c,'computer:command',{ playerId:created.playerId,command:'scan' });
  await emit(c,'computer:command',{ playerId:created.playerId,command:'repair ' + pc.fault });
  for (const answer of pc.sequence) assert.equal((await emit(c, 'computer:answer', { playerId: created.playerId, answer })).ok, true);
  assert.equal((await emit(c, 'computer:answer', { playerId: created.playerId, answer: pc.invoice })).ok, true);
  assert.equal((await emit(c, 'computer:answer', { playerId: created.playerId, answer: pc.invoice })).ok, false);
  assert.equal((await emit(a, 'call:talk', { text: 'The price is forty imaginary dollars with no recurring bill.' })).ok, true);
  assert.equal((await emit(a, 'call:talk', { text: 'This should be rate limited.' })).ok, false);
  await pause(1250);
  assert.equal((await emit(a, 'call:talk', { text: 'The antenna detects squirrels near the seven lawn flamingos.' })).ok, true);
  await pause(1250);
  assert.equal((await emit(a,'call:talk',{ text:'We can test this fictional device, and I cannot guarantee real results.' })).ok,true);
  server.game.dealRoll=()=>1;
  const closing=await emit(a,'call:deal'); assert.equal(closing.ok,true); assert.equal(closing.closed,true);
  assert.equal((await emit(a, 'call:deal')).ok, false);
  const shared = (await emit(b, 'room:sync')).state;
  assert.equal(shared.earned, 140); assert.equal(shared.wins, 1); assert.equal(shared.calls, 2);
  assert.equal(shared.players.length, 4); assert.equal(shared.endsAt, before.endsAt);
  assert.equal(JSON.stringify(shared).includes(created.token), false);
  const isolated = (await emit(fifth, 'room:sync')).state;
  assert.equal(isolated.code, other.code); assert.equal(isolated.earned, 0); assert.equal(isolated.phase, 'lobby');
});
test('session resumes within grace, rejects hijack, transfers host after expiry', async t => {
  const { client, server } = await fixture(t);
  const a = await client(), b = await client();
  const host = await emit(a, 'room:create', { name: 'Host' });
  const guest = await emit(b, 'room:join', { name: 'Guest', code: host.code });
  const attacker = io(a.io.uri, { reconnection: false, auth: { password: 'private-test', token: host.token } });
  const [error] = await once(attacker, 'connect_error'); assert.match(error.message, /already connected/); attacker.disconnect();
  a.disconnect(); await pause(30);
  const resumed = await client({ token: host.token });
  assert.equal((await emit(resumed, 'room:sync')).playerId, host.playerId);
  resumed.disconnect(); await pause(30);
  server.game.tick(Date.now() + 46000);
  const state = (await emit(b, 'room:sync')).state;
  assert.equal(state.host, guest.playerId); assert.equal(state.players.length, 1);
});
test('password and WebSocket origin checks; server files and secrets never served', async t => {
  const { url, clients } = await fixture(t);
  for (const options of [ { auth: { password: 'wrong' } }, { auth: { password: 'private-test' }, transports: ['websocket'], extraHeaders: { Origin: 'https://evil.example' } } ]) {
    const socket = io(url, { reconnection: false, timeout: 1500, ...options }); clients.push(socket);
    const [error] = await once(socket, 'connect_error'); assert.ok(error); socket.disconnect();
  }
  for (const p of ['/.env', '/server/index.js', '/data/usage.json', '/package.json']) assert.equal((await fetch(url + p)).status, 404);
  assert.equal((await fetch(url + '/health')).status, 200);
  assert.equal((await fetch(url + '/assets/app.js')).status, 200);
});
test('late AI results cannot pay out or alter a completed shift', async t => {
  const { client, server } = await fixture(t);
  const a = await client(), b = await client();
  const host = await emit(a, 'room:create', { name: 'Host' });
  await emit(b, 'room:join', { name: 'Guest', code: host.code }); await emit(a, 'shift:start');
  await emit(a, 'call:dial', { npcId: 'doug' });
  let resolve;
  server.game.dialogue.reply = () => new Promise(r => { resolve = r; });
  const turn = emit(a, 'call:talk', { text: 'hello strange fictional friend' });
  await pause(30); await emit(a, 'shift:end');
  resolve({ reply: 'Deal!', trustDelta: 100, suspicionDelta: -100, mode: 'test', hangup: false }); await turn;
  const state = (await emit(b, 'room:sync')).state;
  assert.equal(state.phase, 'finished'); assert.equal(state.earned, 0); assert.equal(state.players[0].call, null);
  await emit(a, 'shift:start'); assert.equal((await emit(b, 'room:sync')).state.shift, 2);
});

test('random events synchronize and the server clock ends expired calls', async t => {
  const { client, server } = await fixture(t);
  const a = await client(), b = await client();
  const host = await emit(a, 'room:create', { name: 'Host' });
  await emit(b, 'room:join', { name: 'Guest', code: host.code }); await emit(a, 'shift:start');
  await emit(a, 'call:dial', { npcId: 'doug' });
  const internal = server.game.rooms.get(host.code), initial = internal.event;
  internal.nextEvent = Date.now() - 1; server.game.tick();
  const first = (await emit(a, 'room:sync')).state, second = (await emit(b, 'room:sync')).state;
  assert.notEqual(first.event, initial); assert.equal(first.event, second.event);
  assert.equal(first.quota, second.quota); assert.equal(first.earned, second.earned);
  internal.endsAt = Date.now() - 1;
  assert.equal((await emit(a, 'call:talk', { text: 'A late pitch should not get through.' })).ok, false);
  assert.equal((await emit(b, 'room:sync')).state.phase, 'finished');
  assert.equal((await emit(a, 'room:sync')).state.players[0].call, null);
});

test('rejected AI turn grants no trust, emits no canned reply, and shows an explicit error',async t => {
  const { client,server } = await fixture(t);
  const a = await client(),b = await client();
  const host = await emit(a,'room:create',{ name:'Host' });
  await emit(b,'room:join',{ name:'Guest',code:host.code }); await emit(a,'shift:start');
  await emit(a,'call:dial',{ npcId:'doug' });
  const speech = []; a.on('npc:speak',m => speech.push(m));
  server.game.dialogue.reply = async () => { throw new Error('Daily AI budget reached. No model reply was generated.'); };
  const reply = await emit(a,'call:talk',{ text:'Please explain the imaginary price.' });
  assert.equal(reply.ok,false); assert.match(reply.error,/budget/);
  const state = (await emit(a,'room:sync')).state,c = state.players[0].call;
  assert.equal(c.trust,34); assert.equal(c.turns,0); assert.equal(state.earned,0); assert.equal(speech.length,0);
  assert.match(c.mode,/AI unavailable/); assert.equal(c.history.some(m => m.who === 'bot'),false);
});

test('price quotations are contextual and bounded by fictional deal rules', async () => {
  const { parseOffer, priceRange } = await import('../server/pricing.js');
  assert.equal(parseOffer('100 dollars?'),100);
  assert.equal(parseOffer('What if I make it $115?'),115);
  assert.equal(parseOffer('I can do 90 bucks'),90);
  assert.equal(parseOffer('I have 12 flamingos'),null);
  assert.equal(parseOffer('300?'),300);
  assert.deepEqual(priceRange(150),{ min:75,max:300 });
});
test('shared upgrades and fictional SSD and wallet rewards are verified by server',async t => {
  const { client,server } = await fixture(t);
  const a=await client(), b=await client(), host=await emit(a,'room:create',{ name:'Agent' });
  await emit(b,'room:join',{ name:'Tech',code:host.code });
  const room=server.game.rooms.get(host.code);
  room.credits=250; await emit(a,'shift:start');
  assert.equal((await emit(a,'store:buy',{ id:'wallet' })).ok,false);
  assert.equal((await emit(a,'store:buy',{ id:'ssd' })).ok,true);
  assert.equal((await emit(b,'store:buy',{ id:'ssd' })).ok,false);
  assert.equal((await emit(b,'store:buy',{ id:'wallet' })).ok,true);
  assert.equal(room.credits,10);
  await emit(a,'call:dial',{ npcId:'mildred' });
  const call=room.players.get(host.playerId).call;
  const ssd=call.loot.ssdPin,wallet=call.loot.walletPin;
  let state=(await emit(a,'room:sync')).state;
  assert.equal(JSON.stringify(state).includes('"ssdPin"'),false);
  assert.equal((await emit(b,'loot:extract',{ playerId:host.playerId,kind:'ssd',answer:ssd })).ok,false);
  call.computer.completed=true;
  assert.equal((await emit(b,'loot:extract',{ playerId:host.playerId,kind:'wallet',answer:wallet })).ok,false);
  assert.equal((await emit(b,'loot:extract',{ playerId:host.playerId,kind:'ssd',answer:ssd })).ok,true);
  assert.equal((await emit(b,'loot:extract',{ playerId:host.playerId,kind:'ssd',answer:ssd })).ok,false);
  assert.equal((await emit(b,'loot:extract',{ playerId:host.playerId,kind:'wallet',answer:wallet })).ok,true);
  state=(await emit(a,'room:sync')).state;
  assert.equal(state.earned,105);
  assert.equal(state.credits,115);
  assert.equal(state.lootResults.length,2);
});

test('negotiated sale pays the quoted price, not the NPC sticker price',async t => {
  const { client,server } = await fixture(t);
  const a=await client(),b=await client(),host=await emit(a,'room:create',{name:'Agent'});
  await emit(b,'room:join',{ name:'Assistant',code:host.code });
  await emit(a,'shift:start');
  await emit(a,'call:dial',{npcId:'mildred'});
  const call=server.game.rooms.get(host.code).players.get(host.playerId).call;
  call.trust=80;call.susp=0;call.turns=3;call.resolved=['cost','usefulness'];call.ready=true;call.computer.completed=true;
  call.offerPrice=1;
  assert.equal((await emit(a,'call:deal')).ok,false);
  call.offerPrice=100;
  server.game.dealRoll=()=>1;
  assert.equal((await emit(a,'call:deal')).closed,true);
  const state=(await emit(a,'room:sync')).state;
  assert.equal(state.earned,100);
  assert.equal(state.credits,100);
  assert.equal(state.results[0].value,100);
});

test('solo start, optional repairs, chance-based close and anti-spam', async t => {
  const { client,server }=await fixture(t);
  const a=await client(),host=await emit(a,'room:create',{name:'Solo'});
  assert.equal((await emit(a,'shift:start')).ok,true);
  let state=(await emit(a,'room:sync')).state;
  assert.equal(state.quota,230);
  assert.equal((await emit(a,'call:dial',{npcId:'mildred'})).ok,true);
  const room=server.game.rooms.get(host.code), call=room.players.get(host.playerId).call;
  assert.equal(call.computer.completed,false);
  assert.equal(call.resolved.length,0);
  state=(await emit(a,'room:sync')).state;
  const starting=state.players[0].call.closeChance;
  assert.ok(starting >= 3 && starting < 35);
  assert.equal(state.players[0].call.canClose,true);
  server.game.dealRoll=()=>100;
  const first=await emit(a,'call:deal');
  assert.equal(first.ok,true); assert.equal(first.closed,false);
  assert.equal(first.chance,starting);
  assert.equal(call.trust,23); assert.equal(call.susp,36);
  assert.equal((await emit(a,'call:deal')).ok,false);
  assert.equal(room.earned,0);
  await emit(a,'call:talk',{ text:'Your total is $150, with no extra charges or renewals.' });
  assert.equal(call.turns,1);
  assert.equal((await emit(a,'room:sync')).state.players[0].call.canClose,true);
  server.game.dealRoll=()=>1;
  const second=await emit(a,'call:deal');
  assert.equal(second.closed,true);
  assert.equal(room.earned,150);
  assert.equal(room.wins,1);
});
test('three failed closes end the call with no payout or extra AI requests',async t=>{
  const {client,server}=await fixture(t);
  const a=await client(),host=await emit(a,'room:create',{name:'Closer'});
  await emit(a,'shift:start'); await emit(a,'call:dial',{npcId:'doug'});
  const room=server.game.rooms.get(host.code);
  server.game.dealRoll=()=>100;
  assert.equal((await emit(a,'call:deal')).closed,false);
  for(let i=0;i<2;i++){
    await emit(a,'call:talk',{text:'I can offer you this product for $140, with clear terms. Message '+i});
    const result=await emit(a,'call:deal');
    assert.equal(result.closed,false);
  }
  assert.equal(room.players.get(host.playerId).call,null);
  assert.equal(room.earned,0);
  assert.equal(room.results[0].reason,'Three failed close attempts');
});
test('closing chance increases with trust, marks, agreement and optional repair',async()=>{
  const {closingChance}=await import('../server/deals.js');
  const {NPCS}=await import('../assets/npcs.js');
  const n=NPCS[0],low={trust:27,susp:28,turns:0,offerPrice:150,resolved:[],ready:false,computer:{completed:false}};
  const high={...low,trust:85,susp:3,turns:4,offerPrice:110,resolved:['cost','usefulness','credibility'],ready:true};
  assert.ok(closingChance(n,low)<closingChance(n,high));
  const repaired={...high,computer:{completed:true}};
  assert.ok(closingChance(n,repaired)>=closingChance(n,high));
  assert.equal(closingChance(n,{...low,offerPrice:1}),0);
});
