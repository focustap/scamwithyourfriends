// Closing a deal is a server-side roll. It never triggers an AI request.
export function closingChance(npc, call) {
  const listed = npc.value, price = call.offerPrice ?? listed;
  if (!Number.isInteger(price) || price < Math.ceil(listed * .5) || price > Math.floor(listed * 2)) return 0;
  const discount = Math.max(-1,Math.min(.5,(listed-price)/listed));
  const trust = Math.max(0,Math.min(100,call.trust || 0));
  const suspicion = Math.max(0,Math.min(100,call.susp || 0));
  const marks = new Set((call.resolved || []).filter(id=>['cost','usefulness','credibility'].includes(id))).size;
  const raw = 18 + trust * .55 - suspicion * .20 + marks * 10 +
    (call.ready ? 12 : 0) + (call.computer?.completed ? 6 : 0) +
    Math.min(6,(call.turns || 0)*2) + discount * (discount >= 0 ? 24 : 22);
  return Math.max(3,Math.min(95,Math.round(raw)));
}
export function mayTryClose(call) {
  return !call.busy && (call.dealAttempts || 0) < 3 && call.lastDealTurn !== call.turns;
}
