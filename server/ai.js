import { randomUUID } from 'node:crypto';

export class DialogueError extends Error {
  constructor(message, code = 'AI_UNAVAILABLE') { super(message); this.code = code; }
}
const blankUsage = () => ({ available:false, date:null, mode:'unavailable', tokens:0, requests:0, tokenLimit:0, requestLimit:0, blocked:true });
export class Dialogue {
  constructor(config, fetcher = fetch) {
    this.config = config; this.fetcher = fetcher; this.active = 0; this.pausedUntil = 0;
    this.usage = blankUsage();
    this.ledger = { snapshot:() => ({ ...this.usage }) };
  }
  acceptUsage(usage) {
    if (!usage || !['mock','live'].includes(usage.mode) || !/^\d{4}-\d{2}-\d{2}$/.test(usage.date)
      || !['tokens','requests','tokenLimit','requestLimit'].every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0)
      || typeof usage.blocked !== 'boolean') throw new DialogueError('AI accounting response invalid.');
    this.usage = { ...usage, available:true };
  }
  async invoke(body, signal) {
    let response;
    const controller = new AbortController(), cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort',cancel,{ once:true });
    const timer = setTimeout(cancel,26000);
    try {
      response = await this.fetcher(this.config.functionUrl, { method:'POST', redirect:'error',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + this.config.gameServerToken },
        body:JSON.stringify(body), signal:controller.signal });
    } catch { this.usage.available = false; throw new DialogueError('Supabase AI unavailable. Your words were not answered; try again later.'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      this.usage.available = false;
      const messages = { DAILY_BUDGET:'Daily AI budget reached. No model reply was generated.', RATE_LIMIT:'AI is busy. Wait before trying again.',
        AI_DISABLED:'AI is disabled in Supabase.', UNAUTHORIZED:'Game server authorization failed. Ask the host to check its configuration.',
        DUPLICATE_REQUEST:'That turn has already been submitted. No automatic retry was made.' };
      throw new DialogueError(messages[result?.error] || 'Supabase rejected the AI turn. No replacement reply was generated.', result?.error || 'AI_UNAVAILABLE');
    }
    this.acceptUsage(result?.usage); return result;
  }
  async refreshUsage() {
    if (!this.config.aiEnabled) return;
    try { await this.invoke({ action:'status' }); } catch { this.usage.available = false; }
  }
  async reply(npc, call, text, event, signal) {
    if (!this.config.aiEnabled) return this.practice(npc,call,text);
    if (this.active >= 2 || Date.now() < this.pausedUntil) throw new DialogueError('AI temporarily busy. No model reply was generated.');
    this.active++;
    try {
      const result = await this.invoke({ action:'dialogue', requestId:randomUUID(), profile:npc, text,
        history:call.history.filter(m => m.who !== 'system').slice(0,-1).slice(-6).map(m => ({ role:m.who === 'me' ? 'user' : 'assistant',content:m.text.slice(0,600) })),
        memory:(call.memory || []).slice(-6), context:{ trust:call.trust, suspicion:call.susp, event:(event || 'Office open').slice(0,200), preoccupation:call.preoccupation.slice(0,200) } }, signal);
      if (!['GPT-5.6 Luna','Supabase mock • no model call'].includes(result.mode)
        || (result.mode === 'GPT-5.6 Luna' && result.usage.mode !== 'live')
        || (result.mode.includes('mock') && result.usage.mode !== 'mock')) throw new DialogueError('Unexpected AI mode.');
      return result;
    } catch (error) { this.pausedUntil = Date.now() + (error.code === 'RATE_LIMIT' ? 5000 : 15000); throw error; }
    finally { this.active--; }
  }
  practice(npc,call,text) {
    // Explicit offline practice, never presented as GPT and never used after AI errors.
    const concernId = /price|cost|bill|cancel|\$/.test(text.toLowerCase()) ? 'cost' : /test|honest|limit|fictional|guarantee/.test(text.toLowerCase()) ? 'credibility' : /garden|flamingo|chair|toaster|water|tomato|detect|light/.test(text.toLowerCase()) ? 'usefulness' : null;
    const pressure = /idiot|shut up|must buy|hurry up/.test(text.toLowerCase());
    return { reply:`[PRACTICE] ${concernId ? 'That addresses ' + concernId + '. ' : ''}${npc.concerns.find(c => c.id !== concernId)?.detail || 'What would that change for me?'}`,
      intent:pressure ? 'pressure' : concernId ? 'explanation' : 'smalltalk', concernId, evidence:concernId ? text.slice(0,160) : '', quality:concernId ? 2 : 0,
      objection:npc.concerns.find(c => c.id !== concernId)?.detail || '', disposition:call.turns >= 3 ? 'ready' : 'considering', wantsToEnd:false, memory:[], mode:'Practice • AI disabled' };
  }
}
