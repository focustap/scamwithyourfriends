import { appIcon } from './apps.js';

export class Desktop {
  constructor(area,bar) { this.area = area; this.bar = bar; this.windows = new Map(); this.z = 1; }
  open(id,title,bodyId) {
    if (this.windows.has(id)) { const existing = this.windows.get(id); existing.hidden = false; this.focus(id); return existing; }
    const win = document.createElement('section'); win.className = 'window osWindow'; win.dataset.window = id; win.dataset.appKey = id;
    win.setAttribute('aria-label',title); win.style.left = (id === 'operations' ? Math.max(22,this.area.clientWidth - 450) : 22 + this.windows.size * 22) + 'px';
    win.style.top = (id === 'operations' ? 22 : 22 + this.windows.size * 18) + 'px';
    if (id === 'operations') win.classList.add('operationsWindow');
    const header = document.createElement('div'); header.className = 'windowhead';
    const label = document.createElement('span'); label.textContent = title; header.append(label);
    const controls = document.createElement('div'); controls.className = 'windowControls';
    for (const [symbol,action] of [['−','Minimize'],['□','Maximize'],['×','Close']]) {
      const button = document.createElement('button'); button.textContent = symbol; button.title = action + ' ' + title;
      button.setAttribute('aria-label',action + ' ' + title); button.onclick = () => {
        if (action === 'Maximize') { win.classList.toggle('maximized'); return; }
        if (action === 'Minimize') { win.hidden = true; return; }
        win.remove();this.windows.delete(id);this.bar.querySelector('[data-task="'+id+'"]')?.remove();
      }; controls.append(button);
    }
    header.append(controls); win.append(header);
    const body = document.createElement('div'); body.id = bodyId; body.className = 'panelbody'; win.append(body);
    win.onpointerdown = () => this.focus(id);
    header.onpointerdown = event => {
      if (event.target.closest('button') || win.classList.contains('maximized') || innerWidth <= 900) return;
      event.preventDefault(); this.focus(id); header.setPointerCapture(event.pointerId);
      const x = event.clientX, y = event.clientY, left = win.offsetLeft, top = win.offsetTop;
      const move = e => { win.style.left = Math.max(0,Math.min(this.area.clientWidth - Math.min(220,win.offsetWidth),left + e.clientX - x)) + 'px'; win.style.top = Math.max(0,Math.min(this.area.clientHeight - 55,top + e.clientY - y)) + 'px'; };
      const end = () => { header.removeEventListener('pointermove',move); header.removeEventListener('pointerup',end); header.removeEventListener('pointercancel',end); };
      header.addEventListener('pointermove',move); header.addEventListener('pointerup',end); header.addEventListener('pointercancel',end);
    };
    this.area.append(win); this.windows.set(id,win);
    const task = document.createElement('button'); task.className = 'taskButton'; task.dataset.task = id; task.dataset.appKey = id;
    task.innerHTML='<span class="taskIcon">'+appIcon(id)+'</span><span>'+title+'</span>';
    task.onclick = () => { win.hidden = false; this.focus(id); }; this.bar.append(task); this.focus(id); return win;
  }
  focus(id) {
    const win = this.windows.get(id); if (!win) return;
    win.style.zIndex = String(++this.z);
    this.bar.querySelectorAll('[data-task]').forEach(b => b.classList.toggle('active',b.dataset.task === id));
  }
  visible(id) { const win = this.windows.get(id); return win && !win.hidden; }
}

// Arithmetic-only parser for the sandbox calculator. Never eval/Function/shell.
export function calculate(expression) {
  if (typeof expression !== 'string' || expression.length > 80 || /[^0-9.\s+*/()\-]/.test(expression)) throw new Error('Use numbers, parentheses and + − × ÷.');
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*/\-]/g) || []; let i = 0;
  function atom() {
    if (tokens[i] === '-') { i++; return -atom(); }
    if (tokens[i] === '(') { i++; const value = sum(); if (tokens[i++] !== ')') throw new Error('Missing closing parenthesis.'); return value; }
    const token = tokens[i++]; if (!token || !/^\d/.test(token)) throw new Error('Enter a complete calculation.'); return Number(token);
  }
  function product() { let value = atom(); while (['*','/'].includes(tokens[i])) { const op = tokens[i++], right = atom(); value = op === '*' ? value * right : value / right; } return value; }
  function sum() { let value = product(); while (['+','-'].includes(tokens[i])) { const op = tokens[i++], right = product(); value = op === '+' ? value + right : value - right; } return value; }
  const result = sum(); if (i !== tokens.length || !Number.isFinite(result) || Math.abs(result) > 1e9) throw new Error('Invalid or excessively large result.');
  return Math.round(result * 100) / 100;
}
