// Admin metadata editor. Edit any number of rows, then save them all at once
// with one button — only the rows you actually changed are sent.
// Requires an admin session; the API enforces this (401/403 → back to /).

const $ = (id) => document.getElementById(id);
const COLS = ['title', 'rabbi', 'parasha', 'lesson_date'];

let rows = []; // { id, fields:{col->input}, original:{col->value} }

async function api(method, url, body) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (r.status === 401 || r.status === 403) { location.href = '/'; throw new Error('not authorized'); }
  if (!r.ok) throw new Error('request failed');
  return r.status === 204 ? null : r.json();
}

function status(msg) {
  $('status').textContent = msg;
  setTimeout(() => ($('status').textContent = ''), 3000);
}

async function load() {
  const lessons = await api('GET', '/api/admin/lessons');
  const tbody = $('rows');
  tbody.textContent = '';
  rows = [];
  for (const l of lessons) tbody.append(renderRow(l));
  updateSaveLabel();
}

function renderRow(l) {
  const tr = document.createElement('tr');
  const fields = {};
  const original = {};

  for (const col of COLS) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    if (col === 'lesson_date') input.type = 'date';
    input.value = l[col] ?? '';
    original[col] = input.value;
    input.addEventListener('input', () => {
      input.classList.toggle('dirty', input.value !== original[col]);
      updateSaveLabel();
    });
    fields[col] = input;
    td.appendChild(input);
    tr.appendChild(td);
  }

  const actions = document.createElement('td');
  actions.className = 'actions';
  const del = document.createElement('button');
  del.className = 'link';
  del.style.color = 'var(--danger)';
  del.textContent = 'מחיקה';
  del.addEventListener('click', async () => {
    if (!confirm('להסיר את השיעור מהקטלוג? קובץ השמע עצמו לא יימחק.')) return;
    await api('DELETE', `/api/admin/lessons/${l.id}`);
    tr.remove();
    rows = rows.filter((r) => r.id !== l.id);
    updateSaveLabel();
  });
  actions.appendChild(del);
  tr.appendChild(actions);

  rows.push({ id: l.id, fields, original });
  return tr;
}

function dirtyRows() {
  return rows.filter((r) => COLS.some((c) => r.fields[c].value !== r.original[c]));
}

function updateSaveLabel() {
  const n = dirtyRows().length;
  const btn = $('save-all');
  btn.textContent = n ? `שמור שינויים (${n})` : 'שמור שינויים';
  btn.disabled = n === 0;
}

async function saveAll() {
  const dirty = dirtyRows();
  if (!dirty.length) return;
  $('save-all').disabled = true;
  try {
    await Promise.all(
      dirty.map((r) =>
        api('PATCH', `/api/admin/lessons/${r.id}`, {
          title: r.fields.title.value,
          rabbi: r.fields.rabbi.value,
          parasha: r.fields.parasha.value,
          lesson_date: r.fields.lesson_date.value,
        })
      )
    );
    for (const r of dirty) {
      for (const c of COLS) { r.original[c] = r.fields[c].value; r.fields[c].classList.remove('dirty'); }
    }
    status(`נשמרו ${dirty.length} שינויים`);
  } catch {
    status('שגיאה בשמירה');
  }
  updateSaveLabel();
}

$('save-all').addEventListener('click', saveAll);
$('reindex').addEventListener('click', async () => {
  const r = await api('POST', '/api/admin/reindex');
  status(`הסריקה הושלמה: ${r.added} חדשים (סה״כ ${r.total} קבצים)`);
  load();
});

load();
