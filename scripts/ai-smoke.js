// Run locally with private Node .env values, never inside the browser.
import 'dotenv/config';
import { configFromEnv } from '../server/config.js';
import { Dialogue } from '../server/ai.js';
import { NPCS } from '../assets/npcs.js';
const args = process.argv.slice(2);
if (args.length !== 1 || !['--status','--auth-probe','--mock-once','--live-once'].includes(args[0])) {
  console.error('Usage: node scripts/ai-smoke.js --status | --auth-probe | --mock-once | --live-once'); process.exit(1);
}
try {
  const config = configFromEnv({ ...process.env,AI_ENABLED:'true' });
  if (args[0] === '--auth-probe') {
    for (const [headers,expected] of [[{ Authorization:'Bearer intentionally-invalid-test-token' },401],
      [{ Authorization:'Bearer ' + config.gameServerToken,Origin:'https://example.invalid' },403]]) {
      const response = await fetch(config.functionUrl,{ method:'POST',redirect:'error',headers:{ 'Content-Type':'application/json',...headers },body:JSON.stringify({ action:'status' }),signal:AbortSignal.timeout(30000) });
      if (response.status !== expected) throw new Error(`Authorization probe returned ${response.status}; expected ${expected}. Do not enable live mode.`);
    }
    console.log('PASS: wrong token rejected (401); browser origin rejected (403). No model request.');
  } else {
    const dialogue = new Dialogue(config); await dialogue.refreshUsage();
    const before = dialogue.ledger.snapshot();
    if (!before.available) throw new Error('Accounting unavailable; check deployment and private server configuration.');
    console.log('Usage before:',JSON.stringify(before));
    if (args[0] !== '--status') {
      const mode = args[0] === '--live-once' ? 'live' : 'mock';
      if (before.mode !== mode || before.blocked || before.requestLimit !== 1 || before.requests !== 0 || before.tokenLimit > 50000) throw new Error('Smoke call requires the expected mode, an open budget, daily_requests=1, zero requests in that mode today, and daily_tokens<=50000.');
      const words = 'Before I pitch invisible lawn security, what is worrying you about your flamingos?';
      const result = await dialogue.reply(NPCS[1],{ trust:34,susp:17,preoccupation:'a goose has taken over the driveway',history:[{ who:'me',text:words }],memory:[],turns:1 },words,'Office open');
      if (mode === 'live' && result.mode !== 'GPT-5.6 Terra') throw new Error('Expected a real model reply. Stop and inspect the configuration.');
      if (mode === 'mock' && !result.mode.includes('mock')) throw new Error('Expected a mock reply.');
      console.log('Reply mode:',result.mode); console.log('NPC:',result.reply);
      console.log('Usage after:',JSON.stringify(dialogue.ledger.snapshot()));
      console.log('Disable AI in the SQL Editor now. This tool makes no retries.');
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
