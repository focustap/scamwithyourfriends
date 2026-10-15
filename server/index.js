import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { configFromEnv } from './config.js';
import { Dialogue } from './ai.js';
import { Game } from './game.js';

export function createApp(config = configFromEnv(), overrides = {}) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = express(); app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'",'https://cdn.jsdelivr.net',"'wasm-unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'"],
    workerSrc:["'self'",'blob:'],
    connectSrc: ["'self'", ...config.origins, 'https:', 'wss:', ...(config.production ? [] : ['http:', 'ws:'])],
    upgradeInsecureRequests: config.production ? [] : null,
  } } }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  app.get('/config.js', (_req, res) => res.sendFile(path.join(root, 'config.js')));
  app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny' }));
  const http = createServer(app);
  const allowed = origin => !origin || config.origins.includes(origin);
  const io = new Server(http, { maxHttpBufferSize: 8192, cors: { origin: config.origins, methods: ['GET', 'POST'] },
    allowRequest: (req, done) => done(null, allowed(req.headers.origin)),
  });
  const dialogue = overrides.dialogue || new Dialogue(config, overrides.fetcher);
  const ledger = dialogue.ledger;
  const game = new Game(io, config, dialogue);
  void dialogue.refreshUsage();
  const attempts = new Map();
  io.use((socket, next) => {
    // Remote address cannot be spoofed via X-Forwarded-For. Render proxy sharing
    // this address may share the generous handshake ceiling; password remains primary.
    const ip = socket.handshake.address, now = Date.now();
    const bucket = attempts.get(ip) || { count: 0, expires: now + 60000 };
    if (bucket.expires <= now) { bucket.count = 0; bucket.expires = now + 60000; }
    bucket.count++; attempts.set(ip, bucket);
    if (bucket.count > 100 || io.engine.clientsCount > 100) return next(new Error('Too many connections. Try later.'));
    if (!allowed(socket.handshake.headers.origin)) return next(new Error('Origin not allowed'));
    const given = socket.handshake.auth?.password;
    const expected = Buffer.from(config.password);
    const actual = Buffer.from(typeof given === 'string' ? given.slice(0, 256) : '');
    if (expected.length && (expected.length !== actual.length || !timingSafeEqual(expected, actual))) return next(new Error('Incorrect private server password'));
    try { game.authenticate(socket, socket.handshake.auth?.token); next(); }
    catch (e) { next(new Error(e.message)); }
  });
  io.on('connection', socket => {
    const handlers = {
      'room:create': data => game.enter(socket, data, true), 'room:join': data => game.enter(socket, data, false),
      'room:sync': () => { const { room, player } = game.current(socket); return { state: game.snapshot(room), playerId: player.id }; },
      'room:leave': () => game.leave(socket), 'shift:start': () => game.start(socket), 'shift:end': () => game.end(socket),
      'call:dial': data => game.dial(socket, data), 'call:talk': data => game.talk(socket, data),
      'call:hangup': () => game.hangup(socket), 'call:deal': () => game.deal(socket), 'computer:answer': data => game.puzzle(socket, data),
      'computer:command': data => game.command(socket,data),
    };
    let recent = [];
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, async (data, ack) => {
      if (typeof ack !== 'function') return;
      recent = recent.filter(t => t > Date.now() - 10000);
      if (recent.length >= 30) return ack({ ok: false, error: 'Too many actions. Slow down.' });
      recent.push(Date.now());
      try {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid action');
        const result = await handler(data);
        ack({ ok: true, ...result });
      } catch (error) {
        // Deliberately avoid provider messages, stacks, prompts, or secrets in responses.
        const message = error instanceof Error && !/api.?key|sk-|Bearer|OpenAI/i.test(error.message) ? error.message : 'Action unavailable';
        ack({ ok: false, error: message.slice(0, 180) });
      }
    });
    socket.on('disconnect', () => { try { game.disconnect(socket); } catch { /* already left */ } });
  });
  let lastUsage = Date.now();
  const interval = setInterval(() => {
    game.tick(); const now = Date.now();
    if (now - lastUsage > 30000) { lastUsage = now; void dialogue.refreshUsage(); }
    for (const [ip, bucket] of attempts) if (bucket.expires <= now) attempts.delete(ip);
  }, 1000); interval.unref();
  return { app, http, io, game, ledger, async close() {
    clearInterval(interval);
    for (const room of game.rooms.values()) game.finish(room);
    await new Promise(resolve => io.close(resolve));
  } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = configFromEnv();
  const server = createApp(config);
  server.http.listen(config.port, '0.0.0.0', () => console.log(`Cold Call Chaos listening on ${config.port}; AI ${config.aiEnabled ? 'enabled' : 'disabled'}`));
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, async () => { await server.close(); process.exit(0); });
}
