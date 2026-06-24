// Netivot Olam — single-page Hebrew RTL app. One scrolling page with a sticky
// player panel in the sidebar (always available). Branding + user live in the
// sidebar too, so there's no separate top header.
// All text is set via textContent / safe DOM construction (no innerHTML).

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}
const $ = (id) => document.getElementById(id);

const api = {
  async get(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (r.status === 401) throw { unauthorized: true };
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'הבקשה נכשלה');
    return r.json();
  },
};

const state = {
  me: null,
  rabbis: [],
  facets: { parshiyot: [], years: [] },
  filters: { rabbi: '', parasha: '', date: '', hyear: '', q: '' },
  results: [],
  page: 1,
  pageSize: 10,
  current: null,
};

const audio = $('audio');

// --- boot ----------------------------------------------------------------
async function init() {
  try { state.me = await api.get('/api/auth/me'); }
  catch { return showLogin(); }
  await onAuthed();
}

function showLogin() {
  $('login').classList.remove('hidden');
  $('shell').classList.add('hidden');
}

async function onAuthed() {
  $('login').classList.add('hidden');
  $('shell').classList.remove('hidden');
  $('nav-greeting').textContent = `שלום, ${(state.me.email || '').split('@')[0]}`;
  if (state.me.isAdmin) $('admin-link').classList.remove('hidden');
  await Promise.all([loadRabbis(), loadFacets()]);
  renderRabbis();
  renderFilters();
  renderPlayerPanel();
  runSearch();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-error');
  err.classList.add('hidden');
  try {
    state.me = await api.post('/api/auth/login', { email: $('email').value, password: $('password').value });
    await onAuthed();
  } catch (ex) {
    err.textContent = ex.message || 'ההתחברות נכשלה';
    err.classList.remove('hidden');
  }
});

$('logout').addEventListener('click', async () => {
  await api.post('/api/auth/logout');
  location.reload();
});

async function loadRabbis() {
  try { state.rabbis = await (await fetch('/rabbis.json', { credentials: 'same-origin' })).json(); }
  catch { state.rabbis = []; }
}
async function loadFacets() {
  try {
    const f = await api.get('/api/lessons/facets');
    state.facets = { parshiyot: f.parshiyot || [], years: f.years || [] };
  } catch {}
}

// --- rabbi carousel ------------------------------------------------------
function renderRabbis() {
  const track = el('div', { class: 'carousel-track' });
  for (const r of state.rabbis) track.append(rabbiButton(r));
  const scroll = (dir) => track.scrollBy({ left: dir * 240, behavior: 'smooth' });
  $('rabbis-card').replaceChildren(
    el('h2', { class: 'card-title', text: 'בחרו רב' }),
    el('div', { class: 'carousel' },
      el('button', { class: 'carousel-btn', 'aria-label': 'הקודם', onclick: () => scroll(1) }, '‹'),
      track,
      el('button', { class: 'carousel-btn', 'aria-label': 'הבא', onclick: () => scroll(-1) }, '›'))
  );
}

function rabbiButton(r) {
  const parts = formatRabbiParts(r.rabbi_name);
  const ring = el('div', { class: 'avatar-ring' });
  const avatar = el('div', { class: 'avatar' });
  const img = el('img', { alt: r.rabbi_name, src: picUrl(r.pic) });
  img.addEventListener('error', () => { avatar.textContent = initials(parts.name); avatar.classList.add('avatar-fallback'); });
  avatar.append(img);
  ring.append(avatar);

  const nameBox = el('div', { class: 'r-name' },
    parts.role ? el('div', { class: 'r-role', text: parts.role }) : null,
    el('div', { class: 'r-main', text: parts.name }),
    parts.honor ? el('div', { class: 'r-honor', text: parts.honor }) : null);

  const btn = el('button', { class: 'rabbi' + (state.filters.rabbi === r.rabbi_name ? ' selected' : '') }, ring, nameBox);
  btn.addEventListener('click', () => {
    state.filters.rabbi = state.filters.rabbi === r.rabbi_name ? '' : r.rabbi_name;
    state.page = 1;
    renderRabbis();
    runSearch();
  });
  return btn;
}

// --- filters -------------------------------------------------------------
function renderFilters() {
  const f = state.filters;
  const q = el('input', { type: 'search', placeholder: 'חיפוש לפי רב, פרשה או כותרת…', value: f.q,
    oninput: (e) => { f.q = e.target.value; debouncedSearch(); } });
  const hyear = selectField(state.facets.years, 'כל השנים', f.hyear, (v) => { f.hyear = v; state.page = 1; runSearch(); });
  const date = el('input', { type: 'date', value: f.date, onchange: (e) => { f.date = e.target.value; state.page = 1; runSearch(); } });
  const parasha = selectField(state.facets.parshiyot, 'כל הפרשות', f.parasha, (v) => { f.parasha = v; state.page = 1; runSearch(); });

  $('filters-card').replaceChildren(
    el('h2', { class: 'card-title', text: 'סינון שיעורים' }),
    el('div', { class: 'filters-grid' },
      field('מילות מפתח', q), field('שנת הלוח העברי', hyear), field('תאריך', date), field('פרשה', parasha)),
    el('div', { class: 'filters-actions' },
      el('button', { class: 'btn-ghost', onclick: resetFilters }, 'אפס מסננים'))
  );
}

function field(labelText, control) { return el('div', { class: 'field' }, el('label', { text: labelText }), control); }
function selectField(values, allLabel, current, onChange) {
  const sel = el('select', { onchange: (e) => onChange(e.target.value) });
  sel.append(new Option(allLabel, ''));
  for (const v of values) { const o = new Option(v, v); if (v === current) o.selected = true; sel.append(o); }
  return sel;
}
function resetFilters() {
  state.filters = { rabbi: '', parasha: '', date: '', hyear: '', q: '' };
  state.page = 1;
  renderRabbis(); renderFilters(); runSearch();
}

let searchTimer;
function debouncedSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.page = 1; runSearch(); }, 220); }

// --- results -------------------------------------------------------------
async function runSearch() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state.filters)) if (v) params.set(k, v);
  state.results = await api.get('/api/lessons?' + params.toString());
  renderResults();
}

function renderResults() {
  const wrap = $('results');
  wrap.replaceChildren(chipsBar());
  if (state.results.length === 0) {
    wrap.append(el('div', { class: 'table-card' }, el('div', { class: 'empty', text: 'לא נמצאו שיעורים' })));
    return;
  }
  wrap.append(
    el('div', { class: 'muted', style: 'margin:4px 2px 10px', text: `${state.results.length} שיעורים` }),
    resultsTable(),
    pager()
  );
}

function chipsBar() {
  const f = state.filters;
  const bar = el('div', { class: 'chips' });
  const add = (label, key, display) => {
    if (!f[key]) return;
    bar.append(el('span', { class: 'chip' }, `${label}: ${display || f[key]}`,
      el('button', { class: 'chip-x', onclick: () => { f[key] = ''; state.page = 1; renderRabbis(); renderFilters(); runSearch(); } }, '✕')));
  };
  add('הרב', 'rabbi', formatRabbiParts(f.rabbi).name); add('פרשה', 'parasha'); add('שנה', 'hyear'); add('תאריך', 'date'); add('חיפוש', 'q');
  return bar;
}

function resultsTable() {
  const start = (state.page - 1) * state.pageSize;
  const rows = state.results.slice(start, start + state.pageSize);
  const tbody = el('tbody');
  for (const l of rows) tbody.append(lessonRow(l));
  return el('div', { class: 'table-card' },
    el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'רב' }), el('th', { text: 'פרשה' }), el('th', { text: 'תאריך' }),
        el('th', { text: 'שנת הלוח' }), el('th', { text: 'משך' }), el('th', { text: 'פעולות' }))),
      tbody));
}

function lessonRow(l) {
  const ex = l.extra || {};
  const isCurrent = state.current && state.current.id === l.id;
  const download = el('a', { class: 'icon-btn', href: `/api/lessons/${l.id}/stream`, download: '', title: 'הורדה',
    onclick: (e) => e.stopPropagation() }, '⤓');
  const play = el('span', { class: 'play-circle', title: 'נגן' }, isCurrent && !audio.paused ? '❚❚' : '▶');
  return el('tr', { class: isCurrent ? 'playing' : '', onclick: () => playLesson(l) },
    el('td', { text: formatRabbiParts(l.rabbi).name || '—' }),
    el('td', { text: l.parasha || '—' }),
    el('td', { text: ex.hebrew_date || formatGreg(l.lesson_date) || '—' }),
    el('td', { text: ex.hebrew_year_str || '—' }),
    el('td', { text: fmtTime(l.duration) }),
    el('td', {}, el('div', { class: 'row-actions' }, download, play)));
}

function pager() {
  const pages = Math.ceil(state.results.length / state.pageSize);
  const wrap = el('div', { class: 'pager' });
  if (pages <= 1) return wrap;
  const go = (p) => { state.page = p; renderResults(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  wrap.append(el('button', { disabled: state.page === 1 ? '' : null, onclick: () => go(state.page - 1) }, 'הקודם'));
  for (let p = 1; p <= pages; p++) wrap.append(el('button', { class: p === state.page ? 'active' : '', onclick: () => go(p) }, String(p)));
  wrap.append(el('button', { disabled: state.page === pages ? '' : null, onclick: () => go(state.page + 1) }, 'הבא'));
  return wrap;
}

// --- sidebar player panel (persistent) -----------------------------------
function renderPlayerPanel() {
  const art = el('div', { id: 'np-art', class: 'np-art' }, el('span', { class: 'np-note', text: '♪' }));
  const title = el('div', { id: 'np-title', class: 'np-title', text: 'בחר שיעור להאזנה' });
  const rabbi = el('div', { id: 'np-rabbi', class: 'np-rabbi' });
  const date = el('div', { id: 'np-date', class: 'np-date muted' });

  const seek = el('input', { id: 'np-seek', type: 'range', min: '0', max: '100', value: '0', step: '1',
    oninput: (e) => { if (audio.duration) audio.currentTime = (Number(e.target.value) / 100) * audio.duration; } });
  const cur = el('span', { id: 'np-cur', text: '0:00' });
  const tot = el('span', { id: 'np-tot', text: '0:00' });

  const playBtn = el('button', { id: 'np-play', class: 'np-play', 'aria-label': 'נגן/השהה', onclick: togglePlay }, '▶');
  const speed = el('button', { id: 'np-speed', class: 'np-mini', onclick: cycleSpeed }, '1x');
  const vol = el('input', { id: 'np-vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(audio.volume),
    oninput: (e) => { audio.volume = Number(e.target.value); } });
  const dl = el('a', { id: 'np-dl', class: 'np-mini', href: '#', download: '', title: 'הורדה' }, '⤓');

  $('player').replaceChildren(
    el('div', { class: 'np-card' },
      art, title, rabbi, date,
      el('div', { class: 'np-progress' }, seek, el('div', { class: 'np-times' }, cur, tot)),
      el('div', { class: 'np-controls' },
        el('button', { class: 'np-skip', 'aria-label': 'אחורה 10', onclick: () => skip(-10) }, '↺'),
        playBtn,
        el('button', { class: 'np-skip', 'aria-label': 'קדימה 10', onclick: () => skip(10) }, '↻')),
      el('div', { class: 'np-extra' }, speed, el('span', { class: 'np-vol' }, '🔊', vol), dl))
  );

  audio.onplay = () => { $('np-play').textContent = '❚❚'; refreshRowIcons(); };
  audio.onpause = () => { $('np-play').textContent = '▶'; refreshRowIcons(); };
  audio.onloadedmetadata = () => { if (isFinite(audio.duration)) $('np-tot').textContent = fmtTime(audio.duration); };
  audio.ontimeupdate = () => {
    if (!audio.duration) return;
    $('np-seek').value = String((audio.currentTime / audio.duration) * 100);
    $('np-cur').textContent = fmtTime(audio.currentTime);
  };
}

async function playLesson(l) {
  state.current = l;
  const ex = l.extra || {};
  const parts = formatRabbiParts(l.rabbi);
  $('np-title').textContent = l.title || l.parasha || 'שיעור';
  $('np-rabbi').textContent = parts.name || '';
  $('np-date').textContent = [l.parasha, ex.hebrew_date || formatGreg(l.lesson_date)].filter(Boolean).join(' · ');
  $('np-tot').textContent = fmtTime(l.duration);
  $('np-dl').setAttribute('href', `/api/lessons/${l.id}/stream`);
  setArt(rabbiPicFor(l.rabbi));
  refreshRowIcons();

  try {
    const { url } = await api.get(`/api/lessons/${l.id}/play-url`);
    audio.src = url;
  } catch {
    audio.src = `/api/lessons/${l.id}/stream`;
  }
  audio.play().catch(() => {});
}

function setArt(pic) {
  const art = $('np-art');
  if (!art) return;
  if (pic) {
    const img = el('img', { alt: '', src: pic });
    img.addEventListener('error', () => { art.replaceChildren(el('span', { class: 'np-note', text: '♪' })); });
    art.replaceChildren(img);
  } else {
    art.replaceChildren(el('span', { class: 'np-note', text: '♪' }));
  }
}

function refreshRowIcons() { renderResults(); }
function togglePlay() { if (!state.current) return; audio.paused ? audio.play() : audio.pause(); }
function skip(sec) { audio.currentTime = Math.max(0, audio.currentTime + sec); }
function cycleSpeed(e) {
  const steps = [1, 1.25, 1.5, 2];
  const next = steps[(steps.indexOf(audio.playbackRate) + 1) % steps.length];
  audio.playbackRate = next;
  e.target.textContent = next + 'x';
}

// --- helpers -------------------------------------------------------------
// Split a rabbi name into role / name / honorific for nicer display.
function formatRabbiParts(raw) {
  let s = String(raw || '').trim();
  let role = '', honor = '';
  const m = s.match(/(שליט[״"']?א)\s*$/);
  if (m) { honor = m[1]; s = s.slice(0, m.index).trim(); }
  for (const r of ['ראש הישיבה', 'המשגיח']) {
    if (s.startsWith(r)) { role = r; s = s.slice(r.length).trim(); break; }
  }
  return { role, name: s, honor };
}
function rabbiPicFor(rabbiName) {
  if (!rabbiName) return '';
  const hit = state.rabbis.find((r) => rabbiName.includes(formatRabbiParts(r.rabbi_name).name) || r.rabbi_name.includes(rabbiName));
  return hit ? picUrl(hit.pic) : '';
}
function initials(name) {
  const p = String(name).replace('הרב', '').trim().split(/\s+/).filter(Boolean);
  return (p.slice(-1)[0] || name || '').slice(0, 2);
}
function picUrl(pic) { return pic ? '/' + String(pic).replace(/^public\//, '').replace(/^\//, '') : ''; }
function fmtTime(s) {
  if (!s || !isFinite(s)) return '—';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function formatGreg(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

init();
