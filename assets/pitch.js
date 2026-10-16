// Short, concrete prompts displayed in the Phone application only.
const tips = {
  mildred: ['Tell her the total and whether there are renewal fees.', 'Explain exactly how her old toaster gets repaired or replaced.', 'Explain exclusions, cancellation and refunds.'],
  doug: ['State the price and what he can skip.', 'Explain how it protects his lawn flamingos from disturbances.', 'Tell him how to test the system before committing.'],
  kevin: ['Explain the price with his rent due.', 'Explain how it fixes the chair noise on streams.', 'Explain support and what happens if it does not work.'],
  priya: ['Break down the total price.', 'Give a concrete benefit beyond plain water.', 'Offer evidence or a test she can repeat.'],
  frank: ['Explain the subscription cost and how to cancel.', 'Explain how the service helps his tomatoes get light.', 'Acknowledge weather limitations and explain the backup plan.'],
};
export function pitchChecklist(npc) {
  const ids=['cost','usefulness','credibility'],labels=['PRICE','BENEFIT','TRUST'];
  return ids.map((id,i)=>({id,label:labels[i],hint:tips[npc.id]?.[i] ?? npc.concerns.find(c=>c.id===id)?.detail ?? ''}));
}
