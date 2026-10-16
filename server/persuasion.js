import { parseOffer, priceRange } from './pricing.js';

// A price quote is a pitch point, not a promise that the customer wants to buy.
function isQuotedSalePrice(npc, words) {
  const price = parseOffer(words), { min, max } = priceRange(npc.value);
  if (price === null || price < min || price > max) return false;
  return /\b(?:sell(?:ing)?|offer(?:ing)?|charg(?:e|ing)|price|cost|total|pay(?:ment)?|for)\b.{0,55}(?:\$\s*\d{1,4}|\b\d{1,4}\s*(?:dollars?|bucks?))\b|\b\d{1,4}\s*(?:dollars?|bucks?)\b.{0,40}\b(?:price|cost|total|offer)\b/i.test(words);
}
function asksCustomerNeeds(words) {
  return /\?/.test(words) && /\b(?:what|why|how|which|when)\b|\b(?:do you need|are you worried|would you prefer|what matters to you)\b/i.test(words);
}

const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
function similar(a,b) {
  a = new Set(normalize(a).split(' ').filter(w => w.length > 2)); b = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  const shared = [...a].filter(w => b.has(w)).length;
  return shared / Math.max(1,new Set([...a,...b]).size) >= .68;
}
export function evaluatePersuasion(npc, call, words, result) {
  if (typeof result?.reply !== 'string' || !result.reply.trim() || result.reply.length > 600
    || !Number.isInteger(result.quality) || result.quality < 0 || result.quality > 3
    || !['discovery','explanation','objection','smalltalk','pressure','abuse','goodbye'].includes(result.intent)
    || !['considering','ready','declines'].includes(result.disposition) || typeof result.wantsToEnd !== 'boolean'
    || typeof result.evidence !== 'string' || result.evidence.length > 180 || typeof result.objection !== 'string' || result.objection.length > 240
    || !Array.isArray(result.memory) || result.memory.length > 3 || !result.memory.every(m => typeof m === 'string' && m.length > 0 && m.length <= 120)) throw new Error('AI returned an invalid assessment; no trust awarded.');
  call.pitches ??= []; call.contributions ??= {}; call.resolved ??= []; call.offenses ??= 0;
  const repeated = call.pitches.some(p => similar(words,p));
  let trust = 0, suspicion = repeated ? 3 : 0;
  const validConcern = npc.concerns.some(c => c.id === result.concernId);
  const evidence = normalize(result.evidence);
  const grounded = evidence.length >= 12 && normalize(words).includes(evidence) && evidence.split(' ').length >= 4;
  if (!repeated && grounded && validConcern && result.quality >= 2 && ['explanation','objection'].includes(result.intent)) {
    const count = call.contributions[result.concernId] || 0;
    trust = count === 0 ? 12 : count === 1 ? 4 : 0; suspicion -= trust > 0 ? 6 : 0;
    call.contributions[result.concernId] = count + 1;
    if (!call.resolved.includes(result.concernId)) call.resolved.push(result.concernId);
  } else if (!repeated && result.intent === 'discovery' && !call.discovered && words.trim().length > 15 && asksCustomerNeeds(words)) {
    trust = 3; call.discovered = true;
  }
  // Quoting a concrete selling price satisfies PRICE even if the AI is still
  // asking about value, terms, or whether it is worthwhile. Those affect trust.
  if (!repeated && !call.resolved.includes('cost') && isQuotedSalePrice(npc, words)) call.resolved.push('cost');
  const abusive = /\b(idiot|stupid|shut up|moron)\b/i.test(words);
  const pressure = /\b(must buy|hurry up|immediately|last chance)\b/i.test(words);
  if ((result.intent === 'abuse' && abusive) || (result.intent === 'pressure' && pressure)) { trust = -6; suspicion += 16; call.offenses++; }
  call.pitches.push(words); call.pitches = call.pitches.slice(-12);
  const goodbye = result.intent === 'goodbye' && /\b(bye|goodbye|hang up|end (this|the) call|talk later)\b/i.test(words);
  const hangup = goodbye || (call.offenses >= 2 && result.wantsToEnd);
  return { trust, suspicion, hangup, repeated, grounded, ready:result.disposition === 'ready' && call.resolved.length >= 2 };
}
