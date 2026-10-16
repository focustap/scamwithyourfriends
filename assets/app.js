import { NPCS } from './npcs.js';
import { pitchChecklist } from './pitch.js';
import { Desktop, calculate } from './desktop.js';
import { KokoroVoice } from './kokoro.js';
const $ = id => document.getElementById(id);
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');
let socket, room, playerId, app = 'phone', computerTarget, serverOffset = 0;
let recognition, utterance, speaking = false, finalSpeaking = false, listening = false, toastTimer, lastCallId, lastEvent, connecting = false;
const settings = { voice:true,handsfree:false,rate:1,engine:'browser' };
let program = 'terminal', file = 'brief', kokoroStatus = 'Browser voices ready.';
const area = document.querySelector('.deskgrid'); area.innerHTML = '';
const taskbar = document.createElement('div'); taskbar.className = 'taskbar'; document.querySelector('.desktop').append(taskbar);
const desktop = new Desktop(area,taskbar);
const shortcuts=[['phone','☎','PHONE'],['computer','▣','COMPUTER'],['ledger','▤','LEDGER'],['files','▥','FILES'],['manual','?','HELP'],['operations','◫','OPS'],['store','▦','APP STORE'],['vault','◈','VAULT LAB'],['calculator','＋','CALC'],['notes','✎','NOTES'],['settings','⚙','SETTINGS']];
const shortcutTray=document.createElement('nav'); shortcutTray.className='desktopShortcuts'; shortcutTray.setAttribute('aria-label','Desktop shortcuts');
for (const [id,icon,label] of shortcuts) {const button=document.createElement('button');button.className='desktopShortcut';button.dataset.shortcut=id;button.innerHTML='<span>'+icon+'</span><small>'+label+'</small>';button.title='Open '+label;shortcutTray.append(button);}
area.append(shortcutTray);
const startButton=document.createElement('button');startButton.className='startButton';startButton.textContent='▦ START';taskbar.prepend(startButton);
const startMenu=document.createElement('nav');startMenu.className='startMenu';startMenu.hidden=true;startMenu.setAttribute('aria-label','Start menu');
startMenu.innerHTML='<b>COLD CALL OS</b><small>APPS // PRIVATE OFFICE</small>'+shortcuts.map(([id,icon,label])=>'<button data-shortcut="'+id+'">'+icon+' '+label+'</button>').join('');
area.append(startMenu);startButton.onclick=()=>{startMenu.hidden=!startMenu.hidden;};

const kokoro = new KokoroVoice(text => { kokoroStatus = text; if ($('kokoroStatus')) $('kokoroStatus').textContent = text; });
const own = () => room?.players.find(p => p.id === playerId);
const call = () => own()?.call;
const npcFor = c => NPCS.find(n => n.id === c?.npcId);
const online = () => !!socket?.connected;
const sessionKey = url => 'cold-call-session:' + url;
function saved(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function save(key, value) { try { value ? sessionStorage.setItem(key, value) : sessionStorage.removeItem(key); } catch { /* optional */ } }
$('backendUrl').value = window.COLD_CALL_CONFIG?.backendUrl || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : '');
function notify(text) {
  $('toast').textContent = text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4500);
}
async function action(event, data = {}) {
  if (!online()) { notify('Office disconnected. Waiting to reconnect…'); return null; }
  try {
    const result = await socket.timeout(event === 'call:talk' ? 35000 : 6000).emitWithAck(event, data);
    if (!result.ok) { notify(result.error); return null; }
    return result;
  } catch { notify('No reply from the office. Reconnecting restores its latest state.'); return null; }
}
async function connect(join) {
  if (connecting) return;
  connecting = true; $('enterBtn').disabled = true; $('joinBtn').disabled = true;
  try {
    const url = new URL($('backendUrl').value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Enter a backend origin such as https://your-app.onrender.com');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS for a remote backend');
    const base = url.origin, token = saved(sessionKey(base));
    socket?.disconnect();
    socket = window.io(base, { auth: { password: $('serverPassword').value, token }, autoConnect: false, reconnectionDelayMax: 4000 });
    socket.on('room:state', state => receive(state));
    socket.on('npc:speak', message => { if (message.callId === call()?.id) say(message.text, npcFor(call()), message.final); });
    socket.on('room:expired', () => { notify('Room expired after an hour of inactivity.'); leaveLocally(); });
    socket.on('disconnect', () => { stopListening(); stopSpeech(); $('connectionBadge').textContent = 'RECONNECTING'; render(); });
    socket.on('connect', async () => {
      $('connectionStatus').textContent = 'Connected to the office.';
      if (socket.auth.token) await sync();
    });
    socket.on('connect_error', error => {
      $('connectionStatus').textContent = error.message;
      if (/Session expired|already connected/.test(error.message)) {
        save(sessionKey(base), null); socket.auth.token = null;
        if (room) { leaveLocally(); notify('Your session ended. Create or join a room again.'); }
      }
    });
    $('connectionStatus').textContent = 'Connecting… A sleeping Render service can take a minute.';
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Connection timed out. Check backend, password, and allowed origins.')); }, 60000);
      const success = () => { cleanup(); resolve(); }, failure = e => { cleanup(); reject(e); };
      function cleanup() { clearTimeout(timeout); socket.off('connect', success); socket.off('connect_error', failure); }
      socket.once('connect', success); socket.once('connect_error', failure); socket.connect();
    });
    if (token) return;
    const result = await action(join ? 'room:join' : 'room:create', { name: $('playerName').value.trim(), code: $('roomCode').value.trim().toUpperCase() });
    if (result) { playerId = result.playerId; socket.auth.token = result.token; save(sessionKey(base), result.token); await sync(); }
  } catch (error) { $('connectionStatus').textContent = error.message; socket?.disconnect(); }
  finally { connecting = false; $('enterBtn').disabled = false; $('joinBtn').disabled = false; }
}
async function sync() {
  const result = await action('room:sync');
  if (result) { playerId = result.playerId; receive(result.state); }
}
function receive(state) {
  const previousPhase = room?.phase;
  room = state; serverOffset = state.serverTime - Date.now();
  if (!playerId) return;
  $('landing').classList.add('hidden'); $('app').classList.remove('hidden');
  const c = call();
  if (c?.id !== lastCallId) { stopListening(); if (c || !finalSpeaking) stopSpeech(); lastCallId = c?.id; if (c?.history[0]?.who === 'bot') say(c.history[0].text,npcFor(c)); }
  if (lastEvent && lastEvent !== room.event) notify(room.event);
  lastEvent = room.event;
  if (previousPhase === 'playing' && room.phase !== 'playing') { stopListening(); stopSpeech(); }
  render();
}
function leaveLocally() {
  if (socket) { save(sessionKey(new URL(socket.io.uri).origin), null); socket.auth.token = null; socket.disconnect(); }
  room = null; playerId = null; lastCallId = null; stopListening(); stopSpeech();
  $('overlay').classList.add('hidden'); $('app').classList.add('hidden'); $('landing').classList.remove('hidden');
}
function stats() {
  if (!room) return;
  $('earnings').textContent = money(room.earned); $('remaining').textContent = money(room.quota - room.earned);
  $('wins').textContent = `${room.wins} / ${room.calls}`; $('quotaProgress').style.width = Math.min(100, room.earned / room.quota * 100) + '%';
  const s = room.phase === 'playing' ? Math.max(0, Math.ceil((room.endsAt - Date.now() - serverOffset) / 1000)) : 0;
  $('timer').textContent = room.phase === 'lobby' ? 'LOBBY' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('connectionBadge').textContent = online() ? `ROOM ${room.code}` : 'RECONNECTING';
}
function openApp(id) {
  const names = { phone:'PHONE',computer:'CUSTOMER COMPUTER',ledger:'SALES LEDGER',files:'FILE EXPLORER',manual:'HANDBOOK',settings:'SETTINGS',calculator:'CALCULATOR',notes:'NOTEPAD',operations:'OPERATIONS',store:'APP STORE',vault:'VAULT LAB' };
  app = id; desktop.open(id,names[id],id === 'phone' ? 'leftPanel' : id === 'operations' ? 'rightPanel' : id + 'Panel');
}
function render() {
  if (!room || !own()) return;
  if (!desktop.windows.size) { openApp('phone'); openApp('operations'); app = 'phone'; }
  stats();
  const drafts = new Map([...document.querySelectorAll('.osWindow input:not([type=checkbox]),.osWindow textarea')].map(e => [e.id,e.value]));
  const focused = document.activeElement?.id, selection = document.activeElement?.selectionStart;
  document.querySelectorAll('.appicon').forEach(b => b.classList.toggle('active',b.dataset.app === app));
  renderPhone($('leftPanel'));
  if ($('computerPanel')) renderComputer($('computerPanel'));
  if ($('ledgerPanel')) $('ledgerPanel').innerHTML = `<div class="sectiontitle">TEAM SALES REGISTER</div><div class="infoBox"><small>Shared earnings</small><b>${money(room.earned)}</b></div>${room.results.map(r => `<div class="logentry"><span>${safe(r.name)} / ${safe(r.player)}<br>${safe(r.product)}<br>${safe(r.reason)}</span><b>${r.win ? '+' + money(r.value) : 'NO SALE'}</b></div>`).join('')}<div class="sectiontitle">RECOVERY JOBS</div>${(room.lootResults || []).map(r => `<div class="logentry"><span>${safe(r.player)} recovered ${safe(r.kind.toUpperCase())} from ${safe(r.customer)}</span><b>+${money(r.value)}</b></div>`).join('')}`;
  if ($('filesPanel')) renderFiles($('filesPanel'));
  if ($('storePanel')) renderStore($('storePanel'));
  if ($('vaultPanel')) renderVault($('vaultPanel'));
  if ($('manualPanel')) $('manualPanel').innerHTML = '<div class="manual"><h3>YOUR GOAL</h3><p>Call a customer and sell the product shown at the top of Phone. The listed price is your starting point.</p><h3>THREE PITCH POINTS</h3><p>PRICE: explain what they pay. BENEFIT: explain what the product does. TRUST: answer doubts about whether it works or how they can cancel. Each customer has a specific tip for each point on Phone.</p><h3>CLOSE WHENEVER YOU WANT</h3><p>The Close Chance percentage is based on trust, suspicion, answered points, customer agreement, the price and optional computer repairs. You can try immediately, but failed closes lower trust and raise suspicion. One attempt per conversation turn, three maximum. Closing never uses an AI request.</p><h3>EXTRA WORK</h3><p>Computer repair adds trust and improves closing odds, but is not required. Buy upgrades in App Store and run recovery jobs in Vault Lab for additional earnings.</p><h3>PLAY SOLO OR TOGETHER</h3><p>Start alone or invite up to three others. Your team shares the quota, credits and upgrades.</p><h3>VOICE</h3><p>Click TALK or type. Hands-free can be enabled in Settings.</p></div>';
  if ($('settingsPanel')) renderSettings($('settingsPanel'));
  if ($('calculatorPanel')) $('calculatorPanel').innerHTML = '<div class="sectiontitle">DESKTOP CALCULATOR</div><p class="helptext">Use this to reconcile a customer invoice. Supports parentheses and + − * /.</p><form id="calculatorForm"><input id="calculatorInput" aria-label="Calculation" maxlength="80" placeholder="(40 * 3) + 7 - 2"><button class="actionbtn">CALCULATE</button></form><output id="calculatorResult" class="calcResult"></output>';
  if ($('notesPanel')) $('notesPanel').innerHTML = '<label class="sectiontitle" for="deskNotes">PRIVATE DESK NOTES</label><textarea id="deskNotes" maxlength="3000" placeholder="Keep customer details and objections here…"></textarea><p class="tiny soft">Stored in this tab only. Notes are not sent to the model.</p>';
  renderOperations(); renderSummary(); wire();
  for (const [id,value] of drafts) if ($(id)) $(id).value = value;
  if ($('deskNotes') && !drafts.has('deskNotes')) $('deskNotes').value = saved('cold-call-notes') || '';
  if ($(focused)) { $(focused).focus(); if (typeof selection === 'number') $(focused).setSelectionRange?.(selection,selection); }
  const transcript = $('transcript'); if (transcript) transcript.scrollTop = transcript.scrollHeight;
  const terminal = $('terminalLog'); if (terminal) terminal.scrollTop = terminal.scrollHeight;
  updateMic();
}
function renderPhone(p) {
  const c = call();
  if (!c) {
    p.innerHTML = `<div class="sectiontitle">${room.phase === 'playing' ? 'AVAILABLE CONTACTS' : 'PRIVATE OFFICE LOBBY'}</div><p class="helptext">${room.phase === 'playing' ? 'Call a customer and speak in your own words.' : 'Start solo or share your room code with up to three friends.'}</p>${NPCS.map(n => {
      const owner = room.players.find(p => p.call?.npcId === n.id), used = room.used.includes(n.id);
      return `<div class="contact ${used ? 'done' : ''}"><div class="avatar">${n.emoji}</div><div class="contactBody"><b>${safe(n.name)}</b><small>${n.age} · ${safe(n.occupation)}<br>${owner ? 'On call with ' + safe(owner.name) : used ? 'Call finished' : safe(n.offer) + ' · ' + money(n.value)}</small></div><button data-call="${n.id}" ${room.phase !== 'playing' || owner || used || !online() ? 'disabled' : ''}>CALL →</button></div>`;
    }).join('')}<p class="tiny soft">${room.aiEnabled ? 'Supabase AI configured. Turn labels identify live or mock replies. Errors never trigger canned dialogue.' : 'PRACTICE • AI disabled. No OpenAI calls.'}</p>`; return;
  }
  const n=npcFor(c),canDeal=c.canClose && online();
  const checklist=pitchChecklist(n).map(item=>`<div class="pitchMark ${c.resolved.includes(item.id)?'done':''}"><div class="pitchMarkTitle"><b>${c.resolved.includes(item.id)?'✓':'○'} ${item.label}</b><span>${c.resolved.includes(item.id)?'DONE':'TO DO'}</span></div><p>${safe(item.hint)}</p></div>`).join('');
  const mission=`<div class="salesObjective"><small>YOUR JOB</small><h3>SELL: ${safe(n.offer)}</h3><p>Starting price <b>${money(n.value)}</b> · Current offer <b>${money(c.offerPrice)}</b></p><p>Answer the three points below to improve your odds, or try closing early.</p></div><div class="pitchChecklist"><div class="sectiontitle">THREE PITCH POINTS · ${c.resolved.length}/3</div><div class="pitchMarks">${checklist}</div></div>`;
  const closing=`<div class="closingPanel"><div><small>CLOSE CHANCE</small><strong>${c.closeChance}%</strong><p>More trust, pitch points, customer agreement, a better price and computer repairs improve your odds. ${Math.max(0,3-(c.dealAttempts||0))} attempts left. A failed close hurts trust.</p></div><button id="dealBtn" class="actionbtn" ${canDeal?'':'disabled'}>TRY CLOSE · ${c.closeChance}%</button></div>`;
  p.innerHTML = `<div class="toolbar"><span class="kicker">${c.busy ? 'CUSTOMER IS THINKING…' : 'CALL CONNECTED'}</span><button class="dangerbtn" id="hangBtn">HANG UP</button></div><div class="callProfile"><div class="portrait">${n.emoji}</div><div><h2>${safe(n.name)}</h2><small>${n.age} · ${safe(n.occupation)}</small><p class="tiny soft">${safe(n.offer)} · List ${money(n.value)}${c.offerPrice !== n.value ? ' · Negotiating '+money(c.offerPrice) : ''}</p></div></div>${mission}<div class="meters"><div><div class="meterhead"><span>TRUST</span><span>${c.trust}%</span></div><div class="meter"><span style="width:${c.trust}%"></span></div></div><div><div class="meterhead"><span>SUSPICION</span><span>${c.susp}%</span></div><div class="meter danger"><span style="width:${c.susp}%"></span></div></div></div><div class="notice"><b>NEXT OBJECTION:</b> ${safe(c.objection || 'Ask what would convince them.')}<br>${c.ready ? 'Customer agreed — now is a strong time to close.' : 'Still weighing the offer.'}</div><div class="transcript" id="transcript" aria-live="polite">${c.history.map(h => `<div class="bubble ${h.who}">${h.who === 'system' ? '' : `<label>${h.who === 'me' ? 'YOU' : safe(n.name)}</label>`}${safe(h.text)}</div>`).join('')}</div><form class="inputrow" id="pitchForm"><input id="pitchInput" maxlength="500" autocomplete="off" placeholder="Speak in your own words…" aria-label="Type your pitch"><button type="button" class="talkbtn" id="micBtn" ${c.busy || !online() ? 'disabled' : ''}>🎙 TALK</button><button class="actionbtn" ${c.busy || !online() ? 'disabled' : ''}>SEND</button></form><p class="tiny soft" id="micStatus" role="status"></p>${closing}<div class="toolbar"><button class="outline" id="openComputer">${c.computer.completed ? 'COMPUTER VERIFIED ✓' : 'COMPUTER REPAIR · OPTIONAL BONUS →'}</button></div><p class="tiny soft">${safe(c.mode)} · Turn ${c.turns}/12</p>`;
}
function renderComputer(p) {
  const targets = room.players.filter(p => p.call);
  if (!targets.some(p => p.id === computerTarget)) computerTarget = own()?.call ? playerId : targets[0]?.id;
  const target = targets.find(p => p.id === computerTarget), c = target?.call;
  p.innerHTML = `<div class="sectiontitle">CUSTOMER COMPUTER // SANDBOX</div><label class="helptext">Desk <select id="computerTarget" class="outline">${targets.map(t => `<option value="${t.id}" ${t.id === computerTarget ? 'selected' : ''}>${safe(t.name)} → ${safe(npcFor(t.call).name)}</option>`).join('')}</select></label>`;
  if (!c) { p.innerHTML += '<div class="notice">Dial a customer to connect a customer computer.</div>'; return; }
  const pc = c.computer;
  p.innerHTML += `<div class="programTabs">${['terminal','router','invoice','files'].map(id => `<button class="outline ${program === id ? 'active' : ''}" data-program="${id}">${id.toUpperCase()}</button>`).join('')}</div><div class="customerPC"><div class="pcBar">${npcFor(c).emoji} ${safe(npcFor(c).name)}’s computer <span>CUSTOMER PC</span></div><div class="pcScreen">${program === 'terminal' ? `<pre id="terminalLog" class="terminalLog">${pc.terminal.map(safe).join('\n')}</pre><form id="terminalForm" class="inputrow"><input id="terminalInput" maxlength="80" aria-label="Sandbox command" placeholder="help"><button class="actionbtn">RUN</button></form>` : program === 'files' ? `<h3>concerns.txt</h3>${npcFor(c).concerns.map(c => `<p><b>${safe(c.id)}</b>: ${safe(c.detail)}</p>`).join('')}<p>employee_benefits.txt: File is empty.</p>` : pc.completed ? '<div class="green"><h2>✓ FICTIONAL SYSTEM VERIFIED</h2><p>Trust +7 · Suspicion −8</p></div>' : program === 'router' ? pc.stage === 'diagnostics' ? '<p>Run scan and repair MODULE in Terminal before restoring the router.</p>' : `<div class="sectiontitle">RESTORE BOOT ORDER</div><p class="mono">${pc.sequence.map((s,i) => `<span class="${i < pc.progress ? 'green' : ''}">${s}</span>`).join(' → ')}</p><div class="puzzleButtons">${['TOASTER','ANTENNA','KAZOO'].map(s => `<button class="outline" data-answer="${s}" ${pc.stage !== 'wires' ? 'disabled' : ''}>${s}</button>`).join('')}</div><p>${pc.progress}/3 connected</p>` : pc.stage !== 'invoice' ? '<p>Repair the module and restore the router first.</p>' : `<div class="sectiontitle">INVOICE RECONCILIATION</div><div class="infoBox mono" id="invoiceItems">UNIT PRICE: ${pc.unitPrice}<br>QUANTITY: ${pc.quantity}<br>SERVICE FEE: ${pc.fee}<br>DISCOUNT: ${pc.discount}</div><p>Total = unit price × quantity + fee − discount. Use Calculator if needed.</p><form id="invoiceForm" class="inputrow"><input id="invoiceInput" type="number" aria-label="Invoice total" required><button class="actionbtn">VERIFY TOTAL</button></form>`}</div></div>`;
}

function renderStore(p) {
  const apps=[
    {id:'ssd',label:'SSD EXTRACTOR',price:80,desc:'Recover customer files from a verified computer (+$30 per target).'},
    {id:'wallet',label:'WALLET CIPHER',price:160,desc:'Decode a  wallet puzzle after SSD extraction (+$75 per target).'},
  ];
  p.innerHTML='<div class="sectiontitle">SOFTWARE DEPOT // TEAM UPGRADES</div><div class="infoBox"><small>Spendable office credits (carry across shifts)</small><b>'+money(room.credits||0)+'</b></div><p class="helptext">Buying apps does not reduce shift quota progress. Unlocks are shared by your team until this room closes.</p>'+
    apps.map(item=>{
      const installed=room.upgrades?.includes(item.id),blocked=item.id==='wallet'&&!room.upgrades?.includes('ssd');
      return '<article class="storeCard"><div class="sectiontitle">'+item.label+'</div><p>'+item.desc+'</p><b>'+money(item.price)+'</b><button class="actionbtn" data-buy="'+item.id+'" '+(installed||blocked||room.credits<item.price||!online()?'disabled':'')+'>'+(installed?'INSTALLED':blocked?'SSD REQUIRED':room.credits<item.price?'NEED CREDITS':'BUY APP')+'</button></article>';
    }).join('')+'<p class="helptext">Unlock better jobs with better software.</p>';
}
let vaultTarget;
function renderVault(p) {
  const targets=room.players.filter(person=>person.call);
  if(!targets.some(person=>person.id===vaultTarget))vaultTarget=own()?.call?playerId:targets[0]?.id;
  const player=targets.find(person=>person.id===vaultTarget),c=player?.call,loot=c?.loot;
  const header='<div class="sectiontitle">VAULT LAB // RECOVERY DESK</div><p class="helptext">Use upgraded tools on verified  customer computers. No real files, wallets or devices are accessed.</p>';
  const select=targets.length?'<label class="helptext">TARGET DESK <select id="vaultTarget" class="outline">'+targets.map(t=>'<option value="'+safe(t.id)+'" '+(t.id===vaultTarget?'selected':'')+'>'+safe(t.name)+' / '+safe(npcFor(t.call).name)+'</option>').join('')+'</select></label>':'<div class="notice">Call a customer first to access their computer.</div>';
  p.innerHTML=header+select+(!c?'':!c.computer.completed?'<div class="notice">Verify this customer’s computer before running recovery software.</div>':[
    {kind:'ssd',installed:room.upgrades?.includes('ssd'),done:loot.ssdTaken,label:'SSD EXTRACTOR',hint:'Badge '+safe(loot.badge)+' → Enter these four digits BACKWARDS.',input:'ssdPin'},
    {kind:'wallet',installed:room.upgrades?.includes('wallet'),done:loot.walletTaken,label:'WALLET CIPHER',hint:'Wallet code fragments '+safe(loot.fragments.split('').join('–'))+' → Enter them in C-A-D-B order.',input:'walletPin'},
  ].map(item=>{
    const locked=!item.installed||(item.kind==='wallet'&&!loot.ssdTaken);
    return '<article class="storeCard"><div class="sectiontitle">'+item.label+'</div><p class="helptext">'+(item.done?'✓ ALREADY RECOVERED':!item.installed?'Purchase this app in App Store.':item.kind==='wallet'&&!loot.ssdTaken?'Complete SSD extraction first.':item.hint)+'</p>'+(locked||item.done?'':'<form class="inputrow" id="'+item.kind+'Form"><input id="'+item.input+'" aria-label="'+item.label+' PIN" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Four-digit game PIN" required><button class="actionbtn">RECOVER</button></form>')+'</article>';
  }).join(''));
}

function renderFiles(p) {
  const n = npcFor(call()) || NPCS[0];
  p.innerHTML = `<div class="sectiontitle">FILE EXPLORER</div><div class="programTabs"><button class="outline" data-file="brief">customer_brief.txt</button><button class="outline" data-file="concerns">concerns.txt</button><button class="outline" data-file="benefits">benefits.txt</button></div><article class="fileViewer">${file === 'benefits' ? '<p>File is empty. Management calls this a benefit.</p>' : file === 'concerns' ? n.concerns.map(c => `<p><b>${safe(c.id)}</b>: ${safe(c.detail)}</p>`).join('') : `<h2>${safe(n.name)}, ${n.age}</h2><p>${safe(n.occupation)}</p><p>${safe(n.background)}</p><p>${safe(n.personality)}</p><p>Humor: ${safe(n.humor)}</p><p>Speech: ${safe(n.speechStyle)}</p>`}</article>`;
}
function renderSettings(p) {
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  p.innerHTML = `<div class="sectiontitle">AUDIO & ACCESSIBILITY</div><div class="setting"><label for="voiceSetting">Speak NPC replies</label><input id="voiceSetting" type="checkbox" ${settings.voice ? 'checked' : ''}></div><div class="setting"><label for="handsfreeSetting">Hands-free conversation</label><input id="handsfreeSetting" type="checkbox" ${settings.handsfree ? 'checked' : ''} ${!supported ? 'disabled' : ''}></div><div class="setting"><label for="rateSetting">Speech speed</label><select id="rateSetting" class="outline">${[.8,1,1.2].map(r => `<option value="${r}" ${r === settings.rate ? 'selected' : ''}>${r}×</option>`).join('')}</select></div><div class="setting"><label for="voiceEngine">Voice engine</label><select id="voiceEngine" class="outline"><option value="browser">Browser voices</option><option value="kokoro" ${kokoro.ready ? '' : 'disabled'} ${settings.engine === 'kokoro' ? 'selected' : ''}>Kokoro (local)</option></select></div><p class="helptext">Kokoro is optional: downloads a large voice model to your browser from Hugging Face and code from jsDelivr. Runs locally in a worker using WASM. First download can take minutes; speed depends on your computer. No paid voice API.</p><button id="loadKokoro" class="outline" ${kokoro.loading || kokoro.ready ? 'disabled' : ''}>${kokoro.ready ? 'KOKORO READY' : 'DOWNLOAD & ENABLE KOKORO'}</button><p class="tiny soft" id="kokoroStatus">${safe(kokoroStatus)}</p><div class="notice">${supported ? 'Recognition available. Click TALK to grant permission.' : 'Recognition unavailable. Type replies, or try Chrome / Edge.'} Recognition may use your browser provider’s servers. Only transcripts go to this game and, in live mode, Supabase/OpenAI.</div><button id="testVoice" class="outline">TEST SPEAKERS</button><button id="stopVoice" class="outline">STOP AUDIO</button>`;
}
function renderOperations() {
  const connected = room.players.filter(p => p.connected).length, host = room.host === playerId, u = room.usage;
  $('rightPanel').innerHTML = `<div class="sectiontitle">PRIVATE OFFICE</div><div class="roomCode mono">${safe(room.code)}</div><div class="toolbar"><span class="miniPill">${connected}/${room.players.length} CONNECTED · MAX 4</span><button id="copyCode" class="outline">COPY CODE</button></div>${room.players.map(p => `<div class="logentry"><span><b>${safe(p.name)}${p.id === room.host ? ' ♛' : ''}${p.id === playerId ? ' (you)' : ''}</b><br>${p.connected ? p.call ? '☎ ' + safe(npcFor(p.call).name) + (p.call.busy ? ' · thinking' : '') : 'At desk' : 'Reconnecting (45s grace)'}</span><span>${money(p.earned)}</span></div>`).join('')}<div class="toolbar shiftControls">${room.phase !== 'playing' ? `<button class="bigbtn" id="startShift" ${!host || connected < 1 || !online() ? 'disabled' : ''}>${room.phase === 'finished' ? 'NEXT SHIFT →' : 'START SHIFT →'}</button>` : `<button class="dangerbtn" id="endShift" ${!host || !online() ? 'disabled' : ''}>END SHIFT (HOST)</button>`}</div><div class="sectiontitle">OFFICE SOFTWARE</div><div class="infoBox"><small>Available team credits</small><b>${money(room.credits || 0)}</b></div><button id="openStore" class="outline">OPEN APP STORE →</button><div class="sectiontitle">MANAGEMENT BULLETIN</div><div class="notice">${safe(room.event)}</div><div class="sectiontitle">SUPABASE AI ACCOUNTING</div>${room.aiEnabled && u.available ? `<div class="grid2"><div class="infoBox"><small>Tokens charged / reserved</small><b>${u.tokens.toLocaleString()} / ${u.tokenLimit.toLocaleString()}</b></div><div class="infoBox"><small>Requests</small><b>${u.requests} / ${u.requestLimit}</b></div></div><p class="tiny soft">${safe(u.date)} UTC · ${safe(u.mode.toUpperCase())} · ${u.blocked ? 'Budget closed' : 'Budget available'}</p>` : `<p class="helptext">${room.aiEnabled ? 'Accounting unavailable. AI requests may be rejected. No canned fallback.' : 'PRACTICE • AI disabled. No paid model requests.'}</p>`}<div class="sectiontitle">RECENT ACTIVITY</div>${room.results.slice(0,3).map(r => `<div class="logentry"><span>${safe(r.player)} → ${safe(r.name)}</span><b>${r.win ? '+' + money(r.value) : 'NO SALE'}</b></div>`).join('')}`;
}

function renderSummary() {
  if (room.phase !== 'finished') { $('overlay').classList.add('hidden'); return; }
  const host = room.host === playerId;
  $('overlay').innerHTML = `<div class="modal"><div class="kicker">HUMAN RESOURCES // FINAL REPORT</div><h2>${room.earned >= room.quota ? 'QUOTA CRUSHED' : 'SHIFT COMPLETE'}</h2><p>${room.earned >= room.quota ? 'Management has promoted the stapler in your honor.' : 'Management is considering replacing everyone with a fax machine.'}</p><div class="grid2"><div class="infoBox"><small>Team earnings</small><b>${money(room.earned)}</b></div><div class="infoBox"><small>Quota</small><b>${money(room.quota)}</b></div></div><p>${room.wins} sales from ${room.calls} calls. ${money(room.credits||0)} shared credits available for upgrades. </p><button id="nextShift" class="bigbtn" ${!host || !online() ? 'disabled' : ''}>${host ? 'WORK ANOTHER SHIFT →' : 'WAITING FOR HOST'}</button><button id="reviewShift" class="outline">REVIEW OFFICE</button><button id="leaveSummary" class="outline">LEAVE ROOM</button></div>`;
  $('overlay').classList.remove('hidden');
}
function wire() {
  const bind = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  document.querySelectorAll('[data-call]').forEach(b => b.onclick = () => action('call:dial', { npcId: b.dataset.call }));
  document.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => action('computer:answer', { playerId: computerTarget, answer: b.dataset.answer }));
  bind('hangBtn', () => { stopListening(); stopSpeech(); action('call:hangup'); }); bind('micBtn', mic);
  bind('dealBtn', async () => { stopListening(); const outcome=await action('call:deal'); if(outcome && !outcome.closed) notify('Close rejected at '+outcome.chance+'% odds. Pitch again to retry.'); });
  bind('openStore',()=>{openApp('store');render();});
  document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>action('store:buy',{id:b.dataset.buy}));
  if($('vaultTarget'))$('vaultTarget').onchange=e=>{vaultTarget=e.target.value;render();};
  for(const kind of ['ssd','wallet'])if($(kind+'Form'))$(kind+'Form').onsubmit=e=>{e.preventDefault();action('loot:extract',{playerId:vaultTarget,kind,answer:$(kind+'Pin').value});};
  bind('startShift', () => action('shift:start')); bind('nextShift', () => action('shift:start')); bind('endShift', () => action('shift:end'));
  bind('leaveSummary', leave); bind('reviewShift', () => $('overlay').classList.add('hidden'));
  bind('openComputer', () => { openApp('computer'); computerTarget = playerId; render(); });
  bind('copyCode', async () => { try { await navigator.clipboard.writeText(room.code); notify('Room code copied'); } catch { notify('Room code: ' + room.code); } });
  if ($('computerTarget')) $('computerTarget').onchange = e => { computerTarget = e.target.value; render(); };
  if ($('pitchForm')) $('pitchForm').onsubmit = e => { e.preventDefault(); const text = $('pitchInput').value; $('pitchInput').value = ''; talk(text); };
  if ($('voiceSetting')) $('voiceSetting').onchange = e => { settings.voice = e.target.checked; if (!settings.voice) stopSpeech(); };
  if ($('handsfreeSetting')) $('handsfreeSetting').onchange = e => { settings.handsfree = e.target.checked; if (!settings.handsfree) stopListening(); };
  if ($('rateSetting')) $('rateSetting').onchange = e => { settings.rate = Number(e.target.value); };
  document.querySelectorAll('[data-program]').forEach(b => b.onclick = () => { program = b.dataset.program; render(); });
  document.querySelectorAll('[data-file]').forEach(b => b.onclick = () => { file = b.dataset.file; render(); });
  if ($('terminalForm')) $('terminalForm').onsubmit = e => { e.preventDefault(); const command = $('terminalInput').value; $('terminalInput').value = ''; action('computer:command',{ playerId:computerTarget,command }); };
  if ($('invoiceForm')) $('invoiceForm').onsubmit = e => { e.preventDefault(); action('computer:answer',{ playerId:computerTarget,answer:$('invoiceInput').value }); };
  if ($('calculatorForm')) $('calculatorForm').onsubmit = e => { e.preventDefault(); try { $('calculatorResult').textContent = String(calculate($('calculatorInput').value)); } catch (error) { $('calculatorResult').textContent = error.message; } };
  if ($('deskNotes')) $('deskNotes').oninput = e => save('cold-call-notes',e.target.value);
  if ($('voiceEngine')) $('voiceEngine').onchange = e => { stopSpeech(); settings.engine = e.target.value; };
  bind('loadKokoro',async () => { try { const promise = kokoro.load(); render(); await promise; settings.engine = 'kokoro'; render(); } catch { settings.engine = 'browser'; notify('Kokoro could not load. Browser voices remain available.'); render(); } });
  bind('testVoice', () => say('Welcome to Cold Call Chaos. Employee satisfaction is purely theoretical.'));
  bind('stopVoice', () => { stopSpeech(); stopListening(); });
}
async function talk(text) {
  if (!text?.trim() || !call() || call().busy) return;
  stopListening(); stopSpeech();
  const result = await action('call:talk', { text: text.trim().slice(0, 500) });
  if (!result && $('pitchInput') && !$('pitchInput').value) $('pitchInput').value = text.trim().slice(0, 500);
}
function stopSpeech() {
  kokoro.stop();
  if (utterance) { utterance.onend = null; utterance.onerror = null; }
  window.speechSynthesis?.cancel(); utterance = null; speaking = false; finalSpeaking = false;
}
function say(text, npc, final = false) {
  if (!settings.voice) return;
  if (settings.engine === 'kokoro' && kokoro.ready) {
    stopListening(); stopSpeech(); speaking = true; finalSpeaking = final;
    const voices = { mildred:'bf_emma',doug:'am_michael',kevin:'am_adam',priya:'af_heart',frank:'bm_george' };
    kokoro.speak(text,voices[npc?.id] || 'af_heart',settings.rate,() => { speaking = false; if (!final && settings.handsfree && call() && !call().busy) startListening(); },() => { settings.engine = 'browser'; speaking = false; notify('Kokoro unavailable. Switching to browser voices.'); say(text,npc,final); }); return;
  }
  if (!window.speechSynthesis) return;
  stopListening(); stopSpeech(); const u = new SpeechSynthesisUtterance(text); utterance = u; finalSpeaking = final;
  const voices = speechSynthesis.getVoices().filter(v => v.lang?.startsWith('en'));
  if (voices.length) u.voice = voices[Math.max(0, NPCS.findIndex(n => n.id === npc?.id)) % voices.length];
  u.lang = 'en-US'; u.rate = settings.rate; u.pitch = npc?.voice || 1; speaking = true;
  u.onend = () => { if (utterance !== u) return; speaking = false; utterance = null; if (!final && settings.handsfree && call() && !call().busy && app === 'phone') startListening(); };
  u.onerror = () => { speaking = false; utterance = null; notify('Speech playback unavailable. Read the transcript or test speakers in Settings.'); };
  speechSynthesis.speak(u);
}
function stopListening() {
  if (recognition) { const rec = recognition; recognition = null; rec.onend = null; rec.onresult = null; rec.onerror = null; try { rec.abort(); } catch { /* idle */ } }
  listening = false; updateMic();
}
function updateMic(text) {
  if ($('micBtn')) { $('micBtn').classList.toggle('listening', listening); $('micBtn').textContent = listening ? '● STOP' : '🎙 TALK'; }
  if ($('micStatus')) $('micStatus').textContent = text || (listening ? 'Listening… Speak, then pause or click STOP.' : 'Click TALK to speak, or type. Use headphones for hands-free mode.');
}
function mic() { if (recognition) { try { recognition.stop(); } catch { stopListening(); } return; } stopSpeech(); startListening(); }
function startListening() {
  if (!call() || call().busy || !online() || speaking || recognition) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { notify('Recognition unavailable. Try Chrome / Edge, or type.'); return; }
  const callId = call().id, rec = new SR(); let finalText = '';
  recognition = rec; rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
  rec.onstart = () => { listening = true; updateMic(); };
  rec.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
      else interim += event.results[i][0].transcript;
    }
    updateMic(finalText + interim);
  };
  rec.onerror = event => { finalText = ''; if (event.error !== 'aborted') notify(`Microphone: ${event.error}. You can type instead.`); };
  rec.onend = () => { if (recognition !== rec) return; recognition = null; listening = false; updateMic(); if (call()?.id === callId && finalText.trim()) talk(finalText); };
  try { rec.start(); } catch { stopListening(); notify('Could not start microphone. Type your reply.'); }
}
async function leave() { stopListening(); stopSpeech(); await action('room:leave'); leaveLocally(); }
document.querySelectorAll('.appicon').forEach(b => b.onclick = () => { openApp(b.dataset.app); stopListening(); render(); });
document.querySelectorAll('[data-shortcut]').forEach(b=>b.onclick=()=>{startMenu.hidden=true;openApp(b.dataset.shortcut);render();});
const pcButton = document.createElement('button'); pcButton.className = 'appicon'; pcButton.dataset.app = 'computer'; pcButton.title = 'Customer computers'; pcButton.innerHTML = '▣<small>COMPUTER</small>';
pcButton.onclick = () => { openApp('computer'); stopListening(); render(); }; document.querySelector('.sidebar').insertBefore(pcButton, document.querySelector('[data-app="ledger"]'));
$('lobbyForm').onsubmit = e => { e.preventDefault(); connect(false); };
$('joinBtn').onclick = () => { if ($('lobbyForm').reportValidity()) connect(true); };
$('exitBtn').onclick = leave;
$('howBtn').onclick = () => {
  $('overlay').innerHTML = '<div class="modal"><div class="kicker">EMPLOYEE ORIENTATION</div><h2>MAKE THE CALL.</h2><p>Connect to your host’s backend, create a private room, and share its code. 1–4 players share a quota.</p><p>Hit PRICE, BENEFIT and TRUST, then try closing at any time. Computer repairs give a bonus but aren't required. TALK uses browser recognition; NPCs speak with browser voices. AI is enabled and budgeted by your host.</p><button id="closeHow" class="bigbtn">GOT IT →</button></div>';
  $('overlay').classList.remove('hidden'); $('closeHow').onclick = () => $('overlay').classList.add('hidden');
};
setInterval(() => { stats(); $('osClock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 500);
window.addEventListener('pagehide', () => { stopListening(); stopSpeech(); });

for (const [id,icon,label] of [['calculator','＋','CALC'],['notes','✎','NOTES'],['operations','▤','OPS'],['store','▦','STORE'],['vault','◈','VAULT']]) { const button = document.createElement('button'); button.className = 'appicon'; button.dataset.app = id; button.innerHTML = icon + '<small>' + label + '</small>'; button.onclick = () => { openApp(id); render(); }; document.querySelector('.sidebar').append(button); }
