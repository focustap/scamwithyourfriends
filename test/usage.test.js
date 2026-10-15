import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageLedger } from '../server/usage.js';
import { configFromEnv } from '../server/config.js';

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-call-usage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dataDir: dir, dailyTokens: 10000, dailyRequests: 3, ...options };
}
test('reservations survive restarts, settle actual usage, and reject overspend', t => {
  const config = fixture(t), ledger = new UsageLedger(config);
  const a = ledger.reserve(6000);
  assert.throws(() => ledger.reserve(5000), /budget/);
  const restarted = new UsageLedger(config);
  assert.equal(restarted.snapshot().tokens, 6000);
  restarted.settle(a, { input_tokens: 500, output_tokens: 50, total_tokens: 550 });
  assert.equal(restarted.snapshot().tokens, 550);
  assert.equal(restarted.snapshot().inputTokens, 500);
  restarted.reserve(4000); restarted.reserve(4000);
  assert.throws(() => restarted.reserve(1), /budget/);
  assert.equal(restarted.snapshot().requests, 3);
});
test('midnight settlement belongs to original UTC day', t => {
  let now = new Date('2026-10-15T23:59:59Z');
  const config = fixture(t), ledger = new UsageLedger(config, () => now);
  const reservation = ledger.reserve(5000);
  now = new Date('2026-10-16T00:00:01Z');
  ledger.settle(reservation, { input_tokens: 100, output_tokens: 20 });
  assert.equal(ledger.snapshot().tokens, 0);
  assert.equal(ledger.data.days['2026-10-15'].tokens, 120);
});
test('unknown usage stays reserved and corrupt storage fails closed', t => {
  const config = fixture(t), ledger = new UsageLedger(config);
  const reservation = ledger.reserve(6000);
  ledger.settle(reservation, undefined);
  assert.equal(new UsageLedger(config).snapshot().tokens, 6000);
  fs.writeFileSync(ledger.file, '{corrupt');
  assert.throws(() => new UsageLedger(config));
});
test('storage failure stops future reservations', t => {
  const config = fixture(t), ledger = new UsageLedger(config);
  fs.mkdirSync(ledger.file + '.tmp');
  assert.throws(() => ledger.reserve(1000));
  assert.throws(() => ledger.reserve(1000), /storage/);
});
test('production requires a private password and persistent AI storage', () => {
  assert.throws(() => configFromEnv({ NODE_ENV: 'production' }), /PASSWORD/);
  assert.throws(() => configFromEnv({ NODE_ENV: 'production', PRIVATE_GAME_PASSWORD: 'test', AI_ENABLED: 'true', OPENAI_API_KEY: 'test' }), /DATA_DIR/);
  assert.equal(configFromEnv({}).aiEnabled, false);
  assert.throws(() => configFromEnv({ ALLOWED_ORIGINS: '*' }));
  assert.throws(() => configFromEnv({ DAILY_REQUEST_LIMIT: '0' }));
});
