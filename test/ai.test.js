import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Dialogue } from '../server/ai.js';
import { UsageLedger } from '../server/usage.js';
import { NPCS } from '../assets/npcs.js';

const call = () => ({ trust: 30, susp: 20, turns: 2, preoccupation: 'unionized fridge', history: [
  { who: 'bot', text: 'Who is this?' }, { who: 'me', text: 'Please tell me about your toaster.' },
] });
function fixture(t, create, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-call-ai-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = { aiEnabled: true, model: 'gpt-6-luna', outputTokens: 220, dailyTokens: 50000, dailyRequests: 100, dataDir: dir, ...options };
  const ledger = new UsageLedger(config);
  return { dialogue: new Dialogue(config, ledger, { responses: { create } }), ledger };
}
test('Responses uses requested model, bounded history, no storage, short no-reasoning JSON', async t => {
  let request;
  const { dialogue, ledger } = fixture(t, async args => {
    request = args;
    return { status: 'completed', output_text: JSON.stringify({ reply: 'Earl says the toaster needs a union.', trustDelta: 999, suspicionDelta: -999, hangup: false }), usage: { input_tokens: 900, output_tokens: 80, total_tokens: 980 } };
  });
  const result = await dialogue.reply(NPCS[0], call(), 'Please tell me about your toaster.');
  assert.equal(request.model, 'gpt-6-luna'); assert.equal(request.store, false);
  assert.equal(request.reasoning.effort, 'none'); assert.equal(request.max_output_tokens, 220);
  assert.equal(request.text.format.strict, true); assert.equal(request.input.length, 2);
  assert.equal(result.trustDelta, 16); assert.equal(result.suspicionDelta, -12);
  assert.equal(result.mode, 'GPT-6 Luna'); assert.equal(ledger.snapshot().tokens, 980);
});
test('API failures do not retry, retain reservation and activate cooldown', async t => {
  let count = 0;
  const { dialogue, ledger } = fixture(t, async () => { count++; throw new Error('provider secret must stay private'); });
  const first = await dialogue.reply(NPCS[0], call(), 'hello there friend');
  assert.match(first.mode, /unavailable/); assert.doesNotMatch(JSON.stringify(first), /secret/);
  assert.equal(ledger.snapshot().reservedRequests, 1);
  await dialogue.reply(NPCS[0], call(), 'hello there friend');
  assert.equal(count, 1);
});
test('disabled AI and exhausted daily budget make zero provider calls', async t => {
  let count = 0;
  const { dialogue, ledger } = fixture(t, async () => { count++; }, { aiEnabled: false });
  assert.match((await dialogue.reply(NPCS[0], call(), 'hello friend')).mode, /disabled/);
  dialogue.config.aiEnabled = true;
  ledger.config.dailyTokens = 1;
  assert.match((await dialogue.reply(NPCS[0], call(), 'hello friend')).mode, /budget/);
  assert.equal(count, 0);
});
test('malformed or incomplete output falls back without breaking a call', async t => {
  const { dialogue } = fixture(t, async () => ({ status: 'completed', output_text: '{invalid', usage: { input_tokens: 50, output_tokens: 20 } }));
  const result = await dialogue.reply(NPCS[0], call(), 'hello friend');
  assert.match(result.mode, /Local dialogue/); assert.ok(result.reply);
});
test('global concurrency cap prevents extra billable requests', async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let count = 0;
  const { dialogue } = fixture(t, async () => { count++; await wait; return { status: 'completed', output_text: JSON.stringify({ reply: 'Hello', trustDelta: 1, suspicionDelta: 0, hangup: false }), usage: { input_tokens: 10, output_tokens: 10 } }; });
  const first = dialogue.reply(NPCS[0], call(), 'hello friend'), second = dialogue.reply(NPCS[1], call(), 'hello friend');
  assert.match((await dialogue.reply(NPCS[2], call(), 'hello friend')).mode, /cooling down/);
  assert.equal(count, 2); release(); await Promise.all([first, second]);
});
