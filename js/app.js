// Zinc Grenadine mobile — écrans (accueil, contacts, dons, adhésions, réunions, équipe, budget, justificatifs)
import { DriveBase, START, prefs, signIn, signOut, signedIn, whoAmI, findBases, clearCache, prepareAuth } from './drive.js';
import { h, icon, num, round2, money, today, fmtDate, longDate, daysTo, uid, clone, norm, toast, confirmBox, sheet, field, input, segmented, badge, empty } from './ui.js';

const VERSION = '1.7.0';
const CFG = window.ZINC_CONFIG || {};
const view = document.getElementById('view');
/** append sans « null » : ignore les valeurs vides et aplatit les tableaux */
const fill = (el, ...kids) => { el.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); return el; };
const S = { base: null, offline: false, user: null, loadedAt: 0, busy: false };
const db = () => S.base.db;
const list = (c) => db()[c] || [];
const settings = () => db().settings || {};
const isSim = () => !!(S.base && db().simulation?.simulation);
const COLL = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/* ---------- Données ---------- */
const CATS = [
  { id: 'exposant', label: 'Exposants', one: 'Exposant', types: ['Éditeur', 'Libraire', 'Autre exposant'] },
  { id: 'ecole', label: 'Écoles', one: 'École ou collectivité', types: ['École maternelle', 'École élémentaire', 'Collège', 'Lycée', 'Établissement privé', 'Médiathèque', 'Commune', 'Intercommunalité', 'Département', 'Région', 'Service de l’État', 'Autre organisme public'] },
  { id: 'partenaire', label: 'Partenaires', one: 'Partenaire ou mécène', types: ['Partenaire', 'Mécène (entreprise)', 'Donateur (particulier)', 'Fondation', 'Association', 'Média'] },
  { id: 'auteur', label: 'Auteurs', one: 'Auteur ou illustrateur', types: ['Auteur', 'Illustrateur', 'Auteur-illustrateur', 'Traducteur', 'Conteur', 'Autre intervenant'] },
];
const catOf = (id) => CATS.find(c => c.id === id) || CATS[0];
const contactName = (c) => !c ? '' : c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
const getClient = (id) => id ? list('clients').find(c => c.id === id) : null;
const fullName = (p) => [p?.firstName, p?.name].filter(Boolean).join(' ');
const editions = () => list('editions').slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
const getEdition = (id) => id ? list('editions').find(e => e.id === id) : null;
function currentEdition() {
  const l = editions();
  return getEdition(settings().currentEditionId) || l.find(e => (e.end || e.start || '') >= today()) || l[l.length - 1] || null;
}
const editionOptions = (blank) => [['', blank], ...editions().slice().reverse().map(e => [e.id, e.name])];
const membership = () => settings().membership || { season: 'civile', rates: [] };
function seasonOf(date = today()) {
  const y = +date.slice(0, 4), m = +date.slice(5, 7);
  if (membership().season === 'scolaire') return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  return String(y);
}
const receiptOf = (d) => list('receipts').find(r => !r.cancelled && (r.donationIds || []).includes(d.id));
const receiptEligible = (d) => d.donorType === 'particulier' && num(d.amount) > 0 && !!d.date;
const MEETING_TYPES = { ag: ['Assemblée générale', 'AG', 'adherents'], age: ['AG extraordinaire', 'AGE', 'adherents'], ca: ['Conseil d’administration', 'CA', 'ca'], bureau: ['Réunion de bureau', 'Bureau', 'bureau'], commission: ['Commission', 'Commission', 'choix'], benevoles: ['Réunion des bénévoles', 'Bénévoles', 'benevoles'] };
const mtype = (id) => MEETING_TYPES[id] || MEETING_TYPES.ca;
const BUREAU_ROLES = ['Co-président(e)', 'Vice-président(e)', 'Trésorier(ère)', 'Trésorier(ère) adjoint(e)', 'Secrétaire', 'Secrétaire adjoint(e)', 'Membre du bureau'];
const inCA = (p, d = today()) => !!p.ca && (!p.caSince || p.caSince <= d) && (!p.caEnd || p.caEnd >= d);
const inBureau = (p, d) => inCA(p, d) && !!p.bureauRole;
function invitedOf(m) {
  const t = mtype(m.type)[2], ppl = list('people');
  if (t === 'ca' || t === 'adherents') return ppl.filter(p => inCA(p, m.date));
  if (t === 'bureau') return ppl.filter(p => inBureau(p, m.date));
  if (t === 'benevoles') return ppl.filter(p => p.volunteer);
  return (m.invited || []).map(id => ppl.find(p => p.id === id)).filter(Boolean);
}
const upcoming = () => list('meetings').filter(m => m.status !== 'annulee' && m.date >= today()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

/* ---------- Enregistrement ---------- */
function canWrite() {
  if (S.offline) { toast('Hors connexion : consultation seulement. Reconnectez-vous pour enregistrer.', 'warn'); return false; }
  if (!signedIn()) { authBanner(); toast('Connexion Google expirée : touchez « Se reconnecter »', 'warn'); return false; }
  return true;
}
async function save(col, data, opts) {
  try { await S.base.save(col, data, opts); }
  catch (e) {
    if (e.auth) authBanner();
    if (e.conflict) render();
    throw e;
  }
}

/* ---------- Coquille : en-tête, onglets ---------- */
const TABS = [['accueil', 'Accueil', 'home'], ['contacts', 'Contacts', 'users'], ['dons', 'Dons', 'heart'], ['adhesions', 'Adhésions', 'idcard'], ['plus', 'Plus', 'more']];
const MORE = [['reunions', 'Réunions et comptes rendus', 'calendar'], ['equipe', 'CA, bureau et bénévoles', 'team'], ['budget', 'Budget de l’édition', 'chart'], ['piece', 'Photographier un justificatif', 'camera'], ['reglages', 'Compte et réglages', 'gear']];
function shell(title, content, { back, action } = {}) {
  const tab = (location.hash.slice(2).split('/')[0]) || 'accueil';
  const active = MORE.some(([id]) => id === tab) ? 'plus' : tab;
  view.innerHTML = '';
  document.body.classList.toggle('sim', isSim());
  fill(view,
    h('header', { class: 'top' },
      back ? h('button', { class: 'top-btn', 'aria-label': 'Retour', onclick: () => history.length > 1 ? history.back() : go(back) }, icon('back', 22))
        : tab === 'accueil' ? null : h('img', { class: 'top-mark', src: 'img/icon-192.png', alt: '' }),
      tab === 'accueil' && !back ? h('div', { class: 'top-brand' }, h('img', { class: 'top-logo', src: 'img/logo.png', alt: 'Zinc Grenadine' })) : h('h1', {}, title),
      action || h('button', { class: `top-btn ${S.busy ? 'spin' : ''}`, 'aria-label': 'Actualiser', onclick: () => refresh() }, icon(S.offline ? 'cloud' : 'refresh', 21))),
    isSim() ? h('div', { class: 'banner sim', role: 'button', onclick: () => go('reglages') }, icon('alert', 16), h('span', {}, h('b', {}, 'SIMULATION'), db().simulation.at ? ` du ${fmtDate(db().simulation.at)}` : '', ' · données fictives, rien n’arrive dans la vraie base')) : null,
    S.offline ? h('div', { class: 'banner warn' }, icon('cloud', 16), h('span', {}, 'Hors connexion : dernières données connues, consultation seulement.'), h('button', { class: 'link', onclick: () => login() }, 'Se connecter')) : null,
    h('main', { class: 'page' }, content),
    h('nav', { class: 'tabs' }, TABS.map(([id, label, ic]) => h('a', { href: '#/' + id, class: `tab ${active === id ? 'on' : ''}` }, icon(ic, 23), h('span', {}, label)))));
}
const go = (path) => { location.hash = '#/' + path; };
function fab(label, onClick) { return h('button', { class: 'fab', 'aria-label': label, onclick: onClick }, icon('plus', 26)); }
function authBanner() {
  if (document.querySelector('.banner.auth')) return;
  const b = h('div', { class: 'banner auth' }, icon('alert', 16), h('span', {}, 'Connexion Google expirée.'), h('button', { class: 'link', onclick: async () => { try { await signIn(CFG.clientId, { hint: S.user?.emailAddress }); b.remove(); toast('Reconnecté'); } catch (e) { toast(e.message, 'warn'); } } }, 'Se reconnecter'));
  document.body.append(b);   // au-dessus des feuilles de saisie : on se reconnecte sans perdre ce qui est tapé
}
/** Longues listes : 200 lignes, puis « Afficher plus » (affichage rapide sur téléphone) */
const shownFor = {};
function more(key, total, rerender) {
  const n = shownFor[key] || 200;
  return total > n ? h('button', { class: 'btn wide', onclick: () => { shownFor[key] = n + 200; rerender(); } }, `Afficher plus (${n} sur ${total})`) : null;
}
const sectionTitle = (t, extra) => h('div', { class: 'sec' }, h('h2', {}, t), extra || null);
const row = ({ title, sub, right, onClick, lead }) => h(onClick ? 'button' : 'div', { class: 'row', onclick: onClick }, lead || null,
  h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title), sub ? h('div', { class: 'row-sub' }, sub) : null), right ?? null, onClick ? icon('chevron', 17) : null);
const avatar = (text, tone = '') => h('span', { class: `avatar ${tone}` }, String(text || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase());
const searchInput = (value, onInput, placeholder) => {
  const i = h('input', { type: 'search', placeholder, value, enterkeyhint: 'search' });
  i.addEventListener('input', () => onInput(i.value));
  return h('div', { class: 'search' }, icon('search', 18), i);
};

/* ---------- Accueil ---------- */
function pageAccueil() {
  const ed = currentEdition(), y = today().slice(0, 4), season = seasonOf();
  const dons = list('donations').filter(d => String(d.date).startsWith(y));
  const adh = list('members').filter(m => m.season === season);
  const next = upcoming().slice(0, 3);
  let edBox = null;
  if (ed) {
    const d = ed.start ? daysTo(ed.start) : null, endD = ed.end || ed.start;
    const state = !ed.start ? 'Dates à fixer' : d > 0 ? `J − ${d}` : today() <= endD ? 'En cours' : 'Terminée';
    edBox = h('button', { class: 'hero', onclick: () => go('budget') },
      h('div', { class: 'hero-top' }, badge(state, d > 0 && d <= 30 ? 'accent' : 'light'), ed.number ? h('span', { class: 'hero-num' }, `${ed.number}e édition`) : null),
      h('div', { class: 'hero-title' }, ed.name),
      ed.theme ? h('div', { class: 'hero-theme' }, `« ${ed.theme} »`) : null,
      h('div', { class: 'hero-sub' }, ed.start ? (ed.end && ed.end !== ed.start ? `${longDate(ed.start)} → ${longDate(ed.end, true)}` : longDate(ed.start, true)) : 'Dates à fixer', ed.place ? ` · ${ed.place}` : ''),
      h('div', { class: 'dots' }));
  }
  const quick = (label, ic, fn, tone = '') => h('button', { class: `quick ${tone}`, onclick: fn }, icon(ic, 24), h('span', {}, label));
  shell('Zinc Grenadine', [
    h('p', { class: 'hello' }, `Bonjour${S.user?.displayName ? ' ' + S.user.displayName.split(' ')[0] : ''} !`),
    edBox,
    h('div', { class: 'quick-grid' },
      quick('Justificatif', 'camera', () => editPiece(), 'red'),
      quick('Nouveau don', 'heart', () => editDonation(null), 'orange'),
      quick('Adhésion', 'idcard', () => editMember(null), 'yellow'),
      quick('Contact', 'users', () => editContact(null))),
    h('div', { class: 'stats' },
      h('button', { class: 'stat', onclick: () => go('dons') }, h('b', {}, money(dons.reduce((s, d) => s + num(d.amount), 0), true)), h('span', {}, `${dons.length} don${dons.length > 1 ? 's' : ''} en ${y}`)),
      h('button', { class: 'stat', onclick: () => go('adhesions') }, h('b', {}, adh.length), h('span', {}, `adhérent${adh.length > 1 ? 's' : ''} ${season}`)),
      h('button', { class: 'stat', onclick: () => go('contacts') }, h('b', {}, list('clients').length), h('span', {}, 'contacts'))),
    sectionTitle('Prochaines réunions', h('a', { href: '#/reunions', class: 'link' }, 'Tout voir')),
    next.length ? h('div', { class: 'card list' }, next.map(meetingRow)) : h('div', { class: 'card muted pad' }, 'Aucune réunion prévue.'),
    h('p', { class: 'foot' }, S.loadedAt ? `Données à jour à ${new Date(S.loadedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''),
  ]);
}
function meetingRow(m) {
  const t = mtype(m.type), d = daysTo(m.date);
  return row({
    lead: h('div', { class: 'datebox' }, h('b', {}, m.date.slice(8, 10)), h('span', {}, new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(m.date + 'T12:00')).replace('.', ''))),
    title: m.title || t[0], sub: [longDate(m.date), m.time ? m.time.replace(':', ' h ') : '', m.place].filter(Boolean).join(' · '),
    right: m.status === 'annulee' ? badge('Annulée', 'muted') : m.status === 'tenue' ? badge(m.minutes || (m.files || []).length ? 'CR' : 'CR à faire', m.minutes || (m.files || []).length ? 'ok' : 'warn') : badge(d === 0 ? 'Aujourd’hui' : d > 0 ? `J − ${d}` : t[1], d >= 0 && d <= 7 ? 'accent' : 'info'),
    onClick: () => go('reunions/' + m.id),
  });
}

/* ---------- Contacts ---------- */
let cQuery = '', cCat = '';
function pageContacts() {
  const all = list('clients');
  const qn = norm(cQuery);
  const items = all.filter(c => (!cCat || c.category === cCat) && (!qn || norm([contactName(c), c.contact, c.city, c.type, c.email].join(' ')).includes(qn)))
    .sort((a, b) => COLL.compare(contactName(a), contactName(b)));
  const host = h('div', { class: 'card list' });
  const draw = () => { host.innerHTML = ''; host.append(...(items.length ? items.slice(0, 400).map(c => row({ lead: avatar(contactName(c), c.category), title: contactName(c) || '(sans nom)', sub: [c.type, c.city].filter(Boolean).join(' · '), onClick: () => showContact(c) })) : [empty(all.length ? 'Aucun contact ne correspond.' : 'Aucun contact pour l’instant.', 'users')])); };
  draw();
  shell('Contacts', [
    searchInput(cQuery, (v) => { cQuery = v; pageContacts(); document.querySelector('.search input')?.focus(); }, 'Rechercher un nom, une ville…'),
    h('div', { class: 'chips' }, [['', 'Tous'], ...CATS.map(c => [c.id, c.label])].map(([id, l]) => h('button', { class: `chip ${cCat === id ? 'on' : ''}`, onclick: () => { cCat = id; pageContacts(); } }, l, h('span', { class: 'chip-n' }, id ? all.filter(c => c.category === id).length : all.length)))),
    host, items.length > 400 ? h('p', { class: 'foot' }, `400 premiers sur ${items.length} : affinez la recherche.`) : null,
    fab('Nouveau contact', () => editContact(null)),
  ]);
  const i = document.querySelector('.search input'); if (cQuery && i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
const mapHref = (c) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.address, c.zip, c.city].filter(Boolean).join(' '));
function showContact(c) {
  const eds = (c.editionIds || []).map(getEdition).filter(Boolean);
  const info = (label, value) => value ? h('div', { class: 'info' }, h('span', {}, label), h('b', {}, value)) : null;
  const body = h('div', {},
    h('div', { class: 'id-head' }, avatar(contactName(c), c.category), h('div', {}, h('div', { class: 'id-name' }, contactName(c)), h('div', { class: 'muted' }, [catOf(c.category).one, c.type].filter(Boolean).join(' · ')))),
    h('div', { class: 'actions3' },
      c.phone ? h('a', { class: 'act', href: telHref(c.phone) }, icon('phone'), 'Appeler') : null,
      c.email ? h('a', { class: 'act', href: 'mailto:' + c.email }, icon('mail'), 'Écrire') : null,
      c.address || c.city ? h('a', { class: 'act', href: mapHref(c), target: '_blank', rel: 'noopener' }, icon('map'), 'Itinéraire') : null),
    h('div', { class: 'card pad infos' },
      info('Personne à contacter', c.contact), info('Téléphone', c.phone), info('E-mail', c.email),
      info('Adresse', [c.address, [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join('\n')),
      info('Site', c.website), info('SIRET', c.siret),
      eds.length ? info('Éditions', eds.map(e => e.short || e.name).join(', ')) : null,
      info('Notes', c.notes)));
  const s = sheet({ title: 'Contact', body, extra: h('button', { class: 'btn wide', onclick: () => { s.close(); editContact(c); } }, 'Modifier la fiche') });
}
function editContact(src, onDone) {
  const isNew = !src;
  const d = src ? clone(src) : { id: uid(), category: cCat || 'exposant', type: catOf(cCat || 'exposant').types[0], code: '', name: '', contact: '', email: '', phone: '', address: '', zip: '', city: '', country: 'FR', siret: '', tvaIntra: '', serviceCode: '', einvoiceAddress: '', website: '', editionIds: [], notes: '' };
  const host = h('div', { class: 'form' });
  const draw = () => {
    host.innerHTML = '';
    const cat = catOf(d.category);
    fill(host,
      field('Catégorie', input(d, 'category', { type: 'select', options: CATS.map(c => [c.id, c.one]), onChange: () => { d.type = catOf(d.category).types[0]; draw(); } })),
      field('Type', input(d, 'type', { type: 'select', options: cat.types })),
      field(d.category === 'auteur' ? 'Nom (prénom et nom)' : 'Nom / raison sociale', input(d, 'name')),
      d.category === 'auteur' ? null : field('Personne à contacter', input(d, 'contact', { placeholder: 'Prénom Nom, fonction' })),
      field('Téléphone', input(d, 'phone', { type: 'tel' })), field('E-mail', input(d, 'email', { type: 'email' })),
      field('Adresse', input(d, 'address', { type: 'textarea', rows: 2 })),
      h('div', { class: 'pair' }, field('Code postal', input(d, 'zip', { inputmode: 'numeric' }), { wide: false }), field('Ville', input(d, 'city'), { wide: false })),
      d.category === 'auteur' ? field('Site ou portfolio', input(d, 'website', { type: 'url' })) : field('SIREN ou SIRET', input(d, 'siret', { inputmode: 'numeric' })),
      field('Notes', input(d, 'notes', { type: 'textarea', rows: 3 })));
  };
  draw();
  sheet({ title: isNew ? 'Nouveau contact' : 'Modifier le contact', body: host, onSave: async () => {
    if (!canWrite()) return false;
    if (!String(d.name).trim()) { toast('Indiquez le nom', 'warn'); return false; }
    d.name = d.name.trim(); if (isNew) d.createdAt = new Date().toISOString();
    await save('clients', d); toast(isNew ? 'Contact créé' : 'Contact modifié'); onDone ? onDone(d) : render();
  } });
}

/* ---------- Dons ---------- */
const DONOR_TYPES = [['particulier', 'Particulier'], ['entreprise', 'Entreprise (mécénat)'], ['association', 'Association ou fondation']];
const DON_METHODS = ['Chèque', 'Virement', 'Espèces', 'Carte bancaire', 'Prélèvement', 'HelloAsso / paiement en ligne'];
let dYear = null, dQuery = '';
function pageDons() {
  const all = list('donations');
  const years = [...new Set([today().slice(0, 4), ...all.map(d => String(d.date).slice(0, 4))])].filter(Boolean).sort().reverse();
  dYear ||= years[0];
  const qn = norm(dQuery);
  const items = all.filter(d => String(d.date).startsWith(dYear) && (!qn || norm([d.donor?.name, d.donor?.firstName, d.donor?.city, contactName(getClient(d.contactId))].join(' ')).includes(qn)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = items.reduce((s, d) => s + num(d.amount), 0);
  const todo = items.filter(d => receiptEligible(d) && !receiptOf(d)).length;
  shell('Dons', [
    h('div', { class: 'chips' }, years.slice(0, 6).map(y => h('button', { class: `chip ${y === dYear ? 'on' : ''}`, onclick: () => { dYear = y; pageDons(); } }, y))),
    h('div', { class: 'stats two' }, h('div', { class: 'stat' }, h('b', {}, money(total)), h('span', {}, `${items.length} don${items.length > 1 ? 's' : ''}`)),
      h('div', { class: 'stat' }, h('b', {}, todo), h('span', {}, 'reçu(s) fiscal(aux) à établir'))),
    searchInput(dQuery, (v) => { dQuery = v; pageDons(); const i = document.querySelector('.search input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 'Rechercher un donateur'),
    items.length ? h('div', { class: 'card list' }, items.slice(0, shownFor.dons || 200).map(d => {
      const r = receiptOf(d);
      return row({ title: donorName(d), sub: [fmtDate(d.date), d.nature && d.nature !== 'numeraire' ? 'en nature' : d.method, getEdition(d.editionId)?.short].filter(Boolean).join(' · '),
        right: h('div', { class: 'amount' }, h('b', {}, money(d.amount)), r ? badge(r.number, 'ok') : receiptEligible(d) ? badge('reçu à faire', 'warn') : null), onClick: () => editDonation(d) });
    })) : empty('Aucun don enregistré pour cette année.', 'heart'),
    more('dons', items.length, pageDons),
    h('p', { class: 'foot' }, 'Les reçus fiscaux s’établissent depuis l’application sur ordinateur.'),
    fab('Nouveau don', () => editDonation(null)),
  ]);
}
const donorName = (d) => d.donorType === 'particulier' ? [d.donor?.firstName, d.donor?.name].filter(Boolean).join(' ') || contactName(getClient(d.contactId)) : d.donor?.name || contactName(getClient(d.contactId)) || '(donateur)';
function editDonation(src) {
  const isNew = !src;
  const d = src ? clone(src) : { id: uid(), date: today(), donorType: 'particulier', contactId: '', donor: { name: '', firstName: '', address: '', zip: '', city: '', country: 'France', email: '' }, amount: '', nature: 'numeraire', natureDesc: '', method: 'Chèque', form: 'autres', editionId: currentEdition()?.id || '', expenseAccount: '6251', notes: '' };
  d.donor ||= {};
  const rc = src && receiptOf(src), locked = !!rc;
  const host = h('div', { class: 'form' });
  const draw = () => {
    host.innerHTML = '';
    const dis = { disabled: locked }, part = d.donorType === 'particulier';
    fill(host,
      locked ? h('div', { class: 'note' }, icon('receipt', 16), h('span', {}, `Ce don figure sur le reçu fiscal ${rc.number} : seuls l’édition et les notes sont modifiables ici.`)) : null,
      h('div', { class: 'big-amount' }, h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: d.amount, ...dis, oninput: (e) => { d.amount = e.target.value; } }), h('span', {}, '€')),
      field('', segmented(DONOR_TYPES.map(([v, l]) => [v, l.split(' ')[0]]), d.donorType, (v) => { if (locked) return; d.donorType = v; draw(); })),
      h('div', { class: 'pair' }, field('Date', input(d, 'date', { type: 'date', ...dis }), { wide: false }),
        field('Versement', d.nature === 'numeraire' ? input(d, 'method', { type: 'select', options: DON_METHODS, ...dis }) : input(d, 'nature', { type: 'select', options: [['nature', 'En nature'], ['abandon_frais', 'Abandon de frais']], ...dis }), { wide: false })),
      field('', h('span', { class: 'check' }, h('input', { type: 'checkbox', checked: d.nature !== 'numeraire', ...dis, onchange: (e) => { d.nature = e.target.checked ? 'nature' : 'numeraire'; if (d.nature === 'numeraire' && !d.method) d.method = 'Chèque'; draw(); } }), h('span', {}, 'Don en nature (livres, matériel, frais abandonnés…)'))),
      part ? h('div', { class: 'pair' }, field('Prénom', input(d.donor, 'firstName', dis), { wide: false }), field('Nom', input(d.donor, 'name', dis), { wide: false })) : field('Dénomination', input(d.donor, 'name', dis)),
      field('Adresse', input(d.donor, 'address', dis), { hint: part ? 'Obligatoire pour le reçu fiscal' : '' }),
      h('div', { class: 'pair' }, field('Code postal', input(d.donor, 'zip', { inputmode: 'numeric', ...dis }), { wide: false }), field('Commune', input(d.donor, 'city', dis), { wide: false })),
      field('E-mail (envoi du reçu)', input(d.donor, 'email', { type: 'email', ...dis })),
      d.nature !== 'numeraire' ? field('Description du don', input(d, 'natureDesc', { placeholder: 'ex. 40 albums pour le prix des lecteurs', ...dis })) : null,
      field('Édition du salon', input(d, 'editionId', { type: 'select', options: editionOptions('Fonctionnement général') })),
      field('Notes', input(d, 'notes', { type: 'textarea', rows: 2 })));
  };
  draw();
  const extra = !isNew && !locked ? h('button', { class: 'btn wide danger-ghost', onclick: async () => {
    if (!canWrite() || !await confirmBox('Supprimer ce don ? Son écriture comptable sera retirée par l’application sur ordinateur si elle n’est pas validée.', { ok: 'Supprimer', danger: true })) return;
    try { await save('donations', src, { deleted: true }); toast('Don supprimé'); document.querySelector('.sheet .sheet-cancel')?.click(); render(); } catch (e) { toast(e.message, 'warn'); }
  } }, icon('trash', 17), 'Supprimer le don') : null;
  sheet({ title: isNew ? 'Nouveau don' : 'Don', body: host, extra, saveLabel: isNew ? 'Enregistrer' : 'Enregistrer', onSave: async () => {
    if (!canWrite()) return false;
    if (!(num(d.amount) > 0)) { toast('Indiquez le montant', 'warn'); return false; }
    if (!String(d.donor.name || '').trim()) { toast('Indiquez le nom du donateur', 'warn'); return false; }
    d.amount = round2(num(d.amount));
    if (d.nature !== 'numeraire') d.method = '';
    if (d.donorType !== 'particulier') { d.form = 'autres'; d.donor.firstName = ''; }
    let out = d;
    if (locked) out = { ...src, editionId: d.editionId, notes: d.notes };
    if (isNew) out.createdAt = new Date().toISOString();
    await save('donations', out); toast(isNew ? `Don de ${money(out.amount)} enregistré` : 'Don modifié'); render();
  } });
}

/* ---------- Adhésions ---------- */
const MEM_METHODS = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'HelloAsso / paiement en ligne'];
let mSeason = null, mQuery = '';
function pageAdhesions() {
  const all = list('members');
  const seasons = [...new Set([seasonOf(), ...all.map(m => m.season)])].filter(Boolean).sort().reverse();
  mSeason ||= seasons[0];
  const qn = norm(mQuery);
  const items = all.filter(m => m.season === mSeason && (!qn || norm([fullName(m), m.city, m.email].join(' ')).includes(qn))).sort((a, b) => COLL.compare(m2(a), m2(b)));
  function m2(m) { return [m.name, m.firstName].join(' '); }
  const prevS = mSeason.includes('-') ? mSeason.split('-').map(x => +x - 1).join('-') : String(+mSeason - 1);
  const toRenew = all.filter(m => m.season === prevS && !all.some(x => x.season === mSeason && sameMember(x, m)));
  const total = items.reduce((s, m) => s + num(m.amount), 0);
  shell('Adhésions', [
    h('div', { class: 'chips' }, seasons.slice(0, 5).map(s => h('button', { class: `chip ${s === mSeason ? 'on' : ''}`, onclick: () => { mSeason = s; pageAdhesions(); } }, s))),
    h('div', { class: 'stats two' }, h('div', { class: 'stat' }, h('b', {}, items.length), h('span', {}, `adhérent${items.length > 1 ? 's' : ''}`)), h('div', { class: 'stat' }, h('b', {}, money(total, true)), h('span', {}, 'de cotisations'))),
    searchInput(mQuery, (v) => { mQuery = v; pageAdhesions(); const i = document.querySelector('.search input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 'Rechercher un adhérent'),
    items.length ? h('div', { class: 'card list' }, items.slice(0, shownFor.adh || 200).map(m => row({ lead: avatar(fullName(m)), title: fullName(m), sub: [rateLabel(m.kind), m.city].filter(Boolean).join(' · '), right: h('b', { class: 'amount' }, money(m.amount)), onClick: () => editMember(m) }))) : empty('Aucune adhésion pour cette saison.', 'idcard'),
    more('adh', items.length, pageAdhesions),
    toRenew.length && mSeason === seasonOf() ? [sectionTitle(`À renouveler (${toRenew.length})`), h('div', { class: 'card list' }, toRenew.slice(0, 60).map(m => row({ lead: avatar(fullName(m), 'muted'), title: fullName(m), sub: `Adhérent ${prevS}`, right: h('span', { class: 'link' }, 'Renouveler'), onClick: () => editMember(null, { ...pick(m), season: seasonOf(), date: today() }) })))] : null,
    fab('Nouvelle adhésion', () => editMember(null)),
  ]);
}
const sameMember = (a, b) => (a.contactId && a.contactId === b.contactId) || (fullName(a).toLowerCase() === fullName(b).toLowerCase() && String(a.zip || '') === String(b.zip || ''));
const pick = (m) => { const { id: _i, date: _d, season: _s, createdAt: _c, ...rest } = m; return rest; };
const rateLabel = (id) => (membership().rates || []).find(r => r.id === id)?.label || id || '';
function editMember(src, preset = {}) {
  const isNew = !src, rates = membership().rates || [];
  const m = src ? clone(src) : { id: uid(), date: today(), season: seasonOf(), kind: rates[0]?.id || 'individuelle', amount: num(rates[0]?.amount), name: '', firstName: '', email: '', phone: '', address: '', zip: '', city: '', method: 'Espèces', contactId: '', counterpart: false, notes: '', ...preset };
  if (preset.kind) m.amount = num(rates.find(r => r.id === preset.kind)?.amount ?? m.amount);
  const host = h('div', { class: 'form' });
  const draw = () => {
    host.innerHTML = '';
    const structure = /structure/i.test(m.kind);
    fill(host,
      field('Formule', h('div', { class: 'rates' }, rates.map(r => h('button', { class: `rate ${m.kind === r.id ? 'on' : ''}`, onclick: () => { m.kind = r.id; m.amount = num(r.amount); draw(); } }, h('span', {}, r.label), h('b', {}, money(r.amount, true)))))),
      h('div', { class: 'pair' }, field('Cotisation (€)', input(m, 'amount', { type: 'number' }), { wide: false }), field('Règlement', input(m, 'method', { type: 'select', options: MEM_METHODS }), { wide: false })),
      structure ? field('Structure', input(m, 'name')) : h('div', { class: 'pair' }, field('Prénom', input(m, 'firstName'), { wide: false }), field('Nom', input(m, 'name'), { wide: false })),
      field('Téléphone', input(m, 'phone', { type: 'tel' })), field('E-mail', input(m, 'email', { type: 'email' })),
      field('Adresse', input(m, 'address')),
      h('div', { class: 'pair' }, field('Code postal', input(m, 'zip', { inputmode: 'numeric' }), { wide: false }), field('Commune', input(m, 'city'), { wide: false })),
      h('div', { class: 'pair' }, field('Date', input(m, 'date', { type: 'date', onChange: () => { m.season = seasonOf(m.date); draw(); } }), { wide: false }), field('Saison', input(m, 'season'), { wide: false })),
      field('', input(m, 'counterpart', { type: 'checkbox', text: 'Cotisation avec contrepartie (avantage remis à l’adhérent)' })),
      field('Notes', input(m, 'notes', { type: 'textarea', rows: 2 })));
  };
  draw();
  const extra = !isNew ? h('button', { class: 'btn wide danger-ghost', onclick: async () => {
    if (!canWrite() || !await confirmBox(`Supprimer l’adhésion ${src.season} de ${fullName(src)} ?`, { ok: 'Supprimer', danger: true })) return;
    try { await save('members', src, { deleted: true }); toast('Adhésion supprimée'); document.querySelector('.sheet .sheet-cancel')?.click(); render(); } catch (e) { toast(e.message, 'warn'); }
  } }, icon('trash', 17), 'Supprimer l’adhésion') : null;
  sheet({ title: isNew ? 'Nouvelle adhésion' : 'Adhésion', body: host, extra, onSave: async () => {
    if (!canWrite()) return false;
    if (!String(m.name).trim()) { toast('Indiquez le nom', 'warn'); return false; }
    m.amount = round2(num(m.amount));
    if (isNew && list('members').some(x => x.season === m.season && sameMember(x, m))) { if (!await confirmBox(`${fullName(m)} a déjà une adhésion pour ${m.season}. L’enregistrer quand même ?`)) return false; }
    if (isNew) m.createdAt = new Date().toISOString();
    await save('members', m); toast(isNew ? 'Adhésion enregistrée' : 'Adhésion modifiée'); render();
  } });
}

/* ---------- Réunions ---------- */
let rPast = false;
function pageReunions() {
  const all = list('meetings');
  const next = upcoming(), past = all.filter(m => !next.includes(m)).sort((a, b) => b.date.localeCompare(a.date));
  const shown = rPast ? past : next;
  shell('Réunions', [
    segmented([['0', `À venir (${next.length})`], ['1', `Passées (${past.length})`]], rPast ? '1' : '0', (v) => { rPast = v === '1'; pageReunions(); }),
    shown.length ? h('div', { class: 'card list' }, shown.slice(0, 80).map(meetingRow)) : empty(rPast ? 'Aucune réunion passée.' : 'Aucune réunion prévue. Les réunions se créent dans l’application sur ordinateur.', 'calendar'),
  ], { back: 'plus' });
}
const ATT = [['present', 'Présent'], ['represente', 'Repr.'], ['excuse', 'Excusé'], ['absent', 'Absent']];
function pageReunion(id) {
  const src = list('meetings').find(m => m.id === id);
  if (!src) { shell('Réunion', empty('Réunion introuvable.', 'calendar'), { back: 'reunions' }); return; }
  const m = clone(src), t = mtype(m.type);
  let dirty = false;
  const saveBar = h('div', { class: 'savebar' }, h('span', {}, 'Modifications non enregistrées'), h('button', { class: 'btn primary', onclick: async (e) => {
    if (!canWrite()) return;
    e.target.disabled = true;
    try { m.updatedAt = new Date().toISOString(); await save('meetings', m); toast('Réunion enregistrée'); dirty = false; saveBar.classList.remove('on'); }
    catch (err) { toast(err.message, 'warn'); }
    finally { e.target.disabled = false; }
  } }, 'Enregistrer'));
  const touch = () => { dirty = true; saveBar.classList.add('on'); };
  const att = (m.attendance ||= {});
  const inv = invitedOf(m);
  const q = () => { const here = inv.filter(p => ['present', 'represente'].includes(att[p.id])).length; return `${here} présent(s) ou représenté(s) sur ${inv.length}`; };
  const qEl = h('span', { class: 'muted small' }, q());
  const attRows = inv.map(p => h('div', { class: 'att' }, h('div', { class: 'att-name' }, fullName(p), p.bureauRole ? h('span', { class: 'muted small' }, ' · ' + p.bureauRole) : null),
    segmented(ATT, att[p.id] || '', (v) => { if (att[p.id] === v) delete att[p.id]; else att[p.id] = v; touch(); qEl.textContent = q(); redrawSeg(); })));
  // les segments de présence se redessinent sur place
  function redrawSeg() { attRows.forEach((r, i) => { const p = inv[i]; r.querySelectorAll('.seg-btn').forEach((b, j) => b.classList.toggle('on', att[p.id] === ATT[j][0])); }); }
  const c = (m.agCounts ||= {});
  const statusSeg = () => segmented([['prevue', 'Prévue'], ['tenue', 'Tenue'], ['annulee', 'Annulée']], m.status || 'prevue', (v) => { m.status = v; touch(); stHost.replaceChildren(statusSeg()); });
  const stHost = h('div', {}, statusSeg());
  const minutes = h('textarea', { rows: 10, placeholder: 'Compte rendu : déroulé des échanges, point par point de l’ordre du jour…' }); minutes.value = m.minutes || '';
  minutes.addEventListener('input', () => { m.minutes = minutes.value; touch(); });
  window.onbeforeunload = () => dirty ? true : undefined;
  shell(t[1], [
    h('div', { class: 'card pad' },
      h('div', { class: 'meet-type' }, badge(t[0], 'info')),
      h('div', { class: 'meet-title' }, m.title || t[0]),
      h('div', { class: 'meet-when' }, icon('calendar', 17), h('span', {}, longDate(m.date, true), m.time ? ' à ' + m.time.replace(':', ' h ') : '')),
      m.place ? h('a', { class: 'meet-when link', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.place), target: '_blank', rel: 'noopener' }, icon('map', 17), h('span', {}, m.place)) : null,
      h('div', { style: { marginTop: '12px' } }, stHost)),
    m.agenda ? [sectionTitle('Ordre du jour'), h('div', { class: 'card pad' }, h('ol', { class: 'agenda' }, String(m.agenda).split('\n').filter(x => x.trim()).map(x => h('li', {}, x.replace(/^\s*[-•\d.)]+\s*/, '')))))] : null,
    sectionTitle('Présences', qEl),
    t[2] === 'adherents'
      ? h('div', { class: 'card pad form' },
        field('Membres à jour de cotisation', input(c, 'members', { type: 'number', inputmode: 'numeric', onChange: touch })),
        h('div', { class: 'pair' }, field('Présents', input(c, 'present', { type: 'number', inputmode: 'numeric', onChange: touch }), { wide: false }), field('Représentés', input(c, 'represented', { type: 'number', inputmode: 'numeric', onChange: touch }), { wide: false })),
        h('p', { class: 'muted small' }, 'Présences des membres du CA :'), ...attRows)
      : inv.length ? h('div', { class: 'card pad' }, attRows) : h('div', { class: 'card pad muted' }, 'Aucune personne convoquée.'),
    sectionTitle('Compte rendu'), h('div', { class: 'card pad' }, minutes),
    (m.decisions || []).length ? [sectionTitle('Décisions'), h('div', { class: 'card list' }, m.decisions.map(d => row({ title: d.text || d.title || '', sub: [d.result, d.votes ? `pour ${d.votes.for ?? '—'} · contre ${d.votes.against ?? '—'} · abst. ${d.votes.abstain ?? '—'}` : ''].filter(Boolean).join(' · ') })))] : null,
    (m.files || []).length ? [sectionTitle('Documents'), h('div', { class: 'card list' }, m.files.map(f => row({ lead: icon('file', 20), title: f.title || f.name, sub: [f.category, f.size ? Math.max(1, Math.round(f.size / 1024)) + ' Ko' : ''].filter(Boolean).join(' · '), onClick: () => openArchive(f) })))] : null,
    h('div', { style: { height: '70px' } }),
    saveBar,
  ], { back: 'reunions' });
}
/*
 * Documents joints : le type affiché est déduit de l'extension, jamais de la fiche ni de Google Drive.
 * Une page web ou une image SVG déguisée ne peut donc pas s'exécuter sur le site (et y lire la connexion Google).
 */
const VIEWABLE = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain;charset=utf-8', md: 'text/plain;charset=utf-8' };
async function openArchive(f) {
  if (S.offline) return toast('Hors connexion', 'warn');
  const ext = String(f.file || '').split('.').pop().toLowerCase();
  const type = VIEWABLE[ext];
  const w = type ? window.open('', '_blank') : null;
  try {
    toast('Téléchargement…');
    const blob = await S.base.getFile('archives', f.file);
    const url = URL.createObjectURL(new Blob([blob], { type: type || 'application/octet-stream' }));
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    if (type) { if (w) w.location = url; else location.href = url; return; }
    // autres formats (Word, tableur…) : simple téléchargement, ouvert par l'application du téléphone
    const a = h('a', { href: url, download: String(f.name || f.file).replace(/[\\/:*?"<>|]/g, '_') }); document.body.append(a); a.click(); a.remove();
  } catch (e) { w?.close(); toast(e.message, 'warn'); }
}

/* ---------- Équipe (CA, bureau, bénévoles) ---------- */
let eFilter = 'ca';
function pageEquipe() {
  const ppl = list('people');
  const F = { ca: ['CA', p => inCA(p)], bureau: ['Bureau', p => inBureau(p)], benevoles: ['Bénévoles', p => p.volunteer], tous: ['Tous', () => true] };
  const order = (p) => p.bureauRole ? BUREAU_ROLES.indexOf(p.bureauRole) : 99;
  const items = ppl.filter(F[eFilter][1]).sort((a, b) => (eFilter === 'benevoles' ? 0 : order(a) - order(b)) || COLL.compare([a.name, a.firstName].join(' '), [b.name, b.firstName].join(' ')));
  shell('Équipe', [
    h('div', { class: 'chips' }, Object.entries(F).map(([k, [l, f]]) => h('button', { class: `chip ${eFilter === k ? 'on' : ''}`, onclick: () => { eFilter = k; pageEquipe(); } }, l, h('span', { class: 'chip-n' }, ppl.filter(f).length)))),
    items.length ? h('div', { class: 'card list' }, items.map(p => row({ lead: avatar(fullName(p), inBureau(p) ? 'red' : inCA(p) ? 'orange' : ''), title: fullName(p), sub: [p.bureauRole || (inCA(p) ? 'Administrateur·rice' : ''), p.volunteer ? 'bénévole' : '', p.skills].filter(Boolean).join(' · '), onClick: () => showPerson(p) }))) : empty('Personne dans cette liste.', 'team'),
    fab('Nouveau bénévole', () => editPerson(null, { volunteer: true })),
  ], { back: 'plus' });
}
function showPerson(p) {
  const info = (label, value) => value ? h('div', { class: 'info' }, h('span', {}, label), h('b', {}, value)) : null;
  const body = h('div', {},
    h('div', { class: 'id-head' }, avatar(fullName(p), inBureau(p) ? 'red' : 'orange'), h('div', {}, h('div', { class: 'id-name' }, fullName(p)), h('div', { class: 'muted' }, [p.bureauRole, inCA(p) ? 'membre du CA' : '', p.volunteer ? 'bénévole' : ''].filter(Boolean).join(' · ')))),
    h('div', { class: 'actions3' },
      p.phone ? h('a', { class: 'act', href: telHref(p.phone) }, icon('phone'), 'Appeler') : null,
      p.phone ? h('a', { class: 'act', href: 'sms:' + String(p.phone).replace(/[^\d+]/g, '') }, icon('mail'), 'SMS') : null,
      p.email ? h('a', { class: 'act', href: 'mailto:' + p.email }, icon('mail'), 'E-mail') : null),
    h('div', { class: 'card pad infos' }, info('Téléphone', p.phone), info('E-mail', p.email), info('Commune', [p.zip, p.city].filter(Boolean).join(' ')),
      inCA(p) ? info('Mandat au CA', [p.caSince ? 'depuis le ' + fmtDate(p.caSince) : '', p.caEnd ? 'jusqu’au ' + fmtDate(p.caEnd) : ''].filter(Boolean).join(' ')) : null,
      info('Compétences', p.skills), info('Disponibilités', p.availability), info('Notes', p.notes)));
  const s = sheet({ title: 'Fiche', body, extra: h('button', { class: 'btn wide', onclick: () => { s.close(); editPerson(p); } }, 'Modifier') });
}
function editPerson(src, preset = {}) {
  const isNew = !src;
  const p = src ? clone(src) : { id: uid(), firstName: '', name: '', email: '', phone: '', address: '', zip: '', city: '', ca: false, caSince: '', caEnd: '', bureauRole: '', bureauSince: '', volunteer: false, skills: '', availability: '', hours: {}, notes: '', ...preset };
  const body = h('div', { class: 'form' },
    h('div', { class: 'pair' }, field('Prénom', input(p, 'firstName'), { wide: false }), field('Nom', input(p, 'name'), { wide: false })),
    field('Téléphone', input(p, 'phone', { type: 'tel' })), field('E-mail', input(p, 'email', { type: 'email' })),
    h('div', { class: 'pair' }, field('Code postal', input(p, 'zip', { inputmode: 'numeric' }), { wide: false }), field('Commune', input(p, 'city'), { wide: false })),
    field('', input(p, 'volunteer', { type: 'checkbox', text: 'Bénévole' })),
    field('Compétences', input(p, 'skills', { placeholder: 'accueil, lecture à voix haute, montage…' })),
    field('Disponibilités', input(p, 'availability', { placeholder: 'samedi matin, montage du vendredi…' })),
    field('Notes', input(p, 'notes', { type: 'textarea', rows: 2 })),
    isNew ? null : h('p', { class: 'muted small' }, 'Le mandat au CA et la fonction au bureau se modifient dans l’application sur ordinateur.'));
  sheet({ title: isNew ? 'Nouvelle personne' : 'Modifier', body, onSave: async () => {
    if (!canWrite()) return false;
    if (!String(p.name).trim() && !String(p.firstName).trim()) { toast('Indiquez le nom', 'warn'); return false; }
    if (isNew) p.createdAt = new Date().toISOString();
    await save('people', p); toast('Fiche enregistrée'); render();
  } });
}

/* ---------- Budget de l'édition (prévisionnel et réalisé) ---------- */
const SIDES = [['produit', 'Produits'], ['charge', 'Charges'], ['cvn-ressource', 'Bénévolat et dons en nature']];
let bEdition = null;
function budgetReport(ed) {
  const lines = (ed.budget || []).map(l => ({ ...l, real: round2(num(l.realHist)) }));   // réalisé repris du budget de l'AG
  const extra = new Map();
  const sideOf = (a) => a[0] === '6' ? 'charge' : a[0] === '7' ? 'produit' : a.startsWith('86') ? 'cvn-emploi' : a.startsWith('87') ? 'cvn-ressource' : null;
  for (const e of list('entries')) {
    if (e.editionId !== ed.id || e.journal === 'AN') continue;
    for (const l of e.lines || []) {
      const acc = String(l.account), side = sideOf(acc); if (!side) continue;
      const v = side === 'charge' || side === 'cvn-emploi' ? num(l.debit) - num(l.credit) : num(l.credit) - num(l.debit);
      let best = null, len = -1;
      for (const b of lines) if (b.side === side && b.account && acc.startsWith(b.account) && b.account.length > len) { best = b; len = b.account.length; }
      if (best) best.real = round2(best.real + v);
      else { const k = side + acc; const x = extra.get(k) || { side, account: acc, label: `Compte ${acc} (non prévu)`, amount: 0, real: 0 }; x.real = round2(x.real + v); extra.set(k, x); }
    }
  }
  const all = [...lines, ...[...extra.values()].filter(x => x.real)];
  const T = (side, k) => round2(all.filter(l => l.side === side).reduce((s, l) => s + num(l[k]), 0));
  return { lines: all, T };
}
async function pageBudget() {
  const eds = editions().slice().reverse();
  const ed = getEdition(bEdition) || currentEdition();
  if (!ed) { shell('Budget', empty('Aucune édition.', 'chart'), { back: 'plus' }); return; }
  if (!S.base.loaded.has('entries') && !S.offline) {
    const bar = h('div', { class: 'progress' }, h('i', {}));
    shell('Budget', [h('div', { class: 'card pad center' }, h('p', {}, 'Chargement des écritures comptables…'), bar, h('p', { class: 'muted small' }, 'La première fois peut prendre un moment ; ensuite seules les nouveautés sont téléchargées.'))], { back: 'plus' });
    try { await S.base.load(['entries'], (d, t) => { bar.firstChild.style.width = (t ? Math.round(d / t * 100) : 100) + '%'; }); }
    catch (e) { if (e.auth) authBanner(); toast(e.message, 'warn'); }
    if (location.hash === '#/budget') pageBudget();
    return;
  }
  const r = budgetReport(ed);
  const res = (k) => round2(r.T('produit', k) - r.T('charge', k));
  const bar = (real, plan) => { const p = plan ? Math.min(100, Math.round(real / plan * 100)) : real ? 100 : 0; return h('div', { class: `bbar ${plan && real > plan ? 'over' : ''}` }, h('i', { style: { width: p + '%' } })); };
  shell('Budget', [
    h('div', { class: 'select-wrap' }, input({ v: ed.id }, 'v', { type: 'select', options: eds.map(e => [e.id, e.name]), onChange: (v) => { bEdition = v; pageBudget(); } })),
    h('div', { class: 'stats two' },
      h('div', { class: 'stat' }, h('b', { class: res('real') < 0 ? 'neg' : '' }, money(res('real'), true)), h('span', {}, 'résultat réalisé')),
      h('div', { class: 'stat' }, h('b', {}, money(res('amount'), true)), h('span', {}, 'résultat prévu'))),
    ...SIDES.map(([side, label]) => {
      const ls = r.lines.filter(l => l.side === side && (num(l.amount) || num(l.real)));
      if (!ls.length) return null;
      return [sectionTitle(label, h('span', { class: 'muted small' }, `${money(r.T(side, 'real'), true)} / ${money(r.T(side, 'amount'), true)}`)),
        h('div', { class: 'card list' }, ls.map(l => h('div', { class: 'bline' }, h('div', { class: 'bline-top' }, h('span', {}, l.label), h('b', {}, money(l.real, true), h('span', { class: 'muted' }, ` / ${money(l.amount, true)}`))), bar(num(l.real), num(l.amount)))))];
    }),
    h('p', { class: 'foot' }, S.offline ? 'Hors connexion : réalisé selon les dernières écritures connues.' : 'Réalisé : écritures comptables rattachées à l’édition. Le budget se prépare dans l’application sur ordinateur.'),
  ], { back: 'plus' });
}

/* ---------- Pièce justificative (photo) ---------- */
async function compress(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) { if (/^image\/(jpeg|png)$/.test(file.type)) return file; throw new Error('Image illisible'); }
  const max = 2200, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(b => res(b), 'image/jpeg', 0.85));
}
async function sha256(blob) { const b = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const PIECE_KINDS = [['ticket', 'Ticket de caisse'], ['facture', 'Facture'], ['note', 'Note de frais'], ['autre', 'Autre']];
function editPiece() {
  const shots = [];
  const p = { kind: 'ticket', date: '', total: '', supplier: '', label: '', payment: '', editionId: currentEdition()?.id || '', notes: '' };
  const thumbs = h('div', { class: 'thumbs' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, style: { display: 'none' } });
  const drawThumbs = () => {
    thumbs.innerHTML = '';
    shots.forEach((b, i) => thumbs.append(h('div', { class: 'thumb' }, h('img', { src: URL.createObjectURL(b), alt: `Page ${i + 1}` }), h('button', { class: 'thumb-x', 'aria-label': 'Retirer', onclick: () => { shots.splice(i, 1); drawThumbs(); } }, icon('x', 14)))));
    thumbs.append(h('button', { class: 'thumb add', onclick: () => fileIn.click() }, icon('camera', 28), h('span', {}, shots.length ? 'Page suivante' : 'Prendre la photo')));
  };
  fileIn.addEventListener('change', async () => {
    for (const f of fileIn.files) { try { shots.push(await compress(f)); } catch (e) { toast(e.message, 'warn'); } }
    fileIn.value = ''; drawThumbs();
  });
  drawThumbs();
  const body = h('div', { class: 'form' }, thumbs, fileIn,
    h('p', { class: 'muted small' }, 'La pièce arrive dans Comptabilité › Pièces justificatives de l’application sur ordinateur, qui la lit automatiquement. Les champs ci-dessous sont facultatifs.'),
    field('Type', segmented(PIECE_KINDS, p.kind, (v) => { p.kind = v; body.querySelectorAll('.seg')[0].querySelectorAll('.seg-btn').forEach((b, i) => b.classList.toggle('on', PIECE_KINDS[i][0] === v)); })),
    h('div', { class: 'pair' }, field('Montant TTC (€)', input(p, 'total', { type: 'number' }), { wide: false }), field('Date du ticket', input(p, 'date', { type: 'date' }), { wide: false })),
    field('Fournisseur', input(p, 'supplier', { placeholder: 'ex. Imprimerie Vosgienne' })),
    field('Objet', input(p, 'label', { placeholder: 'ex. affiches du salon' })),
    field('Payé par', input(p, 'payment', { type: 'select', options: [['', '—'], ['banque', 'Carte ou virement de l’association'], ['caisse', 'Espèces (caisse)'], ['avance', 'Avancé par un bénévole (à rembourser)']] })),
    field('Édition du salon', input(p, 'editionId', { type: 'select', options: editionOptions('Fonctionnement général') })),
    field('Notes', input(p, 'notes', { type: 'textarea', rows: 2 })));
  sheet({ title: 'Justificatif', body, saveLabel: 'Envoyer', onSave: async () => {
    if (!shots.length) { toast('Prenez au moins une photo', 'warn'); return false; }
    if (!canWrite()) return false;
    const id = 'pc' + uid(), files = [];
    for (let i = 0; i < shots.length; i++) {
      const name = `${id}${i ? '-' + i : ''}.jpg`;
      await S.base.putFile('pieces', name, new File([shots[i]], name, { type: 'image/jpeg' }));
      files.push({ file: name, size: shots[i].size, sha256: await sha256(shots[i]), mime: 'image/jpeg', original: null });
    }
    const pc = { id, ref: '', files, addedAt: new Date().toISOString(), addedBy: S.user?.displayName || S.base.user, status: 'a_traiter', kind: p.kind === 'note' ? 'note' : p.kind, date: p.date || '', supplier: p.supplier.trim(), number: '', total: round2(num(p.total)), vat: 0, account: '', payment: p.payment, label: p.label.trim(), notes: p.notes, editionId: p.editionId, auto: { kind: p.kind }, source: 'mobile' };
    if (!pc.total) pc.total = 0;
    await save('pieces', pc); toast('Justificatif envoyé à la comptabilité');
  } });
}

/* ---------- Plus, réglages ---------- */
function pagePlus() {
  shell('Plus', [
    h('div', { class: 'card list' }, MORE.map(([id, label, ic]) => row({ lead: h('span', { class: 'lead-ic' }, icon(ic, 21)), title: label, onClick: () => id === 'piece' ? editPiece() : go(id) }))),
    h('p', { class: 'foot' }, `Zinc Grenadine mobile ${VERSION}`),
  ]);
}
function pageReglages() {
  const b = S.base;
  shell('Réglages', [
    h('div', { class: 'card pad infos' },
      h('div', { class: 'info' }, h('span', {}, 'Compte Google'), h('b', {}, S.user ? `${S.user.displayName || ''}\n${S.user.emailAddress || ''}` : '—')),
      h('div', { class: 'info' }, h('span', {}, 'Dossier'), h('b', {}, prefs.get('baseLabel') || 'ZincGrenadine-base')),
      h('div', { class: 'info' }, h('span', {}, 'Fiches chargées'), h('b', {}, ['clients', 'donations', 'members', 'people', 'meetings', 'entries'].filter(c => b.loaded.has(c)).map(c => `${({ clients: 'contacts', donations: 'dons', members: 'adhésions', people: 'personnes', meetings: 'réunions', entries: 'écritures' })[c]} : ${list(c).length}`).join('\n'))),
      h('div', { class: 'info' }, h('span', {}, 'Nom de ce téléphone'), h('b', {}, b.device))),
    h('div', { class: 'stack' },
      h('button', { class: `btn wide ${isSim() ? 'primary' : ''}`, onclick: () => { prefs.set('baseId', null); history.replaceState(null, '', location.pathname + '#/accueil'); location.reload(); } }, isSim() ? 'Revenir à la vraie base' : 'Changer de base (vraie base ou simulation)'),
      h('button', { class: 'btn wide', onclick: async () => { await clearCache(); toast('Cache vidé'); await refresh(true); } }, 'Tout retélécharger'),
      h('button', { class: 'btn wide danger-ghost', onclick: async () => { if (!await confirmBox('Se déconnecter et effacer les données gardées sur ce téléphone ?', { ok: 'Se déconnecter', danger: true })) return; signOut(); await clearCache(); prefs.set('baseId', null); prefs.set('user', null); location.reload(); } }, icon('logout', 17), 'Se déconnecter')),
    h('p', { class: 'foot' }, 'Les données restent dans le dossier Google Drive de l’association. Ce téléphone en garde une copie pour l’ouverture rapide et la consultation hors connexion.'),
  ], { back: 'plus' });
}

/* ---------- Routeur ---------- */
function render() {
  if (!S.base) return;
  window.onbeforeunload = null;
  const [page, id] = location.hash.slice(2).split('/');
  const R = { accueil: pageAccueil, contacts: pageContacts, dons: pageDons, adhesions: pageAdhesions, reunions: () => id ? pageReunion(id) : pageReunions(), equipe: pageEquipe, budget: pageBudget, plus: pagePlus, reglages: pageReglages, piece: () => { go('accueil'); editPiece(); } };
  (R[page] || pageAccueil)();
  if (!R[page] && location.hash !== '#/accueil') history.replaceState(null, '', '#/accueil');
}
window.addEventListener('hashchange', () => { document.querySelectorAll('.sheet').forEach(s => s.remove()); document.body.classList.remove('sheet-open'); render(); window.scrollTo(0, 0); });

async function refresh(full = false) {
  if (S.busy) return;
  if (S.offline || !signedIn()) { if (S.offline) return login(); authBanner(); return; }
  S.busy = true; document.querySelector('header.top .top-btn:last-child')?.classList.add('spin');
  try {
    const cols = [...new Set([...START, ...S.base.loaded])].filter(c => c !== 'docs');
    const r = await S.base.load(cols);
    S.loadedAt = Date.now();
    if (r.downloaded && !full) toast(`${r.downloaded} fiche(s) mise(s) à jour`);
  } catch (e) { if (e.auth) authBanner(); toast(e.message, 'warn'); }
  finally { S.busy = false; render(); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.base && !S.offline && Date.now() - S.loadedAt > 120000 && signedIn() && !document.querySelector('.sheet')) refresh(); });

/* ---------- Démarrage : configuration, connexion, choix du dossier, chargement ---------- */
function screen(...content) { view.innerHTML = ''; view.append(h('div', { class: 'welcome' }, h('img', { src: 'img/logo.png', alt: 'Zinc Grenadine', class: 'welcome-logo' }), h('div', { class: 'tagline' }, 'le salon du livre jeunesse'), h('div', { class: 'dots' }), ...content)); }
function setupScreen() {
  const o = { id: '' };
  screen(h('h2', {}, 'Première configuration'),
    h('p', {}, 'Ce site doit être relié à l’identifiant Google de l’association (« ID client OAuth »). Il se crée une fois pour toutes dans la console Google Cloud : voir le guide de mise en ligne.'),
    field('ID client Google', input(o, 'id', { placeholder: '1234…apps.googleusercontent.com' })),
    h('button', { class: 'btn primary wide', onclick: () => { const v = o.id.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) return toast('Cet identifiant ne ressemble pas à un ID client Google', 'warn'); prefs.set('clientId', v); location.reload(); } }, 'Continuer'));
}
function login() {
  const cachedBase = prefs.get('baseId');
  screen(h('p', { class: 'lead' }, 'Connectez-vous avec le compte Google qui a accès au dossier partagé de l’association.'),
    h('button', { class: 'btn google wide', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await signIn(CFG.clientId, { hint: prefs.get('user')?.emailAddress }); S.offline = false; await boot(); }
      catch (err) { toast(err.message, 'warn'); e.currentTarget.disabled = false; }
    } }, h('span', { class: 'g' }, 'G'), 'Se connecter avec Google'),
    cachedBase ? h('button', { class: 'btn wide', onclick: async () => { S.offline = true; S.user = prefs.get('user'); S.base = new DriveBase(cachedBase, { user: S.user?.displayName, device: deviceId() }); const n = await S.base.fromCache(); if (!n) { toast('Aucune donnée gardée sur ce téléphone', 'warn'); return; } render(); } }, 'Consulter hors connexion') : null,
    h('p', { class: 'muted small' }, 'Vos données restent dans le Google Drive de l’association.'));
  prepareAuth(CFG.clientId).catch(() => {});
}
function deviceId() {
  let d = prefs.get('device');
  if (!d) { const ua = navigator.userAgent; const kind = /iPhone/.test(ua) ? 'iphone' : /iPad/.test(ua) ? 'ipad' : /Android/.test(ua) ? 'android' : 'web'; d = `${kind}-${Math.random().toString(36).slice(2, 8)}`; prefs.set('device', d); }
  return d;
}
async function chooseBase() {
  screen(h('p', {}, 'Recherche du dossier « ZincGrenadine-base »…'), h('div', { class: 'progress indet' }, h('i', {})));
  const bases = await findBases();
  if (bases.length === 1) return bases[0];
  return new Promise((res) => {
    if (!bases.length) {
      screen(h('h2', {}, 'Dossier introuvable'),
        h('p', {}, 'Aucun dossier « ZincGrenadine-base » n’est visible avec ce compte Google.'),
        h('ul', { class: 'tips' }, h('li', {}, 'Sur l’ordinateur, l’application doit utiliser une base partagée dans Google Drive (Réglages › Partage).'), h('li', {}, 'Le dossier doit être partagé avec ce compte Google.')),
        h('button', { class: 'btn wide', onclick: () => location.reload() }, 'Réessayer'),
        h('button', { class: 'btn wide', onclick: () => { signOut(); location.reload(); } }, 'Changer de compte'));
      return;
    }
    screen(h('h2', {}, 'Quelle base ouvrir ?'), h('p', {}, 'Plusieurs bases sont visibles avec ce compte :'),
      h('div', { class: 'card list' }, bases.map(b => row({ lead: h('span', { class: `lead-ic ${b.simulation ? 'sim' : ''}` }, icon(b.simulation ? 'alert' : 'cloud', 21)), title: b.simulation ? 'Simulation — données fictives' : 'Base de l’association', sub: b.simulation ? 'Pour essayer le site : rien n’arrive dans la vraie base' : [b.parentName ? `dossier « ${b.parentName} »` : '', b.owners?.[0]?.displayName].filter(Boolean).join(' · '), onClick: () => res(b) }))));
  });
}
async function boot() {
  try {
    S.user = await whoAmI(); prefs.set('user', S.user);
    let baseId = prefs.get('baseId');
    if (!baseId) { const b = await chooseBase(); baseId = b.id; prefs.set('baseId', baseId); prefs.set('baseLabel', b.simulation ? 'Simulation — données fictives' : (b.parentName ? `${b.parentName} › ${b.name}` : b.name)); }
    S.base = new DriveBase(baseId, { user: S.user.displayName || S.user.emailAddress, device: deviceId() });
    const bar = h('div', { class: 'progress' }, h('i', {}));
    const label = h('p', {}, 'Chargement des données…');
    screen(label, bar);
    await S.base.load(START, (d, t) => { bar.firstChild.style.width = (t ? Math.round(d / t * 100) : 100) + '%'; label.textContent = t > 20 ? `Chargement des données… ${d} / ${t}` : 'Chargement des données…'; });
    S.loadedAt = Date.now();
    render();
  } catch (e) {
    if (e.auth) return login();
    if (/base Zinc|introuvable|404/.test(e.message)) prefs.set('baseId', null);
    screen(h('h2', {}, 'Ouverture impossible'), h('p', {}, e.message), h('button', { class: 'btn primary wide', onclick: () => location.reload() }, 'Réessayer'),
      prefs.get('baseId') ? h('button', { class: 'btn wide', onclick: async () => { S.offline = true; S.base = new DriveBase(prefs.get('baseId'), { device: deviceId() }); if (await S.base.fromCache()) render(); else toast('Aucune donnée gardée sur ce téléphone', 'warn'); } }, 'Consulter hors connexion') : null);
  }
}

// identifiant Google transmis dans l'adresse (?client=…) : gardé sur le téléphone, retiré de l'adresse
const urlClient = new URLSearchParams(location.search).get('client');
if (urlClient) { prefs.set('clientId', urlClient); history.replaceState(null, '', location.pathname + location.hash); }
CFG.clientId = (CFG.clientId && !/^VOTRE/.test(CFG.clientId) ? CFG.clientId : '') || prefs.get('clientId') || '';
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (!CFG.clientId) setupScreen();
else if (signedIn()) boot();
else login();
