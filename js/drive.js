// Zinc Grenadine mobile — accès au dossier partagé « ZincGrenadine-base » sur Google Drive.
//
// Le dossier a exactement le format de l'application ordinateur (voir storage.js) :
//   <collection>/<id>.json   une fiche par fichier : { by, device, at, deleted, data }
//   docs/settings.json, docs/moduleData.json, docs/meta.json
//   pieces/<id>.jpg           photos des pièces justificatives ; archives/<nom>  comptes rendus et documents
// Le site lit les fiches (avec un cache sur le téléphone pour ne retélécharger que ce qui a changé)
// et écrit les fiches qu'il crée ou modifie dans ce même format : l'application ordinateur les reçoit
// par la synchronisation de Google Drive comme si elles venaient d'un autre poste.

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER = 'application/vnd.google-apps.folder';
const BASE_NAME = 'ZincGrenadine-base';
const ID_RE = /^[A-Za-z0-9_-]+\.json$/;
const ALL = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
export const COLLECTIONS = ['clients', 'invoices', 'entries', 'pieces', 'editions', 'catalog', 'grants', 'donations', 'receipts', 'members', 'people', 'meetings'];
/** Collections chargées à l'ouverture ; les autres (écritures comptables…) seulement quand un écran en a besoin */
export const START = ['clients', 'editions', 'donations', 'receipts', 'members', 'people', 'meetings'];

export class AuthError extends Error { constructor(m = 'Connexion Google expirée') { super(m); this.auth = true; } }
export class ConflictError extends Error { constructor(m) { super(m); this.conflict = true; } }

const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem('zgm.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem('zgm.' + k) : localStorage.setItem('zgm.' + k, JSON.stringify(v)); } catch {} },
};
export const prefs = ls;

/* ---------- Cache local (IndexedDB) : fiches déjà téléchargées, par identifiant de fichier Drive ---------- */
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    const r = indexedDB.open('zinc-mobile', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }).catch(() => null);
  return idbP;
}
async function cacheAll() {
  const db = await idb(); if (!db) return new Map();
  return new Promise((res) => {
    const out = new Map(), tx = db.transaction('files'), st = tx.objectStore('files');
    const c = st.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.set(cur.key, cur.value); cur.continue(); };
    c.onerror = () => res(out);
  });
}
async function cachePut(items) {
  const db = await idb(); if (!db || !items.length) return;
  await new Promise((res) => { const tx = db.transaction('files', 'readwrite'), st = tx.objectStore('files'); for (const [k, v] of items) st.put(v, k); tx.oncomplete = res; tx.onerror = res; });
}
export async function clearCache() {
  const db = await idb(); if (!db) return;
  await new Promise((res) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').clear(); tx.oncomplete = res; tx.onerror = res; });
}

/* ---------- Connexion Google (Google Identity Services, jeton d'accès d'une heure) ---------- */
let token = ls.get('token'), tokenClient = null, gisP = null;
const tokenOk = () => token && token.exp > Date.now() + 60000;
export const signedIn = () => tokenOk();
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisP) gisP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Impossible de joindre Google : vérifiez la connexion Internet')); };
    document.head.append(s);
  });
  return gisP;
}
export async function prepareAuth(clientId) { await loadGis(); if (!tokenClient) tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} }); }
/** Ouvre la fenêtre de connexion Google (doit suivre un geste de l'utilisateur) */
export function signIn(clientId, { hint } = {}) {
  return prepareAuth(clientId).then(() => new Promise((res, rej) => {
    tokenClient.callback = (r) => {
      if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Accès refusé' : r.error_description || r.error));
      token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }; ls.set('token', token); res(token);
    };
    tokenClient.error_callback = (e) => rej(new Error(e?.type === 'popup_closed' ? 'Fenêtre de connexion fermée' : 'Connexion impossible'));
    tokenClient.requestAccessToken({ prompt: hint ? '' : 'select_account', login_hint: hint || undefined });
  }));
}
export function signOut() {
  if (token?.value && window.google?.accounts?.oauth2) try { window.google.accounts.oauth2.revoke(token.value, () => {}); } catch {}
  token = null; ls.set('token', null);
}

async function api(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (!tokenOk()) throw new AuthError();
  let r;
  try { r = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + token.value, ...headers } }); }
  catch { throw new Error('Pas de connexion Internet'); }
  if (r.status === 401) { token = null; ls.set('token', null); throw new AuthError(); }
  if (!r.ok) {
    let msg = `Google Drive a répondu ${r.status}`;
    try { const j = await r.json(); if (j.error?.message) msg += ' : ' + j.error.message; } catch {}
    if (r.status === 403 && /insufficient|scope/i.test(msg)) throw new AuthError('Autorisation Google Drive manquante : reconnectez-vous et cochez l’accès à Drive');
    throw new Error(msg);
  }
  return raw ? r : r.status === 204 ? null : r.json();
}
const q = (s) => encodeURIComponent(s);
/** Valeur texte dans une requête Drive : barres obliques inverses et apostrophes échappées */
const qstr = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function listAll(query, fields = 'id,name,modifiedTime,parents,size,mimeType') {
  const out = []; let page = '';
  do {
    const j = await api(`${API}/files?q=${q(query)}&fields=${q(`nextPageToken,files(${fields})`)}&pageSize=1000&${ALL}${page ? '&pageToken=' + q(page) : ''}`);
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}
export async function whoAmI() { const j = await api(`${API}/about?fields=user(displayName,emailAddress)`); return j.user || {}; }

/* ---------- Dossier de la base ---------- */
/** Dossiers « ZincGrenadine-base » visibles par ce compte (le sien ou partagés avec lui) */
/** Dossier où l'application sur ordinateur dépose les données d'une simulation */
export const SIM_DIR = 'Simulation (données fictives)';
export async function findBases() {
  const list = await listAll(`name='${BASE_NAME}' and mimeType='${FOLDER}' and trashed=false`, 'id,name,modifiedTime,parents,owners(displayName,emailAddress),driveId');
  for (const f of list) {
    const p = f.parents?.[0];
    if (p) try { const j = await api(`${API}/files/${p}?fields=name&${ALL}`); f.parentName = j.name; } catch { f.parentName = ''; }
  }
  for (const f of list) f.simulation = f.parentName === SIM_DIR;
  // la vraie base d'abord
  return list.sort((a, b) => a.simulation - b.simulation);
}

/* ---------- La base en mémoire ---------- */
export class DriveBase {
  constructor(baseId, { user, device }) {
    this.baseId = baseId; this.user = user || 'Mobile'; this.device = device;
    this.folders = new Map();   // nom du sous-dossier → identifiant Drive
    this.index = new Map();     // "collection/id" → { fileId, mt }
    this.db = { settings: {}, moduleData: {} };
    this.loaded = new Set();
  }
  async folderIds() {
    const list = await listAll(`'${this.baseId}' in parents and mimeType='${FOLDER}' and trashed=false`, 'id,name');
    this.folders = new Map(list.map(f => [f.name, f.id]));
    if (!this.folders.has('docs')) throw new Error('Ce dossier ne contient pas de base Zinc Grenadine (sous-dossier « docs » absent)');
  }
  async folder(name) {
    if (this.folders.has(name)) return this.folders.get(name);
    const f = await api(`${API}/files?fields=id&${ALL}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [this.baseId] }) });
    this.folders.set(name, f.id); return f.id;
  }
  /** Ouverture hors connexion : dernière version connue sur ce téléphone */
  async fromCache() {
    const cache = await cacheAll(), best = new Map();
    for (const [fileId, v] of cache) {
      if (v.base !== this.baseId || !v.rec) continue;
      const k = `${v.col}/${v.id}`, cur = best.get(k);
      if (!cur || String(v.rec.at) > String(cur.v.rec.at)) best.set(k, { fileId, v });
    }
    this.apply(best);
    return best.size;
  }
  apply(best, cols) {
    const fresh = {};
    for (const c of cols || []) if (c !== 'docs') fresh[c] = [];
    for (const [k, { fileId, v }] of best) {
      this.index.set(k, { fileId, mt: v.mt });
      const [col, id] = k.split('/');
      if (cols && !cols.includes(col)) continue;
      if (col === 'docs') { if (!v.rec.deleted) { if (id === 'meta') Object.assign(this.db, { version: v.rec.data?.version }); else this.db[id] = v.rec.data; } continue; }
      (fresh[col] ||= []);
      if (!v.rec.deleted && v.rec.data) fresh[col].push(v.rec.data);
      this.loaded.add(col);
    }
    for (const [col, list] of Object.entries(fresh)) this.db[col] = list;
  }
  /**
   * Charge (ou recharge) des collections : liste les fichiers, ne télécharge que ceux qui ont changé.
   * onProgress(fait, total)
   */
  async load(cols = START, onProgress = () => {}) {
    if (!this.folders.size) await this.folderIds();
    const subs = ['docs', ...cols].filter(c => this.folders.has(c));
    const byId = new Map(subs.map(c => [this.folders.get(c), c]));
    const files = [];
    for (let i = 0; i < subs.length; i += 15) {
      const part = subs.slice(i, i + 15).map(c => `'${this.folders.get(c)}' in parents`).join(' or ');
      files.push(...await listAll(`(${part}) and trashed=false and mimeType!='${FOLDER}'`));
    }
    const cache = await cacheAll(), todo = [], best = new Map(), put = [];
    const wanted = files.filter(f => ID_RE.test(f.name));
    for (const f of wanted) {
      const col = byId.get(f.parents?.find(p => byId.has(p))); if (!col) continue;
      const id = f.name.slice(0, -5);
      if (col === 'docs' && !['settings', 'moduleData', 'meta', 'categories', 'simulation'].includes(id)) continue;
      const c = cache.get(f.id);
      if (c && c.mt === f.modifiedTime && c.rec) consider(col, id, f.id, c);
      else todo.push({ f, col, id });
    }
    function consider(col, id, fileId, v) {
      const k = `${col}/${id}`, cur = best.get(k);
      // deux fichiers de même nom (copie faite par la synchronisation) : la version la plus récente l'emporte
      if (!cur || String(v.rec.at) > String(cur.v.rec.at)) best.set(k, { fileId, v });
    }
    let done = 0; onProgress(0, todo.length);
    const worker = async () => {
      while (todo.length) {
        const { f, col, id } = todo.shift();
        try {
          const rec = await api(`${API}/files/${f.id}?alt=media&${ALL}`);
          const v = { base: this.baseId, col, id, mt: f.modifiedTime, rec };
          put.push([f.id, v]); consider(col, id, f.id, v);
        } catch (e) { if (e.auth) throw e; /* fichier illisible (en cours d'écriture) : repris au prochain chargement */ }
        onProgress(++done, done + todo.length);
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));
    await cachePut(put);
    for (const c of cols) if (!this.db[c]) this.db[c] = [];
    this.apply(best, ['docs', ...cols]);
    for (const c of cols) this.loaded.add(c);
    return { files: wanted.length, downloaded: put.length };
  }

  wrap(data, deleted = false) {
    return JSON.stringify({ by: this.user, device: this.device, at: new Date().toISOString(), deleted, data: deleted ? null : data }, null, 1);
  }
  async upload({ parent, name, fileId, blob, mime }) {
    if (fileId) return api(`${UP}/files/${fileId}?uploadType=media&fields=id,modifiedTime&${ALL}`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: blob });
    const boundary = 'zg' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: [parent], mimeType: mime });
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
    return api(`${UP}/files?uploadType=multipart&fields=id,modifiedTime&${ALL}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  }
  /**
   * Enregistre une fiche. Si elle a été modifiée sur un autre poste depuis son chargement,
   * la version à jour est rechargée et l'enregistrement refusé (ConflictError) pour ne rien écraser.
   */
  async save(col, data, { deleted = false } = {}) {
    const key = `${col}/${data.id}`, known = this.index.get(key);
    if (known) {
      const cur = await api(`${API}/files/${known.fileId}?fields=modifiedTime,trashed&${ALL}`).catch(e => { if (e.auth) throw e; return null; });
      if (cur && !cur.trashed && cur.modifiedTime !== known.mt) {
        const rec = await api(`${API}/files/${known.fileId}?alt=media&${ALL}`);
        await cachePut([[known.fileId, { base: this.baseId, col, id: data.id, mt: cur.modifiedTime, rec }]]);
        known.mt = cur.modifiedTime; this.replace(col, data.id, rec.deleted ? null : rec.data);
        throw new ConflictError(`Cette fiche vient d’être modifiée par ${rec.by || 'un autre poste'} : la version à jour est affichée, refaites votre modification.`);
      }
      if (cur && cur.trashed) { this.index.delete(key); return this.save(col, data, { deleted }); }
    }
    const text = this.wrap(data, deleted);
    const r = await this.upload({ parent: await this.folder(col), name: data.id + '.json', fileId: known?.fileId, blob: new Blob([text], { type: 'application/json' }), mime: 'application/json' });
    this.index.set(key, { fileId: r.id, mt: r.modifiedTime });
    await cachePut([[r.id, { base: this.baseId, col, id: data.id, mt: r.modifiedTime, rec: JSON.parse(text) }]]);
    this.replace(col, data.id, deleted ? null : data);
    return data;
  }
  remove(col, data) { return this.save(col, data, { deleted: true }); }
  replace(col, id, data) {
    const list = (this.db[col] ||= []), i = list.findIndex(x => x.id === id);
    if (!data) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = data; else list.push(data);
  }
  /** Envoie un fichier (photo de pièce, document) dans un sous-dossier de la base */
  async putFile(sub, name, blob) {
    const r = await this.upload({ parent: await this.folder(sub), name, blob, mime: blob.type || 'application/octet-stream' });
    return r.id;
  }
  /** Télécharge un fichier joint (comptes rendus, statuts…) rangé dans « archives » */
  async getFile(sub, name) {
    const parent = await this.folder(sub);
    const list = await listAll(`'${parent}' in parents and name='${qstr(name)}' and trashed=false`);
    if (!list.length) throw new Error('Fichier introuvable sur le Drive (pas encore synchronisé ?)');
    const r = await api(`${API}/files/${list[0].id}?alt=media&${ALL}`, { raw: true });
    return r.blob();
  }
}
