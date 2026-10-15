import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// One process owns this ledger. Reservations are persisted BEFORE a billable request.
// An ambiguous failure or process crash keeps the full reservation charged.
export class UsageLedger {
  constructor(config, now = () => new Date()) {
    this.config = config;
    this.now = now;
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.file = path.join(config.dataDir, 'usage.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, days: {} };
    if (this.data.version !== 1 || !this.data.days || typeof this.data.days !== 'object') throw new Error('Invalid usage ledger; refusing to enable spending');
    for (const day of Object.values(this.data.days)) {
      if (!['tokens', 'requests', 'inputTokens', 'outputTokens'].every(k => Number.isSafeInteger(day[k]) && day[k] >= 0) || !day.pending || typeof day.pending !== 'object') throw new Error('Corrupt usage ledger');
    }
    this.failed = false;
  }
  dayKey() { return this.now().toISOString().slice(0, 10); }
  day(key = this.dayKey()) {
    return this.data.days[key] ??= { tokens: 0, requests: 0, inputTokens: 0, outputTokens: 0, pending: {} };
  }
  persist() {
    try {
      const temp = `${this.file}.tmp`;
      const fd = fs.openSync(temp, 'w', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(this.data)); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.file);
    } catch (error) { this.failed = true; throw error; }
  }
  reserve(tokens) {
    if (this.failed) throw new Error('Usage storage unavailable; AI paused');
    const key = this.dayKey(), day = this.day(key);
    if (day.tokens + tokens > this.config.dailyTokens || day.requests >= this.config.dailyRequests) throw new Error('Daily AI budget reached; local dialogue enabled');
    const id = randomUUID();
    day.tokens += tokens;
    day.requests++;
    day.pending[id] = tokens;
    this.persist();
    return { id, key };
  }
  settle(reservation, usage) {
    const day = this.day(reservation.key), reserved = day.pending[reservation.id];
    if (!reserved) return;
    const input = usage?.input_tokens, output = usage?.output_tokens;
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) return;
    const total = usage.total_tokens ?? (input + output);
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(input + output)) return;
    const actual = Math.max(input + output, total);
    day.tokens += actual - reserved;
    day.inputTokens += input;
    day.outputTokens += output;
    delete day.pending[reservation.id];
    if (actual > reserved) this.failed = true;
    this.persist();
  }
  snapshot() {
    const day = this.day();
    return { date: this.dayKey(), tokens: day.tokens, requests: day.requests, inputTokens: day.inputTokens,
      outputTokens: day.outputTokens, reservedRequests: Object.keys(day.pending).length,
      tokenLimit: this.config.dailyTokens, requestLimit: this.config.dailyRequests,
      blocked: this.failed || day.tokens >= this.config.dailyTokens || day.requests >= this.config.dailyRequests };
  }
}
