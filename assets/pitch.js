export function pitchChecklist(npc) {
  return [
    {id:'cost',label:'PRICE',hint:'Tell them what it costs.'},
    {id:'usefulness',label:'BENEFIT',hint:'Explain what '+npc.offer+' does.'},
    {id:'credibility',label:'TRUST',hint:'Give a reason it works or offer a demo.'},
  ];
}
