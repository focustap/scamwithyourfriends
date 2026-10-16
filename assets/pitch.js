// Three concrete pitch targets shared by the phone and Files apps.
export function pitchChecklist(npc) {
  return [
    { id:'cost',label:'PRICE',hint:npc.concerns.find(c=>c.id==='cost')?.detail || 'Explain the total price and ongoing charges.' },
    { id:'usefulness',label:'BENEFIT',hint:npc.concerns.find(c=>c.id==='usefulness')?.detail || 'Explain what the product does for them.' },
    { id:'credibility',label:'TRUST',hint:npc.concerns.find(c=>c.id==='credibility')?.detail || 'Give them a reason to trust the offer.' },
  ];
}
