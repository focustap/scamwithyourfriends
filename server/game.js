import { randomBytes, randomInt } from 'node:crypto';
import { NPCS } from '../assets/npcs.js';

const clamp = n => Math.max(0, Math.min(100, n));
const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const pick = a => a[randomInt(a.length)];
const preoccupations = ['a goose has taken over the driveway', 'the printer is demanding paid leave', 'a neighbor is hosting competitive soup', 'the fridge has joined a union'];
const events = [
  { text: 'Casual Friday: customers are 4% more trusting of pantsless corporations.', trust: 4 },
  { text: 'The office goose ate a coupon. Management adds $100 to the quota.', quota: 100 },
  { text: 'The printer accidentally printed money. Fictional petty cash: +$50.', cash: 50 },
  { text: 'Mandatory hold music has been replaced with a kazoo solo. Suspicion +4.', suspicion: 4 },
];

export class Game {
  constructor(io, config, dialogue) {
    this.io = io; this.config = config; this.dialogue = dialogue;
    this.rooms = new Map(); this.sessions = new Map();
  }
  authenticate(socket, token) {
    if (!token) return;
    const session = this.sessions.get(token), room = session && this.rooms.get(session.code), player = room?.players.get(session.id);
    if (!player || player.socketId || player.disconnectedAt + this.config.reconnectMs < Date.now()) throw new Error('Session expired or already connected. Join again.');
    player.socketId = socket.id; player.disconnectedAt = null;
    socket.data.player = { code: room.code, id: player.id }; socket.join(room.code);
    this.broadcast(room);
  }
  current(socket) {
    const { code, id } = socket.data.player || {};
    const room = this.rooms.get(code), player = room?.players.get(id);
    if (!player || player.socketId !== socket.id) throw new Error('Join a room first');
    return { room, player };
  }
  enter(socket, data, create) {
    if (socket.data.player) throw new Error('Leave your current room first');
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 24) throw new Error('Choose a name up to 24 characters');
    let room;
    if (create) {
      if (this.rooms.size >= this.config.maxRooms) throw new Error('Office full. Try later.');
      let roomCode; do { roomCode = code(); } while (this.rooms.has(roomCode));
      room = { code: roomCode, host: null, players: new Map(), phase: 'lobby', shift: 0, earned: 0, quota: 1500,
        calls: 0, wins: 0, used: [], results: [], event: 'Welcome. Your benefits package is a stapler.', updatedAt: Date.now() };
      this.rooms.set(room.code, room);
    } else {
      if (typeof data.code !== 'string' || !/^[A-Z2-9]{6}$/.test(data.code)) throw new Error('Enter a six-character room code');
      room = this.rooms.get(data.code);
      if (!room) throw new Error('Room not found');
      if (room.phase === 'playing') throw new Error('Shift underway. Wait for the next shift.');
      if (room.players.size >= 4) throw new Error('Room full (four desks maximum)');
    }
    const id = randomBytes(12).toString('hex'), token = randomBytes(32).toString('hex');
    const player = { id, name: data.name.trim(), token, socketId: socket.id, disconnectedAt: null, call: null, earned: 0, requestTimes: [] };
    room.players.set(id, player); if (!room.host) room.host = id;
    this.sessions.set(token, { code: room.code, id });
    socket.data.player = { code: room.code, id }; socket.join(room.code);
    this.broadcast(room);
    return { token, playerId: id, code: room.code };
  }
  start(socket) {
    const { room, player } = this.current(socket);
    if (room.host !== player.id) throw new Error('Only the host can start a shift');
    if (room.phase === 'playing') throw new Error('Shift already started');
    if ([...room.players.values()].filter(p => p.socketId).length < 2) throw new Error('Two connected players are required');
    room.shift++; room.phase = 'playing'; room.earned = 0;
    room.quota = Math.min(2500, 1500 + (room.players.size - 2) * 350 + (room.shift - 1) * 250);
    room.endsAt = Date.now() + this.config.shiftSeconds * 1000; room.nextEvent = Date.now() + 35000;
    room.calls = 0; room.wins = 0; room.used = []; room.results = []; room.event = 'The shift is live. Make the imaginary economy worse.';
    for (const p of room.players.values()) { p.call = null; p.earned = 0; }
    this.broadcast(room);
  }
  playing(room) {
    if (room.phase !== 'playing') throw new Error('Start a shift first');
    if (Date.now() >= room.endsAt) { this.finish(room); throw new Error('Shift complete'); }
  }
  dial(socket, data) {
    const { room, player } = this.current(socket); this.playing(room);
    const npc = NPCS.find(n => n.id === data.npcId);
    if (!npc || player.call || room.used.includes(npc.id) || [...room.players.values()].some(p => p.call?.npcId === npc.id)) throw new Error('That line is unavailable');
    player.call = { id: randomBytes(8).toString('hex'), npcId: npc.id, trust: npc.trust, susp: npc.susp, turns: 0,
      busy: false, history: [{ who: 'bot', text: pick(npc.greet) }], preoccupation: pick(preoccupations), mode: this.config.aiEnabled ? 'GPT-6 Luna ready' : 'Local dialogue • AI disabled',
      computer: this.computer(), requestTimes: [] };
    room.calls++; this.broadcast(room);
  }
  computer() {
    const sequence = ['ANTENNA', 'KAZOO', 'TOASTER'];
    for (let i = sequence.length - 1; i > 0; i--) { const j = randomInt(i + 1); [sequence[i], sequence[j]] = [sequence[j], sequence[i]]; }
    return { stage: 'wires', sequence, progress: 0, invoice: randomInt(100, 999), completed: false, attempts: 0, lockedUntil: 0 };
  }
  async talk(socket, data) {
    const { room, player } = this.current(socket); this.playing(room);
    const call = player.call;
    if (!call || call.busy) throw new Error('Wait for your customer to finish');
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 500) throw new Error('Say 1–500 characters');
    const now = Date.now();
    player.requestTimes = player.requestTimes.filter(t => t > now - 60000);
    room.requestTimes = (room.requestTimes || []).filter(t => t > now - 60000);
    if (player.requestTimes.length >= 6 || room.requestTimes.length >= 16 || now - (call.lastTurn || 0) < 1200) throw new Error('Take a breath. Try again in a few seconds.');
    if (call.turns >= 12) throw new Error('Customer has reached the turn limit. Close the deal or hang up.');
    player.requestTimes.push(now); room.requestTimes.push(now); call.lastTurn = now;
    call.busy = true; call.turns++; call.history.push({ who: 'me', text: data.text.trim() });
    const controller = new AbortController(); call.controller = controller;
    this.broadcast(room);
    const npc = NPCS.find(n => n.id === call.npcId);
    try {
      const result = await this.dialogue.reply(npc, call, data.text.trim(), room.event, controller.signal);
      // A late response cannot resurrect a call, pay out, or alter another shift.
      if (room.phase !== 'playing' || player.call !== call || Date.now() >= room.endsAt) return;
      call.trust = clamp(call.trust + result.trustDelta); call.susp = clamp(call.susp + result.suspicionDelta); call.mode = result.mode;
      call.history.push({ who: 'bot', text: result.reply });
      this.io.to(player.socketId).emit('npc:speak', { callId: call.id, npcId: npc.id, text: result.reply });
      if (result.hangup || call.susp >= 90 || call.turns >= 12) this.close(room, player, false, 'Customer hung up.');
    } finally { call.busy = false; delete call.controller; this.broadcast(room); }
  }
  puzzle(socket, data) {
    const { room, player } = this.current(socket); this.playing(room);
    const target = room.players.get(data.playerId || player.id), call = target?.call;
    if (!call) throw new Error('No customer computer connected');
    const pc = call.computer;
    if (pc.completed) throw new Error('Computer already verified');
    if (Date.now() < pc.lockedUntil) throw new Error('Computer is rebooting. Wait three seconds.');
    if (pc.stage === 'wires') {
      if (data.answer === pc.sequence[pc.progress]) pc.progress++;
      else { pc.progress = 0; pc.attempts++; pc.lockedUntil = Date.now() + 3000; call.susp = clamp(call.susp + 3); }
      if (pc.progress === 3) pc.stage = 'invoice';
    } else if (pc.stage === 'invoice') {
      if (String(data.answer) === String(pc.invoice)) {
        pc.completed = true; pc.stage = 'done'; call.trust = clamp(call.trust + 15); call.susp = clamp(call.susp - 8);
        call.history.push({ who: 'system', text: `${player.name} fixed the customer computer. Trust +15.` });
      } else { pc.attempts++; pc.lockedUntil = Date.now() + 3000; call.susp = clamp(call.susp + 3); }
    }
    this.broadcast(room);
  }
  deal(socket) {
    const { room, player } = this.current(socket); this.playing(room);
    const call = player.call;
    if (!call || call.busy) throw new Error('Wait for the customer');
    if (call.trust < 65 || call.susp >= 60 || call.turns < 2 || !call.computer.completed) throw new Error('Need trust ≥65, suspicion <60, two turns, and a verified computer');
    this.close(room, player, true, 'Sale approved'); this.broadcast(room);
  }
  close(room, player, win, reason) {
    const call = player.call; if (!call) return;
    call.controller?.abort();
    const npc = NPCS.find(n => n.id === call.npcId);
    if (win) {
      room.earned += npc.value; room.wins++; player.earned += npc.value;
      this.io.to(player.socketId).emit('npc:speak', { callId: call.id, npcId: npc.id, text: npc.success, final: true });
    }
    room.used.push(npc.id); room.results.unshift({ name: npc.name, product: npc.offer, player: player.name, win, value: win ? npc.value : 0, reason });
    room.results = room.results.slice(0, 30); player.call = null;
    if (room.used.length === NPCS.length) this.finish(room);
  }
  hangup(socket) {
    const { room, player } = this.current(socket); this.playing(room);
    this.close(room, player, false, 'Desk ended call'); this.broadcast(room);
  }
  finish(room) {
    if (room.phase !== 'playing') return;
    room.phase = 'finished';
    for (const p of room.players.values()) { p.call?.controller?.abort(); p.call = null; }
    this.broadcast(room);
  }
  end(socket) {
    const { room, player } = this.current(socket);
    if (room.host !== player.id) throw new Error('Only the host can end the shift');
    this.finish(room);
  }
  leave(socket) {
    const { room, player } = this.current(socket);
    this.remove(room, player); socket.leave(room.code); delete socket.data.player;
    this.broadcast(room);
  }
  disconnect(socket) {
    if (!socket.data.player) return;
    const { room, player } = this.current(socket);
    player.socketId = null; player.disconnectedAt = Date.now();
    player.call?.controller?.abort(); this.broadcast(room);
  }
  remove(room, player) {
    if (player.call) this.close(room, player, false, 'Desk disconnected');
    this.sessions.delete(player.token); room.players.delete(player.id);
    if (room.host === player.id) room.host = [...room.players.values()].find(p => p.socketId)?.id || room.players.keys().next().value;
    if (!room.players.size) this.rooms.delete(room.code);
  }
  tick(now = Date.now()) {
    for (const room of this.rooms.values()) {
      let removed = false;
      for (const p of room.players.values()) if (!p.socketId && now - p.disconnectedAt >= this.config.reconnectMs) { this.remove(room, p); removed = true; }
      if (removed) this.broadcast(room);
      if (room.phase === 'playing') {
        if (now >= room.endsAt) this.finish(room);
        else if (now >= room.nextEvent) {
          const event = pick(events); room.event = event.text; room.nextEvent = now + 35000;
          room.quota += event.quota || 0; room.earned += event.cash || 0;
          for (const p of room.players.values()) if (p.call) { p.call.trust = clamp(p.call.trust + (event.trust || 0)); p.call.susp = clamp(p.call.susp + (event.suspicion || 0)); }
          this.broadcast(room);
        }
      }
      // Reap idle lobbies, even if someone left a tab open all day.
      if (room.phase !== 'playing' && now - room.updatedAt > 3600000) {
        for (const p of [...room.players.values()]) { const socket = this.io.sockets.sockets.get(p.socketId); if (socket) { socket.leave(room.code); delete socket.data.player; socket.emit('room:expired'); } this.remove(room, p); }
      }
    }
  }
  snapshot(room) {
    return { code: room.code, host: room.host, phase: room.phase, shift: room.shift, earned: room.earned, quota: room.quota,
      calls: room.calls, wins: room.wins, endsAt: room.endsAt || null, serverTime: Date.now(), used: room.used, results: room.results,
      event: room.event, aiEnabled: this.config.aiEnabled, usage: this.dialogue.ledger.snapshot(),
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, connected: !!p.socketId, earned: p.earned,
        call: p.call ? Object.fromEntries(Object.entries(p.call).filter(([k]) => !['controller', 'requestTimes', 'lastTurn'].includes(k))) : null })) };
  }
  broadcast(room) { room.updatedAt = Date.now(); this.io.to(room.code).emit('room:state', this.snapshot(room)); }
}
