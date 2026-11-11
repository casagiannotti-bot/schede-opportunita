(() => {
'use strict';

const STATI = ['Prospect', 'Progetto', 'Delivery', 'Fatto'];
const COLORI = { Prospect: 'var(--prospect)', Progetto: 'var(--progetto)', Delivery: 'var(--delivery)', Fatto: 'var(--fatto)' };
const ESITI = ['Vinta', 'Persa'];
const FATTO_VISIBILI = 30;
const MAX_REC_SEC = 300;
const APP_NAME = 'Opportunity Desk';  // cambia qui il nome dell'applicazione

const S = {
  tab: 'schede', stato: 'Prospect', q: '', anno: '',
  opps: [], tipologie: [], anni: [], att: [], attFiltro: 'aperte', oppAperte: [],
  voce: false, tutteFatte: false, versione: '',
};
const root = document.getElementById('app');
let shell = null;

// ------------------------------------------------------------------ utilità DOM
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'textContent') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = (x) => {
    if (x === null || x === undefined || x === false) return;
    if (Array.isArray(x)) x.forEach(add);
    else e.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
  };
  kids.forEach(add);
  return e;
}

function toast(msg, ms = 3200) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const fmtEur = (n) => (n === null || n === undefined || n === '' ? '' :
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n));

async function api(method, path, body, raw) {
  const opt = { method, credentials: 'same-origin', headers: { 'X-App': '1' } };
  if (raw) { opt.body = raw.body; opt.headers['Content-Type'] = raw.type; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opt);
  let data = null;
  try { data = await r.json(); } catch (e) { /* risposta senza corpo */ }
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Accesso richiesto'); }
  if (!r.ok) throw new Error((data && data.errore) || ('Errore ' + r.status));
  return data;
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ------------------------------------------------------------------------ login
function showLogin(msg) {
  shell = null;
  const ver = h('div', { class: 'loginfoot' }, 'Realizzato da Maurizio Giannotti');
  fetch('/api/info').then((r) => r.json()).then((d) => {
    if (d && d.versione) ver.textContent = 'Realizzato da Maurizio Giannotti · V ' + d.versione;
  }).catch(() => {});
  const pwd = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', autofocus: true });
  const err = h('div', { class: 'err' }, msg || '');
  const btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, 'Entra');
  const form = h('form', { class: 'login', onsubmit: async (ev) => {
    ev.preventDefault();
    btn.disabled = true; err.textContent = '';
    try {
      await api('POST', '/api/login', { password: pwd.value });
      start();
    } catch (e) { err.textContent = e.message; btn.disabled = false; pwd.select(); }
  } }, h('h1', null, APP_NAME), h('p', null, 'Accedi per vedere le tue opportunità.'), pwd, err, btn, ver);
  root.replaceChildren(form);
}

// ------------------------------------------------------------------------ shell
function buildShell() {
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Cerca…', 'aria-label': 'Cerca',
    value: S.q, oninput: debounce((e) => { S.q = e.target.value.trim(); refresh(); }, 250) });
  const btnNew = h('button', { class: 'iconbtn primary', 'aria-label': 'Nuova', onclick: () => {
    if (S.tab === 'attivita') { const i = document.getElementById('att-titolo'); if (i) i.focus(); }
    else openForm({ stato: S.stato });
  } }, '＋', h('span', { class: 'lbl' }, ' Nuova'));
  const btnMic = h('button', { class: 'iconbtn', 'aria-label': 'Nota vocale', hidden: !S.voce, onclick: openVoice }, '🎙');
  const btnMenu = h('button', { class: 'iconbtn', 'aria-label': 'Menu', onclick: (e) => { e.stopPropagation(); toggleMenu(); } }, '⋯');
  const tabs = h('div', { class: 'tabs' },
    ...[['schede', 'Schede'], ['attivita', 'Day by Day']].map(([k, label]) =>
      h('button', { class: 'tab' + (S.tab === k ? ' on' : ''), onclick: () => { S.tab = k; rebuildTabs(); refresh(); } }, label)));
  const content = h('main', { id: 'content' });
  const header = h('header', { class: 'top' },
    h('h1', null, 'Schede'), search, btnNew, btnMic, btnMenu);
  const credit = h('div', { class: 'credit' },
    APP_NAME + ' - sviluppata da Maurizio Giannotti' + (S.versione ? ' · V ' + S.versione : ''));
  // titolo + ricerca formano un unico frame fisso: non scorre con la pagina
  const frame = h('div', { class: 'topframe' }, credit, header);
  root.replaceChildren(frame, tabs, content);
  shell = { frame, header, tabs, content, btnMic, search };
}

function rebuildTabs() {
  shell.tabs.replaceChildren(...[['schede', 'Schede'], ['attivita', 'Day by Day']].map(([k, label]) =>
    h('button', { class: 'tab' + (S.tab === k ? ' on' : ''), onclick: () => { S.tab = k; rebuildTabs(); refresh(); } }, label)));
}

let menuEl = null;
function toggleMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; return; }
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const payload = JSON.parse(await f.text());
      const r = await api('POST', '/api/import', payload);
      toast(`Importate ${r.opportunita} schede e ${r.attivita} attività`);
      refresh();
    } catch (err) { toast('Importazione non riuscita: ' + err.message, 5000); }
  } });
  menuEl = h('div', { class: 'menu', onclick: (e) => e.stopPropagation() },
    h('a', { href: '/api/export.json', download: '' }, 'Esporta tutto (JSON)'),
    h('a', { href: '/api/export.csv', download: '' }, 'Esporta schede (CSV per Excel)'),
    h('button', { onclick: () => { closeMenu(); openPasteJson(); } }, 'Incolla JSON dell\'agent…'),
    h('button', { onclick: () => { file.click(); closeMenu(); } }, 'Importa file JSON…'),
    h('button', { onclick: async () => {
      closeMenu();
      try { const r = await api('POST', '/api/backup'); toast('Backup creato: ' + r.file); } catch (e) { toast(e.message); }
    } }, 'Crea backup ora'),
    h('button', { onclick: async () => { closeMenu(); await api('POST', '/api/logout'); showLogin(); } }, 'Esci'),
    S.versione ? h('div', { class: 'verline' }, APP_NAME + ' · V ' + S.versione) : null,
    file);
  if (shell && shell.frame) menuEl.style.top = Math.round(shell.frame.getBoundingClientRect().bottom + 4) + 'px';
  document.body.appendChild(menuEl);
}
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
document.addEventListener('click', closeMenu);

// ------------------------------------------------------------------- caricamento
async function refresh() {
  if (!shell) return;
  try {
    if (S.tab === 'schede') {
      const p = new URLSearchParams({ q: S.q, anno: S.anno });
      const d = await api('GET', '/api/opportunita?' + p);
      S.opps = d.items; S.tipologie = d.tipologie; S.anni = d.anni;
      renderBoard();
    } else {
      const p = new URLSearchParams({ q: S.q, stato: S.attFiltro });
      const [a, o] = await Promise.all([api('GET', '/api/attivita?' + p), api('GET', '/api/opportunita')]);
      S.att = a.items;
      S.oppAperte = o.items.filter((x) => x.stato !== 'Fatto').sort((x, y) => x.cliente.localeCompare(y.cliente, 'it'));
      renderAttivita();
    }
  } catch (e) { if (e.message !== 'Accesso richiesto') toast(e.message, 5000); }
}

// -------------------------------------------------------------------- board
function renderBoard() {
  const c = shell.content;
  const oggi = todayIso();

  const annoSel = h('select', { 'aria-label': 'Anno', onchange: (e) => { S.anno = e.target.value; refresh(); } },
    h('option', { value: '' }, 'Tutti gli anni'),
    ...S.anni.map((a) => h('option', { value: a, selected: a === S.anno }, a)));
  const filters = h('div', { class: 'filters' }, annoSel);

  const chips = h('div', { class: 'chips' }, ...STATI.map((st) =>
    h('button', { class: 'chip' + (S.stato === st ? ' on' : ''), onclick: () => { S.stato = st; renderBoard(); } },
      `${st} · ${S.opps.filter((o) => o.stato === st).length}`)));

  const cols = STATI.map((st) => {
    let items = S.opps.filter((o) => o.stato === st);
    const tot = items.length;
    if (st === 'Fatto') items.sort((a, b) => (b.data_chiusura || '').localeCompare(a.data_chiusura || ''));
    const limited = st === 'Fatto' && !S.q && !S.anno && !S.tutteFatte && items.length > FATTO_VISIBILI;
    if (limited) items = items.slice(0, FATTO_VISIBILI);
    const col = h('section', { class: 'col' + (S.stato === st ? ' on' : ''), 'data-stato': st,
      ondragover: (e) => { e.preventDefault(); col.classList.add('over'); },
      ondragleave: () => col.classList.remove('over'),
      ondrop: async (e) => {
        e.preventDefault(); col.classList.remove('over');
        const id = Number(e.dataTransfer.getData('text/plain'));
        const o = S.opps.find((x) => x.id === id);
        if (!o || o.stato === st) return;
        let esito = '';
        if (st === 'Fatto') {
          esito = await askEsito();
          if (!esito) return;
        }
        try { await api('PUT', '/api/opportunita/' + id, Object.assign({}, o, { stato: st, esito })); toast(`Spostata in ${st}`); refresh(); }
        catch (err) { toast(err.message); }
      } },
      h('h2', null, h('span', null, h('span', { class: 'dot', style: 'background:' + COLORI[st] }), st), h('span', { class: 'n' }, String(tot))),
      items.length ? items.map((o) => card(o, oggi)) : h('div', { class: 'empty' }, 'Nessuna scheda'),
      limited ? h('button', { class: 'more', onclick: () => { S.tutteFatte = true; renderBoard(); } },
        `Mostra tutte (${tot})`) : null);
    return col;
  });

  c.replaceChildren(filters, chips, h('div', { class: 'board' }, cols));
}

function eurTag(label, n) {
  return n !== null && n !== undefined ? h('span', { class: 'tag val' }, label + fmtEur(n)) : null;
}

function card(o, oggi) {
  const dataRif = o.stato === 'Delivery' ? o.data_collaudo : o.scadenza;
  const late = dataRif && dataRif < oggi && o.stato !== 'Fatto';
  const euro = o.stato === 'Prospect' ? [eurTag('', o.valore)]
    : [eurTag('UT ', o.ut), eurTag('CA ', o.ca), eurTag('VEND. ', o.vendita)];
  if (o.stato === 'Fatto' && euro.every((x) => !x)) euro.push(eurTag('', o.valore));
  const el = h('div', { class: 'card', role: 'button', tabindex: '0', draggable: 'true',
    onclick: () => openForm({ id: o.id }),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openForm({ id: o.id }); } },
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(o.id)); e.dataTransfer.effectAllowed = 'move'; } },
    h('div', { class: 'cl' }, o.cliente),
    o.titolo ? h('div', { class: 'ti' }, o.titolo) : null,
    h('div', { class: 'meta' },
      o.op_sdw ? h('span', { class: 'tag op' }, o.op_sdw) : null,
      o.tipologia ? h('span', { class: 'tag' }, o.tipologia) : null,
      euro,
      o.stato === 'Fatto' && o.esito ? h('span', { class: 'tag ' + (o.esito === 'Vinta' ? 'vinta' : 'persa') }, o.esito) : null,
      o.stato === 'Fatto' && o.data_chiusura ? h('span', { class: 'tag' }, '✓ ' + fmtDate(o.data_chiusura)) : null,
      dataRif && o.stato !== 'Fatto'
        ? h('span', { class: 'tag' + (late ? ' late' : '') }, '⏰ ' + (o.stato === 'Delivery' ? 'Collaudo ' : '') + fmtDate(dataRif)) : null));
  return el;
}

// --------------------------------------------------------------- Day by Day
function renderAttivita() {
  const c = shell.content;
  const oggi = todayIso();
  const titolo = h('input', { id: 'att-titolo', type: 'text', placeholder: 'Nuova attività…', maxlength: '500' });
  const data = h('input', { type: 'date', value: oggi, 'aria-label': 'Data' });
  const coll = h('select', { 'aria-label': 'Collega a una scheda' },
    h('option', { value: '' }, 'Nessuna scheda'),
    ...S.oppAperte.map((o) => h('option', { value: String(o.id) }, o.cliente + (o.titolo ? ' – ' + o.titolo : ''))));
  const add = async () => {
    if (!titolo.value.trim()) { titolo.focus(); return; }
    try {
      await api('POST', '/api/attivita', { titolo: titolo.value, data: data.value, opportunita_id: coll.value || null });
      titolo.value = '';
      refresh();
    } catch (e) { toast(e.message); }
  };
  titolo.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const addrow = h('div', { class: 'addrow' }, titolo,
    h('div', { class: 'line' }, data, coll, h('button', { class: 'btn primary', onclick: add }, 'Aggiungi')));

  const seg = h('div', { class: 'seg' }, ...[['aperte', 'Da fare'], ['fatte', 'Fatte'], ['tutte', 'Tutte']].map(([k, l]) =>
    h('button', { class: 'chip' + (S.attFiltro === k ? ' on' : ''), onclick: () => { S.attFiltro = k; refresh(); } }, l)));

  const list = S.att.length ? S.att.map((a) => {
    const late = a.data && a.data < oggi && !a.fatto;
    return h('div', { class: 'att' + (a.fatto ? ' done' : '') },
      h('input', { type: 'checkbox', checked: !!a.fatto, 'aria-label': 'Fatta', onchange: async (e) => {
        try { await api('PUT', '/api/attivita/' + a.id, Object.assign({}, a, { fatto: e.target.checked })); refresh(); }
        catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
      } }),
      h('div', { class: 'body' }, h('div', { class: 'tt' }, a.titolo),
        h('div', { class: 'sub' },
          a.data ? h('span', { class: late ? 'tag late' : '' }, fmtDate(a.data)) : null,
          a.opportunita_id ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); openForm({ id: a.opportunita_id }); } }, a.cliente) : null)),
      h('button', { class: 'x', 'aria-label': 'Elimina', onclick: async () => {
        if (!confirm('Eliminare questa attività?')) return;
        try { await api('DELETE', '/api/attivita/' + a.id); refresh(); } catch (err) { toast(err.message); }
      } }, '×'));
  }) : h('div', { class: 'empty' }, S.attFiltro === 'aperte' ? 'Niente da fare 🎉' : 'Nessuna attività');

  c.replaceChildren(h('div', { class: 'dbd' }, addrow, seg, list));
}

// -------------------------------------------------------------- scheda (form)
function field(label, input, cls) {
  return h('div', { class: 'field' + (cls ? ' ' + cls : '') }, h('label', null, label), input);
}

function openDialog(build) {
  const dlg = h('dialog');
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  build(dlg);
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

// Chiede l'esito (Vinta/Persa) quando una scheda viene trascinata in Fatto. Restituisce '' se annullato.
function askEsito() {
  return new Promise((resolve) => {
    openDialog((dlg) => {
      let scelta = '';
      dlg.addEventListener('close', () => resolve(scelta));
      const pick = (v) => () => { scelta = v; dlg.close(); };
      dlg.appendChild(h('div', { class: 'dlg' },
        h('header', null, h('h3', null, 'Come si è chiusa?'),
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, '✕')),
        h('div', { class: 'content' }, h('p', { class: 'hint' }, 'Scegli l\'esito: la scheda passa in Fatto.')),
        h('footer', null, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annulla'),
          h('button', { class: 'btn', onclick: pick('Persa') }, 'Persa'),
          h('button', { class: 'btn primary', onclick: pick('Vinta') }, 'Vinta'))));
    });
  });
}

async function openForm(opts) {
  opts = opts || {};
  let o;
  const isNew = !opts.id;
  try {
    o = isNew
      ? Object.assign({ cliente: '', titolo: '', stato: opts.stato || 'Prospect', referente: '', contatti: '', tipologia: '',
        valore: null, data_apertura: todayIso(), scadenza: '', data_chiusura: '', note: '', storico: [], attivita: [],
        op_sdw: '', team: '', ut: null, ca: null, vendita: null, data_collaudo: '', post_vendita: '', esito: '' }, opts.draft || {})
      : await api('GET', '/api/opportunita/' + opts.id);
  } catch (e) { toast(e.message); return; }
  const draft = opts.draft || null;

  openDialog((dlg) => {
    const err = h('div', { class: 'err', role: 'alert' });
    const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    const eur = (v) => h('input', { type: 'text', inputmode: 'decimal', value: num(v), placeholder: '€' });
    const i = {
      cliente: h('input', { type: 'text', value: o.cliente || '', maxlength: '300', autocomplete: 'off' }),
      op_sdw: h('input', { type: 'text', value: o.op_sdw || '', maxlength: '11', autocomplete: 'off',
        autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'OP SDW' }),
      titolo: h('input', { type: 'text', value: o.titolo || '', maxlength: '300', placeholder: 'es. Migrazione a Google Workspace' }),
      stato: h('select', null, ...STATI.map((s) => h('option', { value: s, selected: s === o.stato }, s))),
      esito: h('select', null, h('option', { value: '' }, '— scegli —'),
        ...ESITI.map((s) => h('option', { value: s, selected: s === o.esito }, s))),
      tipologia: h('input', { type: 'text', value: o.tipologia || '', maxlength: '200', list: 'dl-tipologie' }),
      referente: h('input', { type: 'text', value: o.referente || '', maxlength: '300' }),
      contatti: h('input', { type: 'text', value: o.contatti || '', maxlength: '1000', placeholder: 'telefono, email…' }),
      team: h('input', { type: 'text', value: o.team || '', maxlength: '300' }),
      valore: eur(o.valore),
      ut: eur(o.ut),
      ca: eur(o.ca),
      vendita: eur(o.vendita),
      data_apertura: h('input', { type: 'date', value: o.data_apertura || '' }),
      scadenza: h('input', { type: 'date', value: o.scadenza || '' }),
      data_collaudo: h('input', { type: 'date', value: o.data_collaudo || '' }),
      data_chiusura: h('input', { type: 'date', value: o.data_chiusura || '' }),
      post_vendita: h('input', { type: 'text', value: o.post_vendita || '', maxlength: '300' }),
      note: h('textarea', { maxlength: '20000' }),
    };
    i.note.value = o.note || '';
    i.op_sdw.addEventListener('input', () => {  // sempre maiuscolo, solo lettere e numeri
      const v = i.op_sdw.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v !== i.op_sdw.value) i.op_sdw.value = v;
    });

    // Campi per stato. I campi nascosti restano nel database: nulla viene cancellato cambiando stato.
    const fOp = field('OP SDW', i.op_sdw, 'opsdw');
    const fEsito = field('Esito *', i.esito);
    const fTeam = field('Team progettista / competence', i.team);
    const fValore = field('Valore stimato (€)', i.valore);
    const fScad = field('Scadenza', i.scadenza);
    const fChiusura = field('Data chiusura', i.data_chiusura);
    const rowCl = h('div', { class: 'rowcl' }, field('Cliente *', i.cliente, 'grow'), fOp);
    const rowEco = h('div', { class: 'grid2' }, fValore, fScad);
    const rowEuro = h('div', { class: 'grid3' },
      field('UT (€)', i.ut), field('CA (€)', i.ca), field('VENDITA (€)', i.vendita));
    const rowColl = h('div', { class: 'grid2' }, field('Data collaudo', i.data_collaudo), field('Nome post vendita', i.post_vendita));
    const rowDate = h('div', { class: 'grid2' }, field('Data apertura', i.data_apertura), fChiusura);
    const syncStato = () => {
      const st = i.stato.value;
      const dalProgetto = st !== 'Prospect';
      fOp.hidden = !dalProgetto;
      fTeam.hidden = !dalProgetto;
      rowEuro.hidden = !dalProgetto;
      fValore.hidden = !(st === 'Prospect' || (st === 'Fatto' && i.valore.value.trim() !== ''));
      fScad.hidden = !(st === 'Prospect' || st === 'Progetto');
      rowEco.hidden = fValore.hidden && fScad.hidden;
      rowColl.hidden = !(st === 'Delivery' || st === 'Fatto');
      fEsito.hidden = st !== 'Fatto';
      fChiusura.hidden = st !== 'Fatto';
    };
    i.stato.addEventListener('change', syncStato);
    syncStato();

    const dl = h('datalist', { id: 'dl-tipologie' }, ...S.tipologie.map((t) => h('option', { value: t })));

    // attività suggerite (bozza vocale)
    const sugg = ((draft && draft.attivita) || []).map((a) => ({
      on: h('input', { type: 'checkbox', checked: true, 'aria-label': 'Includi' }),
      t: h('input', { type: 'text', value: a.titolo, maxlength: '500' }),
      d: h('input', { type: 'date', value: a.data || '' }),
    }));

    // attività collegate (scheda esistente)
    const attBox = h('div');
    const renderAtt = (list) => {
      attBox.replaceChildren(...list.map((a) => h('div', { class: 'att' + (a.fatto ? ' done' : '') },
        h('input', { type: 'checkbox', checked: !!a.fatto, onchange: async (e) => {
          try { await api('PUT', '/api/attivita/' + a.id, Object.assign({}, a, { fatto: e.target.checked })); reloadAtt(); }
          catch (er) { toast(er.message); }
        } }),
        h('div', { class: 'body' }, h('div', { class: 'tt' }, a.titolo), a.data ? h('div', { class: 'sub' }, fmtDate(a.data)) : null),
        h('button', { class: 'x', 'aria-label': 'Elimina', onclick: async () => {
          try { await api('DELETE', '/api/attivita/' + a.id); reloadAtt(); } catch (er) { toast(er.message); }
        } }, '×'))));
    };
    const reloadAtt = async () => { try { renderAtt((await api('GET', '/api/opportunita/' + o.id)).attivita); } catch (er) { toast(er.message); } };
    const newT = h('input', { type: 'text', placeholder: 'Nuova attività per questa scheda…', maxlength: '500', style: 'flex:1;min-width:0;padding:9px;border-radius:8px;border:1px solid var(--line);background:var(--card)' });
    const newD = h('input', { type: 'date', style: 'padding:9px;border-radius:8px;border:1px solid var(--line);background:var(--card)' });
    const addAtt = async () => {
      if (!newT.value.trim()) return;
      try { await api('POST', '/api/attivita', { titolo: newT.value, data: newD.value, opportunita_id: o.id }); newT.value = ''; newD.value = ''; reloadAtt(); }
      catch (er) { toast(er.message); }
    };

    const dupBanner = h('div', { class: 'banner', hidden: true });
    if (isNew && draft) {
      api('GET', '/api/opportunita?q=' + encodeURIComponent(o.cliente || '')).then((d) => {
        const same = d.items.filter((x) => x.cliente.toLowerCase() === (o.cliente || '').toLowerCase());
        if (o.cliente && same.length) { dupBanner.textContent = `Esiste già ${same.length === 1 ? 'una scheda' : same.length + ' schede'} per «${o.cliente}» (${same.map((x) => x.stato).join(', ')}). Controlla di non creare un doppione.`; dupBanner.hidden = false; }
      }).catch(() => {});
    }

    const save = async () => {
      err.textContent = '';
      if (!i.cliente.value.trim()) { err.textContent = 'Il campo Cliente è obbligatorio.'; i.cliente.focus(); return; }
      if (i.stato.value === 'Fatto' && !i.esito.value) { err.textContent = 'Indica l\'esito: Vinta o Persa.'; i.esito.focus(); return; }
      const payload = {};
      for (const k of Object.keys(i)) payload[k] = i[k].value;
      try {
        if (isNew) {
          payload.attivita = sugg.filter((s) => s.on.checked && s.t.value.trim()).map((s) => ({ titolo: s.t.value, data: s.d.value || null }));
          const created = await api('POST', '/api/opportunita', payload);
          S.stato = created.stato;
        } else {
          await api('PUT', '/api/opportunita/' + o.id, payload);
          S.stato = payload.stato;
        }
        dlg.close(); toast('Scheda salvata'); refresh();
      } catch (e) { err.textContent = e.message; }
    };

    const del = isNew ? null : h('button', { class: 'btn danger', onclick: async () => {
      if (!confirm(`Eliminare definitivamente la scheda «${o.cliente}»? Le attività collegate resteranno, senza collegamento.`)) return;
      try { await api('DELETE', '/api/opportunita/' + o.id); dlg.close(); toast('Scheda eliminata'); refresh(); } catch (e) { err.textContent = e.message; }
    } }, 'Elimina');

    const storico = (o.storico || []).length ? h('ul', { class: 'hist' }, ...o.storico.map((s) =>
      h('li', null, `${fmtDate(s.data.slice(0, 10))} – ${s.da ? s.da + ' → ' : 'Creata come '}${s.a}`))) : null;

    dlg.appendChild(h('div', { class: 'dlg' },
      h('header', null, h('h3', null, isNew ? (draft ? (draft.fonte === 'agent' ? 'Bozza dall\'agent' : 'Bozza da nota vocale') : 'Nuova scheda') : 'Scheda'),
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'content' },
        draft ? h('div', { class: 'info' }, draft.fonte === 'agent'
          ? 'Bozza creata dal JSON dell\'agent: controlla ogni campo prima di salvare. Niente è stato ancora registrato.'
          : 'Bozza compilata da Gemini: controlla ogni campo prima di salvare. Niente è stato ancora registrato.') : null,
        dupBanner,
        rowCl,
        field('Titolo / oggetto', i.titolo),
        h('div', { class: 'grid2' }, field('Stato', i.stato), field('Tipologia', i.tipologia)),
        fEsito,
        h('div', { class: 'grid2' }, field('Referente', i.referente), field('Contatti', i.contatti)),
        fTeam,
        rowEco,
        rowEuro,
        rowColl,
        rowDate,
        field('Note', i.note),
        dl,
        draft && draft.trascrizione ? h('details', { class: 'trans' }, h('summary', null, 'Trascrizione dell\'audio'), h('p', null, draft.trascrizione)) : null,
        sugg.length ? h('div', null, h('div', { class: 'sect' }, 'Attività suggerite'),
          ...sugg.map((s) => h('div', { class: 'sugg' }, s.on, s.t, s.d))) : null,
        !isNew ? h('div', null, h('div', { class: 'sect' }, 'Attività collegate'), attBox,
          h('div', { class: 'sugg' }, newT, newD, h('button', { class: 'btn', onclick: addAtt }, '+'))) : null,
        storico ? h('div', null, h('div', { class: 'sect' }, 'Storico stati'), storico) : null,
        err),
      h('footer', null, del, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annulla'),
        h('button', { class: 'btn primary', onclick: save }, 'Salva'))));
    if (!isNew) renderAtt(o.attivita || []);
    newT.addEventListener('keydown', (e) => { if (e.key === 'Enter') addAtt(); });
  });
}

// ------------------------------------------------------- JSON incollato dall'agent
// Prende il JSON dal testo incollato: blocco ```json oppure il primo { ... } fino all'ultimo }.
function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  return a >= 0 && b > a ? text.slice(a, b + 1) : '';
}

function openPasteJson() {
  openDialog((dlg) => {
    const err = h('div', { class: 'err', role: 'alert' });
    const ta = h('textarea', { rows: '14', placeholder: 'Incolla qui la risposta dell\'agent (anche con il blocco ```json)',
      style: 'width:100%;font-family:monospace;font-size:13px;box-sizing:border-box' });
    const go = async () => {
      err.textContent = '';
      const txt = extractJson(ta.value);
      if (!txt) { err.textContent = 'Non trovo un blocco JSON nel testo.'; return; }
      let obj;
      try { obj = JSON.parse(txt); } catch (e) { err.textContent = 'JSON non valido: ' + e.message; return; }
      try {
        const draft = await api('POST', '/api/bozza-json', obj);
        dlg.close();
        openForm({ draft, stato: draft.stato });
      } catch (e) { err.textContent = e.message; }
    };
    dlg.appendChild(h('div', { class: 'dlg' },
      h('header', null, h('h3', null, 'Incolla JSON dell\'agent'),
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'content' },
        h('p', { class: 'hint' }, 'Il testo viene controllato e trasformato in una bozza. Nulla viene salvato finché non premi Salva.'),
        ta, err),
      h('footer', null, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annulla'),
        h('button', { class: 'btn primary', onclick: go }, 'Crea bozza'))));
  });
}

// ------------------------------------------------------------------- voce
function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let k = 0; k < samples.length; k++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[k]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function resample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  if (ratio > 1) { // riduzione: media dei campioni (filtro semplice, evita rumore)
    for (let k = 0; k < n; k++) {
      const a = Math.floor(k * ratio), b = Math.min(data.length, Math.floor((k + 1) * ratio));
      let s = 0;
      for (let j = a; j < b; j++) s += data[j];
      out[k] = s / Math.max(1, b - a);
    }
  } else {
    for (let k = 0; k < n; k++) {
      const pos = k * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, data.length - 1), f = pos - i0;
      out[k] = data[i0] * (1 - f) + data[i1] * f;
    }
  }
  return out;
}

async function fileToWav(file) {
  if (file.size > 60 * 1024 * 1024) throw new Error('File troppo grande');
  const ab = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let buf;
  try { buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); }
  catch (e) { throw new Error('Formato audio non leggibile da questo browser'); }
  finally { ctx.close(); }
  const n = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let k = 0; k < n; k++) mono[k] += d[k] / ch; }
  const out = resample(mono, buf.sampleRate, 16000);
  if (out.length > 16000 * 600) throw new Error('Audio troppo lungo (massimo 10 minuti)');
  return encodeWav(out, 16000);
}

function openVoice() {
  openDialog((dlg) => {
    let rec = null;      // { ctx, stream, proc, src, chunks, rate, timer, t0 }
    let busy = false;
    const status = h('div', { class: 'hint' }, 'Tocca il microfono e racconta l\'opportunità: cliente, cosa serve, referente, valore, scadenze, cosa fare.');
    const timer = h('div', { class: 'timer' }, '0:00');
    const err = h('div', { class: 'err', role: 'alert' });
    const btn = h('button', { class: 'recbtn', 'aria-label': 'Registra', onclick: () => (rec ? stop() : start()) }, '🎙');
    const file = h('input', { type: 'file', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f || busy) return;
      try { setBusy('Preparo il file audio…'); send(await fileToWav(f)); } catch (er) { fail(er.message); }
    } });
    const pick = h('button', { class: 'btn', onclick: () => file.click() }, 'Oppure carica un file audio');

    const setBusy = (msg) => { busy = true; btn.disabled = true; pick.disabled = true; err.textContent = ''; status.replaceChildren(h('span', { class: 'spin' }), msg); };
    const fail = (msg) => { busy = false; btn.disabled = false; pick.disabled = false; err.textContent = msg; status.textContent = 'Riprova quando vuoi.'; };

    async function start() {
      err.textContent = '';
      if (!navigator.mediaDevices || !window.isSecureContext) { fail('Il microfono richiede una connessione HTTPS.'); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { fail('Microfono non disponibile: controlla il permesso del browser.'); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      try { await ctx.resume(); } catch (e) { /* ignora */ }
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      proc.onaudioprocess = (ev) => chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
      rec = { ctx, stream, proc, src, chunks, rate: ctx.sampleRate, t0: Date.now() };
      btn.classList.add('on'); btn.textContent = '■'; btn.setAttribute('aria-label', 'Ferma');
      status.textContent = 'Sto registrando… tocca ■ per terminare.';
      rec.timer = setInterval(() => {
        const s = Math.floor((Date.now() - rec.t0) / 1000);
        timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= MAX_REC_SEC) stop();
      }, 250);
    }

    async function stop() {
      const r = rec; rec = null;
      clearInterval(r.timer);
      r.proc.disconnect(); r.src.disconnect();
      r.stream.getTracks().forEach((t) => t.stop());
      r.ctx.close();
      btn.classList.remove('on'); btn.textContent = '🎙';
      let total = 0; r.chunks.forEach((c) => { total += c.length; });
      if (total < r.rate) { fail('Registrazione troppo breve.'); return; }
      const all = new Float32Array(total); let off = 0;
      r.chunks.forEach((c) => { all.set(c, off); off += c.length; });
      setBusy('Gemini sta ascoltando e compilando la scheda…');
      send(encodeWav(resample(all, r.rate, 16000), 16000));
    }

    async function send(blob) {
      setBusy('Gemini sta ascoltando e compilando la scheda…');
      try {
        const draft = await api('POST', '/api/voice', undefined, { body: blob, type: 'audio/wav' });
        dlg.close();
        openForm({ draft, stato: draft.stato });
      } catch (e) { fail(e.message); }
    }

    dlg.addEventListener('close', () => {
      if (rec) { clearInterval(rec.timer); rec.stream.getTracks().forEach((t) => t.stop()); try { rec.ctx.close(); } catch (e) { /* ignora */ } rec = null; }
    });

    dlg.appendChild(h('div', { class: 'dlg' },
      h('header', null, h('h3', null, 'Nota vocale'), h('button', { class: 'btn', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'content' }, h('div', { class: 'rec' }, btn, timer, status), err,
        h('div', { style: 'text-align:center;margin-top:10px' }, pick, file),
        h('p', { class: 'hint' }, 'L\'audio viene inviato a Gemini solo per generare la bozza e non viene salvato sul server. Prima di salvare potrai correggere ogni campo.'))));
  });
}

// ----------------------------------------------------------------------- avvio
async function start() {
  try {
    const cfg = await api('GET', '/api/config');
    S.voce = cfg.voce;
    S.versione = cfg.versione || '';
  } catch (e) {
    if (e.message === 'Accesso richiesto') return showLogin();
    root.replaceChildren(h('div', { class: 'login' }, h('p', null, 'Impossibile contattare il server: ' + e.message)));
    return;
  }
  buildShell();
  refresh();
}

start();
})();
