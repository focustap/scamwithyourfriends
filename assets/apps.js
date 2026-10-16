// Built-in app identities. All icons are static inline SVG paths (no image downloads).
export const APPLICATIONS = [
  {id:'phone',label:'PHONE',name:'Phone',group:'Communications',icon:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72l.46 2.8a2 2 0 0 1-.58 1.83L7.1 10.24a16 16 0 0 0 6.66 6.66l1.89-1.89a2 2 0 0 1 1.83-.58l2.8.46A2 2 0 0 1 22 16.92Z"/>'},
  {id:'computer',label:'COMPUTER',name:'Computer',group:'Hardware',icon:'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8M12 18v4M6 7h12"/>'},
  {id:'ledger',label:'LEDGER',name:'Ledger',group:'Finance',icon:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 2v20M11 7h5M11 11h5M11 15h3"/>'},
  {id:'files',label:'FILES',name:'Files',group:'Utilities',icon:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 12h18"/>'},
  {id:'manual',label:'HELP',name:'Handbook',group:'Utilities',icon:'<path d="M12 7v14M12 7C9 4 5 4 2 5v15c4-1 7 0 10 1M12 7c3-3 7-3 10-2v15c-4-1-7 0-10 1"/>'},
  {id:'operations',label:'OPERATIONS',name:'Operations',group:'Management',icon:'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="m6 16 4-5 3 2 5-6M16 7h2v2"/>'},
  {id:'store',label:'APP STORE',name:'App Store',group:'Management',icon:'<path d="M5 8h14l1 13H4L5 8ZM9 9V6a3 3 0 0 1 6 0v3"/><path d="m10 15 2 2 3-4"/>'},
  {id:'vault',label:'VAULT LAB',name:'Vault Lab',group:'Hardware',icon:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="5"/><path d="M12 8v8M8 12h8"/>'},
  {id:'calculator',label:'CALCULATOR',name:'Calculator',group:'Utilities',icon:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>'},
  {id:'notes',label:'NOTEPAD',name:'Notepad',group:'Utilities',icon:'<path d="M6 2h10l3 3v17H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h8M8 17h5"/><path d="M14 2v4h5"/>'},
  {id:'wallpaper',label:'WALLPAPERS',name:'Wallpapers',group:'Personalization',icon:'<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="16.5" cy="8.5" r="2"/><path d="m2 17 6-7 4 4 2-2 8 7"/>'},
  {id:'settings',label:'SETTINGS',name:'Settings',group:'Personalization',icon:'<path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12m0-14.14-2.12 2.12m-9.9 9.9-2.12 2.12"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'},
];
export const APP_BY_ID = Object.fromEntries(APPLICATIONS.map(item=>[item.id,item]));
export function appIcon(id) {
  const icon=APP_BY_ID[id]?.icon || APP_BY_ID.files.icon;
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icon+'</svg>';
}
