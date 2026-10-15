// Fictional negotiation: explicit monetary offers only, never infer a price from ages or unrelated numbers.
export function parseOffer(words) {
  if (typeof words !== 'string') return null;
  const explicit = words.match(/\$\s*([0-9]{1,4})(?!\d)|\b([0-9]{1,4})\s*(?:dollars?|bucks?)\b/i);
  const isolated = words.match(/^\s*\$?([0-9]{1,4})\s*\??\s*$/);
  const phrased = words.match(/\b(?:offer|for|at|pay|charge|price|cost|do)\s+\$?([0-9]{1,4})(?!\d)/i);
  const value = Number(explicit?.[1] || explicit?.[2] || isolated?.[1] || phrased?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : null;
}
export function priceRange(listed) {
  return { min: Math.ceil(listed * 0.5), max: Math.floor(listed * 2) };
}
