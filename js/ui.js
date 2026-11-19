// Zinc Grenadine mobile — petits outils d'interface (sans framework)

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
  heart: '<path d="M12 20s-7.5-4.6-9-9.4C2 7.3 4.2 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.1 0 5.3 2.8 4.3 6.1-1.5 4.8-9 9.4-9 9.4z"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  phone: '<path d="M6.6 3.5h2.6l1.5 4-2 1.3a11 11 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.2 2C10.4 19 5 13.6 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  map: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="7" rx=".6"/><rect x="10.5" y="6" width="3" height="12" rx=".6"/><rect x="15.5" y="13.5" width="3" height="4.5" rx=".6"/>',
  file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  receipt: '<path d="M6 3h12v18l-2.2-1.4L13.6 21 12 19.6 10.4 21l-2.2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  cloud: '<path d="M7 18h10.5a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.6 9.6 4.3 4.3 0 0 0 7 18z"/>',
  logout: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  trash: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  team: '<circle cx="12" cy="7.5" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M7 19.5c.6-3.3 2.6-5 5-5s4.4 1.7 5 5M1.8 18c.3-2 1.5-3.2 3.2-3.2M22.2 18c-.3-2-1.5-3.2-3.2-3.2"/>',
};
export const icon = (name, size = 20) => {
  const s = h('span', { class: 'ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
};

export const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const EUR0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const money = (n, round = false) => (round ? EUR0 : EUR).format(num(n));
export const pad = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const LONGY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const longDate = (iso, year = false) => iso ? (year ? LONGY : LONG).format(parseISO(iso)) : '';
export const daysTo = (iso) => Math.round((parseISO(iso) - parseISO(today())) / 86400000);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Messages ---------- */
export function toast(text, kind = 'ok') {
  let host = document.querySelector('.toasts'); if (!host) { host = h('div', { class: 'toasts' }); document.body.append(host); }
  const t = h('div', { class: `toast ${kind}` }, icon(kind === 'ok' ? 'check' : 'alert', 17), h('span', {}, text));
  host.append(t); setTimeout(() => t.classList.add('out'), kind === 'ok' ? 2600 : 5000); setTimeout(() => t.remove(), kind === 'ok' ? 3000 : 5400);
}
export function confirmBox(text, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((res) => {
    const close = (v) => { bg.remove(); res(v); };
    const bg = h('div', { class: 'dialog-bg', onclick: (e) => { if (e.target === bg) close(false); } },
      h('div', { class: 'dialog' }, h('p', {}, text),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Annuler'), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, ok))));
    document.body.append(bg);
  });
}

/* ---------- Feuille plein écran (saisie) ---------- */
/**
 * sheet({ title, body, onSave, saveLabel, extra })
 * onSave : fonction asynchrone ; renvoyer false (ou lever une erreur) laisse la feuille ouverte.
 */
export function sheet({ title, body, onSave, saveLabel = 'Enregistrer', extra = null }) {
  const prevScroll = window.scrollY;
  let busy = false;
  const saveBtn = onSave ? h('button', { class: 'sheet-save', onclick: async () => {
    if (busy) return; busy = true; saveBtn.disabled = true; saveBtn.classList.add('busy');
    try { const r = await onSave(); if (r !== false) close(); }
    catch (e) { toast(e.message || String(e), 'warn'); }
    finally { busy = false; saveBtn.disabled = false; saveBtn.classList.remove('busy'); }
  } }, saveLabel) : null;
  const el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('header', { class: 'sheet-head' }, h('button', { class: 'sheet-cancel', onclick: () => close() }, onSave ? 'Annuler' : 'Fermer'), h('h2', {}, title), saveBtn || h('span', { style: { width: '64px' } })),
    h('div', { class: 'sheet-body' }, body, extra));
  function close() { el.classList.add('out'); document.body.classList.remove('sheet-open'); setTimeout(() => { el.remove(); window.scrollTo(0, prevScroll); }, 180); window.removeEventListener('popstate', onPop); }
  const onPop = () => close();
  document.body.append(el); document.body.classList.add('sheet-open');
  requestAnimationFrame(() => el.classList.add('in'));
  return { close, el };
}

/* ---------- Champs de formulaire liés à un objet ---------- */
export function field(label, control, { hint, wide = true } = {}) {
  return h('label', { class: `fld ${wide ? '' : 'half'}` }, label ? h('span', { class: 'fld-label' }, label) : null, control, hint ? h('span', { class: 'fld-hint' }, hint) : null);
}
/**
 * input(obj, key, opts) : type text|number|date|time|email|tel|textarea|select|checkbox
 * options pour select : [[valeur, libellé], …] ou [valeur, …]
 */
export function input(obj, key, { type = 'text', options = [], placeholder = '', onChange, text = '', rows = 3, inputmode, disabled } = {}) {
  const set = (v) => { obj[key] = v; onChange && onChange(v); };
  if (type === 'select') {
    const s = h('select', { disabled }, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(obj[key] ?? '') === String(v) }, l); }));
    s.addEventListener('change', () => set(s.value)); return s;
  }
  if (type === 'checkbox') {
    const c = h('input', { type: 'checkbox', disabled }); c.checked = !!obj[key];
    c.addEventListener('change', () => set(c.checked));
    return h('span', { class: 'check' }, c, h('span', {}, text));
  }
  if (type === 'textarea') { const t = h('textarea', { rows, placeholder, disabled }); t.value = obj[key] ?? ''; t.addEventListener('input', () => set(t.value)); return t; }
  const i = h('input', { type: type === 'number' ? 'text' : type, placeholder, disabled, inputmode: inputmode || (type === 'number' ? 'decimal' : null), autocomplete: 'off' });
  i.value = obj[key] ?? '';
  i.addEventListener('input', () => set(type === 'number' ? i.value : i.value));
  i.addEventListener('change', () => set(i.value));
  return i;
}
export function segmented(options, value, onPick) {
  return h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { class: `seg-btn ${v === value ? 'on' : ''}`, onclick: () => onPick(v) }, l)));
}
export const badge = (text, tone = 'neutral') => h('span', { class: `badge ${tone}` }, text);
export const empty = (text, ic = 'book') => h('div', { class: 'empty' }, icon(ic, 34), h('p', {}, text));
