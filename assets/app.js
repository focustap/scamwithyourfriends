import { NPCS } from './npcs.js';
const $ = id => document.getElementById(id);
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');
let socket, room, playerId, app = 'phone', computerTarget, serverOffset = 0;
let recognition, utterance, speaking = false, finalSpeaking = false, listening = false, toastTimer, lastCallId, lastEvent, connecting = false;
const settings = { voice: true, handsfree: false, rate: 1 };
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
    const result = await socket.timeout(event === 'call:talk' ? 15000 : 6000).emitWithAck(event, data);
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
  if (c?.id !== lastCallId) { stopListening(); if (c || !finalSpeaking) stopSpeech(); lastCallId = c?.id; if (c) say(c.history[0].text, npcFor(c)); }
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
  $('shiftNum').textContent = String(room.shift).padStart(3, '0');
  const s = room.phase === 'playing' ? Math.max(0, Math.ceil((room.endsAt - Date.now() - serverOffset) / 1000)) : 0;
  $('timer').textContent = room.phase === 'lobby' ? 'LOBBY' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('connectionBadge').textContent = online() ? `ROOM ${room.code}` : 'RECONNECTING';
}
function render() {
  if (!room || !own()) return;
  stats();
  const draft = $('pitchInput')?.value, focused = document.activeElement?.id, selection = $('pitchInput')?.selectionStart;
  document.querySelectorAll('.appicon').forEach(b => b.classList.toggle('active', b.dataset.app === app));
  $('appTitle').textContent = { phone: '☎ PHONE // CALL CENTER', computer: '▣ CUSTOMER // COMPUTER', ledger: '▤ SALES // LEDGER', files: '▥ OFFICE // FILES', manual: '☷ EMPLOYEE // HANDBOOK', settings: '⚙ AUDIO // SETTINGS' }[app];
  const panel = $('leftPanel');
  if (app === 'phone') renderPhone(panel);
  else if (app === 'computer') renderComputer(panel);
  else if (app === 'ledger') panel.innerHTML = `<div class="sectiontitle">TEAM SALES REGISTER</div><div class="infoBox"><small>Shared earnings</small><b class="green">${money(room.earned)}</b></div>${room.results.map(r => `<div class="logentry"><span><b>${safe(r.name)}</b> / ${safe(r.player)}<br>${safe(r.product)}<br>${safe(r.reason)}</span><b>${r.win ? '+' + money(r.value) : 'NO SALE'}</b></div>`).join('') || '<p class="helptext">No calls finished yet.</p>'}`;
  else if (app === 'files') panel.innerHTML = '<div class="sectiontitle">COMPANY SHARED DRIVE</div><div class="fileItem">📄 employee_benefits.txt — File is empty</div><div class="fileItem">📎 Memo: Stop microwaving fish in the server room.</div><div class="notice">All customers, computers, accounts, products and money are fictional.</div>';
  else if (app === 'manual') panel.innerHTML = `<div class="manual"><div class="sectiontitle">ORIENTATION // 2–4 DESKS</div><h3>Make the call</h3><p>The host starts the shared five-minute shift. Each desk can call a different customer. Listen and respond to what they say; pressure raises suspicion.</p><h3>Fix their fictional computer</h3><p>Open Computer. Follow the boot order, then match the invoice. Teammates can help while you talk. Completion grants trust +15 and suspicion −8.</p><h3>Close the sale</h3><p>You need trust ≥65, suspicion &lt;60, two conversation turns and a verified computer. The server validates sales and shares the money.</p><h3>Use your voice</h3><p>Click TALK to speak; click STOP to finish. Recognition sends final words. Hands-free mode listens after NPC speech. Use headphones; type if recognition fails.</p><h3>Office policies</h3><p>Six turns per player per minute; twelve per call. Calls end at shift expiry. Disconnected desks have 45 seconds to reconnect. Only the host starts or ends shifts.</p></div>`;
  else renderSettings(panel);
  renderOperations(); renderSummary(); wire();
  if (draft !== undefined && $('pitchInput')) { $('pitchInput').value = draft; if (focused === 'pitchInput') { $('pitchInput').focus(); $('pitchInput').setSelectionRange(selection, selection); } }
  const transcript = $('transcript'); if (transcript) transcript.scrollTop = transcript.scrollHeight;
  updateMic();
}
function renderPhone(p) {
  const c = call();
  if (!c) {
    p.innerHTML = `<div class="sectiontitle">${room.phase === 'playing' ? 'AVAILABLE CONTACTS' : 'PRIVATE OFFICE LOBBY'}</div><p class="helptext">${room.phase === 'playing' ? 'Different desks can call different fictional customers.' : 'Share the room code with 1–3 friends. The host can start when at least two desks connect.'}</p>${NPCS.map(n => {
      const owner = room.players.find(p => p.call?.npcId === n.id), used = room.used.includes(n.id);
      return `<div class="contact ${used ? 'done' : ''}"><div class="avatar">${n.emoji}</div><div class="contactBody"><b>${safe(n.name)}</b><small>${safe(n.tag)} · ${money(n.value)}<br>${owner ? 'On call with ' + safe(owner.name) : used ? 'Call finished' : safe(n.offer)}</small></div><button data-call="${n.id}" ${room.phase !== 'playing' || owner || used || !online() ? 'disabled' : ''}>CALL →</button></div>`;
    }).join('')}<p class="tiny soft">${room.aiEnabled ? 'GPT-6 Luna enabled; local dialogue takes over at limits or provider errors.' : 'LOCAL DIALOGUE MODE • AI disabled. Multiplayer and voice are playable.'}</p>`;
    return;
  }
  const n = npcFor(c);
  p.innerHTML = `<div class="toolbar"><span class="kicker">${c.busy ? 'CUSTOMER IS THINKING…' : 'CALL CONNECTED'}</span><button class="dangerbtn" id="hangBtn">HANG UP</button></div><div class="callProfile"><div class="portrait">${n.emoji}</div><div><h2>${safe(n.name)}</h2><small>${safe(n.tag)}</small><p class="tiny soft">${safe(n.offer)} · ${money(n.value)}</p></div></div><div class="meters"><div><div class="meterhead"><span>TRUST</span><span>${c.trust}%</span></div><div class="meter"><span style="width:${c.trust}%"></span></div></div><div><div class="meterhead"><span>SUSPICION</span><span>${c.susp}%</span></div><div class="meter danger"><span style="width:${c.susp}%"></span></div></div></div><div class="transcript" id="transcript" aria-live="polite">${c.history.map(h => `<div class="bubble ${h.who}">${h.who === 'system' ? '' : `<label>${h.who === 'me' ? 'YOU' : safe(n.name)}</label>`}${safe(h.text)}</div>`).join('')}</div><form class="inputrow" id="pitchForm"><input id="pitchInput" maxlength="500" autocomplete="off" placeholder="Talk to your customer…" aria-label="Type your pitch"><button type="button" class="talkbtn" id="micBtn" ${c.busy || !online() ? 'disabled' : ''}>🎙 TALK</button><button class="actionbtn" ${c.busy || !online() ? 'disabled' : ''}>SEND</button></form><p class="tiny soft" id="micStatus" role="status"></p><div class="quickrow"><button data-quick="joke" ${c.busy ? 'disabled' : ''}>😂 JOKE</button><button data-quick="ask" ${c.busy ? 'disabled' : ''}>💬 ASK</button><button data-quick="reassure" ${c.busy ? 'disabled' : ''}>🫶 REASSURE</button><button id="dealBtn" ${c.busy || c.trust < 65 || c.susp >= 60 || c.turns < 2 || !c.computer.completed || !online() ? 'disabled' : ''}>💸 CLOSE DEAL</button></div><button class="outline computerLink" id="openComputer">▣ ${c.computer.completed ? 'COMPUTER VERIFIED ✓' : 'OPEN CUSTOMER COMPUTER →'}</button><p class="tiny soft">${safe(c.mode)} · Turn ${c.turns}/12 · Computer required for sale</p>`;
}
function renderComputer(p) {
  const targets = room.players.filter(p => p.call);
  if (!targets.some(p => p.id === computerTarget)) computerTarget = own()?.call ? playerId : targets[0]?.id;
  const target = targets.find(p => p.id === computerTarget), c = target?.call;
  p.innerHTML = `<div class="sectiontitle">CUSTOMER COMPUTER // FICTIONAL SANDBOX</div><p class="helptext">Help any teammate while they handle the conversation.</p><label class="helptext">Desk <select id="computerTarget" class="outline">${targets.map(t => `<option value="${t.id}" ${t.id === computerTarget ? 'selected' : ''}>${safe(t.name)} → ${safe(npcFor(t.call).name)}</option>`).join('')}</select></label>`;
  if (!c) { p.innerHTML += '<div class="notice">Dial a customer to connect a simulated computer.</div>'; return; }
  const pc = c.computer;
  p.innerHTML += `<div class="customerPC"><div class="pcBar">${npcFor(c).emoji} ${safe(npcFor(c).name)}’s desktop <span>SIMULATED</span></div><div class="pcScreen">${pc.completed ? '<div class="green"><h2>✓ FICTIONAL SYSTEM VERIFIED</h2><p>Trust +15 · Suspicion −8</p></div>' : pc.stage === 'wires' ? `<div class="sectiontitle">BOOT ROUTER // SEQUENCE PUZZLE</div><p>Reconnect modules in this order:</p><p class="mono">${pc.sequence.map((s, i) => `<span class="${i < pc.progress ? 'green' : ''}">${safe(s)}</span>`).join(' → ')}</p><div class="puzzleButtons">${['TOASTER', 'ANTENNA', 'KAZOO'].map(s => `<button class="outline" data-answer="${s}">${s}</button>`).join('')}</div><p class="tiny soft">${pc.progress}/3 connected. Wrong order resets progress and adds suspicion.</p>` : `<div class="sectiontitle">INVOICE RECONCILIATION</div><p>Match the fictional invoice:</p><div class="infoBox mono">TOTAL DUE: ${pc.invoice} CHAOS BUCKS</div><div class="puzzleButtons">${[pc.invoice + 9, pc.invoice, pc.invoice - 9].sort((a, b) => a - b).map(n => `<button class="outline" data-answer="${n}">${n}</button>`).join('')}</div>`}</div></div><p class="tiny soft">This computer only exists inside the game.</p>`;
}
function renderSettings(p) {
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  p.innerHTML = `<div class="sectiontitle">AUDIO & ACCESSIBILITY</div><div class="setting"><label for="voiceSetting">Speak NPC replies</label><input id="voiceSetting" type="checkbox" ${settings.voice ? 'checked' : ''}></div><div class="setting"><label for="handsfreeSetting">Hands-free conversation</label><input id="handsfreeSetting" type="checkbox" ${settings.handsfree ? 'checked' : ''} ${!supported ? 'disabled' : ''}></div><div class="setting"><label for="rateSetting">Speech speed</label><select id="rateSetting" class="outline">${[.8, 1, 1.2].map(r => `<option value="${r}" ${r === settings.rate ? 'selected' : ''}>${r}×</option>`).join('')}</select></div><div class="notice">${supported ? 'Recognition available. Click TALK during a call to grant permission.' : 'Recognition unavailable. Type replies, or try Chrome / Edge.'} Recognition may use your browser provider’s servers. Only transcripts go to this game; the backend sends conversation text to OpenAI when AI is enabled.</div><p class="helptext">Use headphones. Speech uses browser voices, with no paid audio API calls. Click TALK to interrupt NPC speech.</p><button id="testVoice" class="outline">TEST SPEAKERS</button><button id="stopVoice" class="outline">STOP AUDIO</button>`;
}
function renderOperations() {
  const connected = room.players.filter(p => p.connected).length, host = room.host === playerId, u = room.usage;
  $('rightPanel').innerHTML = `<div class="sectiontitle">PRIVATE OFFICE // ${safe(room.code)}</div><div class="roomCode mono">${safe(room.code)}</div><div class="toolbar"><span class="miniPill">${connected}/${room.players.length} CONNECTED · MAX 4</span><button id="copyCode" class="outline">COPY CODE</button></div>${room.players.map(p => `<div class="logentry"><span><b>${safe(p.name)}${p.id === room.host ? ' ♛' : ''}${p.id === playerId ? ' (you)' : ''}</b><br>${p.connected ? p.call ? '☎ ' + safe(npcFor(p.call).name) + (p.call.busy ? ' · thinking' : '') : 'At desk' : 'Reconnecting (45s grace)'}</span><span class="green">${money(p.earned)}</span></div>`).join('')}<div class="toolbar shiftControls">${room.phase !== 'playing' ? `<button class="bigbtn" id="startShift" ${!host || connected < 2 || !online() ? 'disabled' : ''}>${room.phase === 'finished' ? 'NEXT SHIFT →' : 'START SHIFT →'}</button>` : `<button class="dangerbtn" id="endShift" ${!host || !online() ? 'disabled' : ''}>END SHIFT (HOST)</button>`}</div><div class="sectiontitle">MANAGEMENT BULLETIN</div><div class="notice">${safe(room.event)}</div><div class="sectiontitle">API BUDGET // ${safe(u.date)} UTC</div><div class="grid2"><div class="infoBox"><small>Tokens charged / reserved</small><b>${u.tokens.toLocaleString()} / ${u.tokenLimit.toLocaleString()}</b></div><div class="infoBox"><small>Requests today</small><b>${u.requests} / ${u.requestLimit}</b></div></div><p class="tiny soft">${room.aiEnabled ? u.blocked ? 'AI budget paused; local dialogue available.' : 'GPT-6 Luna enabled; fallback available.' : 'AI DISABLED • NO OPENAI REQUESTS'}<br>Includes reservations for uncertain requests. All desks share this backend’s daily budget.</p><div class="sectiontitle">RECENT ACTIVITY</div>${room.results.slice(0, 3).map(r => `<div class="logentry"><span>${safe(r.player)} → ${safe(r.name)}</span><b>${r.win ? '+' + money(r.value) : 'NO SALE'}</b></div>`).join('')}`;
}
function renderSummary() {
  if (room.phase !== 'finished') { $('overlay').classList.add('hidden'); return; }
  const host = room.host === playerId;
  $('overlay').innerHTML = `<div class="modal"><div class="kicker">HUMAN RESOURCES // FINAL REPORT</div><h2>${room.earned >= room.quota ? 'QUOTA CRUSHED' : 'SHIFT COMPLETE'}</h2><p>${room.earned >= room.quota ? 'Management has promoted the stapler in your honor.' : 'Management is considering replacing everyone with a fax machine.'}</p><div class="grid2"><div class="infoBox"><small>Team earnings</small><b>${money(room.earned)}</b></div><div class="infoBox"><small>Quota</small><b>${money(room.quota)}</b></div></div><p>${room.wins} sales from ${room.calls} calls. All money is fictional.</p><button id="nextShift" class="bigbtn" ${!host || !online() ? 'disabled' : ''}>${host ? 'WORK ANOTHER SHIFT →' : 'WAITING FOR HOST'}</button><button id="reviewShift" class="outline">REVIEW OFFICE</button><button id="leaveSummary" class="outline">LEAVE ROOM</button></div>`;
  $('overlay').classList.remove('hidden');
}
function wire() {
  const bind = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  document.querySelectorAll('[data-call]').forEach(b => b.onclick = () => action('call:dial', { npcId: b.dataset.call }));
  document.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => action('computer:answer', { playerId: computerTarget, answer: b.dataset.answer }));
  document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => talk({ joke: 'My manager is three raccoons in an office chair. What is your worst work story?', ask: 'What matters most to you? I want to understand before explaining this ridiculous product.', reassure: 'No pressure at all. Happy to answer questions about the imaginary product.' }[b.dataset.quick]));
  bind('hangBtn', () => { stopListening(); stopSpeech(); action('call:hangup'); }); bind('micBtn', mic);
  bind('dealBtn', () => { stopListening(); action('call:deal'); });
  bind('startShift', () => action('shift:start')); bind('nextShift', () => action('shift:start')); bind('endShift', () => action('shift:end'));
  bind('leaveSummary', leave); bind('reviewShift', () => $('overlay').classList.add('hidden'));
  bind('openComputer', () => { app = 'computer'; computerTarget = playerId; render(); });
  bind('copyCode', async () => { try { await navigator.clipboard.writeText(room.code); notify('Room code copied'); } catch { notify('Room code: ' + room.code); } });
  if ($('computerTarget')) $('computerTarget').onchange = e => { computerTarget = e.target.value; render(); };
  if ($('pitchForm')) $('pitchForm').onsubmit = e => { e.preventDefault(); const text = $('pitchInput').value; $('pitchInput').value = ''; talk(text); };
  if ($('voiceSetting')) $('voiceSetting').onchange = e => { settings.voice = e.target.checked; if (!settings.voice) stopSpeech(); };
  if ($('handsfreeSetting')) $('handsfreeSetting').onchange = e => { settings.handsfree = e.target.checked; if (!settings.handsfree) stopListening(); };
  if ($('rateSetting')) $('rateSetting').onchange = e => { settings.rate = Number(e.target.value); };
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
  if (utterance) { utterance.onend = null; utterance.onerror = null; }
  window.speechSynthesis?.cancel(); utterance = null; speaking = false; finalSpeaking = false;
}
function say(text, npc, final = false) {
  if (!settings.voice || !window.speechSynthesis) return;
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
document.querySelectorAll('.appicon').forEach(b => b.onclick = () => { app = b.dataset.app; stopListening(); render(); });
const pcButton = document.createElement('button'); pcButton.className = 'appicon'; pcButton.dataset.app = 'computer'; pcButton.title = 'Customer computers'; pcButton.innerHTML = '▣<small>COMPUTER</small>';
pcButton.onclick = () => { app = 'computer'; stopListening(); render(); }; document.querySelector('.sidebar').insertBefore(pcButton, document.querySelector('[data-app="ledger"]'));
$('lobbyForm').onsubmit = e => { e.preventDefault(); connect(false); };
$('joinBtn').onclick = () => { if ($('lobbyForm').reportValidity()) connect(true); };
$('exitBtn').onclick = leave;
$('howBtn').onclick = () => {
  $('overlay').innerHTML = '<div class="modal"><div class="kicker">EMPLOYEE ORIENTATION</div><h2>MAKE THE CALL.</h2><p>Connect to your host’s backend, create a private room, and share its code. 2–4 players work different phone lines toward one quota.</p><p>Build trust, fix fictional customer computers, then close ridiculous sales. TALK uses browser recognition; NPCs speak with browser voices. AI is enabled and budgeted by your host.</p><button id="closeHow" class="bigbtn">GOT IT →</button></div>';
  $('overlay').classList.remove('hidden'); $('closeHow').onclick = () => $('overlay').classList.add('hidden');
};
setInterval(() => { stats(); $('osClock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 500);
window.addEventListener('pagehide', () => { stopListening(); stopSpeech(); });
