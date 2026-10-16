import { randomInt } from 'node:crypto';
import { PRODUCTS } from '../assets/products.js';

// Distinct products per day, with no customer offered their most recent product twice in a row.
export function assignProducts(customerIds, previous = {}, products = PRODUCTS, rand = randomInt) {
  if (products.length < customerIds.length) throw new Error('Not enough products');
  const used = new Set(), offers = {};
  for (const customerId of customerIds) {
    let candidates = products.filter(p => !used.has(p.id) && p.id !== previous[customerId]);
    if (!candidates.length) candidates = products.filter(p => !used.has(p.id));
    const selected = candidates[rand(candidates.length)];
    offers[customerId] = selected.id;
    used.add(selected.id);
  }
  return offers;
}
export function assignedNpc(npc, offer) {
  return { ...npc, offer:offer.offer, value:offer.value, concerns:offer.concerns };
}
