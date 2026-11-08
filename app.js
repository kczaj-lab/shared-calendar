'use strict';

/* ==========================================================
   Configuration
   ========================================================== */
const CONFIG = {
  dayStartHour: 9,   // availability window start (09:00)
  dayEndHour: 22,    // availability window end (22:00)
  slotMinutes: 30,   // grid resolution
};

const USERS = [
  { id: 'kasia',  name: 'Kasia',  color: '#E1EDFF', ink: '#3F6FD8' },
  { id: 'emilia', name: 'Emilia', color: '#FFF0D0', ink: '#A87A12' },
  { id: 'ola',    name: 'Ola',    color: '#F9DFE8', ink: '#C24F7A' },
];

const DURATIONS = [1, 2, 3]; // minimum meeting length in hours
const DOW_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

const STORAGE_KEYS = {
  currentUser: 'sc.currentUser',
  minDuration: 'sc.minDuration',
  entries: 'sc.entries',
};

/* ==========================================================
   Storage helpers (localStorage can fail in private mode)
   ========================================================== */
const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

/* ==========================================================
   Date helpers (all local time; weeks start on Monday)
   ========================================================== */
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayIndex(d) { return (d.getDay() + 6) % 7; } // Monday = 0 … Sunday = 6
function startOfWeek(d) { return addDays(startOfDay(d), -dayIndex(d)); }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* Time helpers: "HH:MM" <-> minutes since midnight */
function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fromMinutes(min) { return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`; }

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/* ==========================================================
   Entries store (busy time slots)
   Entry shape: { id, userId, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", note }
   ========================================================== */
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidEntry(e) {
  return e && typeof e.id === 'string'
    && USERS.some(u => u.id === e.userId)
    && DATE_RE.test(e.date) && TIME_RE.test(e.start) && TIME_RE.test(e.end)
    && toMinutes(e.end) > toMinutes(e.start)
    && typeof e.note === 'string';
}

const entryStore = {
  list: [],
  load() {
    const raw = storage.get(STORAGE_KEYS.entries, []);
    this.list = Array.isArray(raw) ? raw.filter(isValidEntry) : [];
  },
  save() { storage.set(STORAGE_KEYS.entries, this.list); },
  forDate(dateKey) { return this.list.filter(e => e.date === dateKey); },
  get(id) { return this.list.find(e => e.id === id); },
  upsert(entry) {
    const i = this.list.findIndex(e => e.id === entry.id);
    if (i === -1) this.list.push(entry); else this.list[i] = entry;
    this.save();
  },
  remove(id) {
    this.list = this.list.filter(e => e.id !== id);
    this.save();
  },
};

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* Place overlapping entries side by side: returns entries with col / cols */
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds = [];
    for (const it of cluster) {
      let c = colEnds.findIndex(end => end <= it.s);
      if (c === -1) { c = colEnds.length; colEnds.push(it.e); } else colEnds[c] = it.e;
      it.col = c;
    }
    cluster.forEach(it => { it.cols = colEnds.length; });
    out.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

function formatWeekRange(start) {
  const end = addDays(start, 6);
  const full = { day: 'numeric', month: 'long', year: 'numeric' };
  const dayMonth = { day: 'numeric', month: 'long' };
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.toLocaleDateString('pl-PL', full)} – ${end.toLocaleDateString('pl-PL', full)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.toLocaleDateString('pl-PL', dayMonth)} – ${end.toLocaleDateString('pl-PL', full)}`;
  }
  return `${start.getDate()} – ${end.toLocaleDateString('pl-PL', full)}`;
}

/* ==========================================================
   State
   ========================================================== */
const today = new Date();
const state = {
  weekStart: startOfWeek(today),
  selectedDay: dayIndex(today), // used on mobile (one day visible)
  currentUser: storage.get(STORAGE_KEYS.currentUser, USERS[0].id),
  minDuration: storage.get(STORAGE_KEYS.minDuration, 1),
};
if (!USERS.some(u => u.id === state.currentUser)) state.currentUser = USERS[0].id;
if (!DURATIONS.includes(state.minDuration)) state.minDuration = 1;

const $ = id => document.getElementById(id);

/* ==========================================================
   Rendering
   ========================================================== */
function userStyle(u) { return `--user-color:${u.color};--user-ink:${u.ink}`; }

function renderUsers() {
  $('userSwitcher').innerHTML = USERS.map(u => {
    const active = u.id === state.currentUser;
    return `
      <button class="user-btn" role="radio" aria-checked="${active}" data-user="${u.id}" style="${userStyle(u)}">
        <span class="avatar">${u.name[0]}</span>
        <span class="user-text">
          <span class="user-name">${u.name}</span>
          ${active ? '<span class="user-me">to ja</span>' : ''}
        </span>
      </button>`;
  }).join('');
}

function renderLegend() {
  const items = USERS.map(u =>
    `<li><span class="swatch" style="--c:${u.color};--ink:${u.ink}"></span>${u.name} — zajęta</li>`
  );
  items.push('<li><span class="swatch free"></span>Wszystkie wolne</li>');
  $('legend').innerHTML = items.join('');
}

function renderWeekRange() {
  $('weekRange').textContent = formatWeekRange(state.weekStart);
}

function renderDayStrip() {
  $('dayStrip').innerHTML = DOW_SHORT.map((label, i) => {
    const date = addDays(state.weekStart, i);
    const classes = ['day-pill', sameDay(date, today) ? 'is-today' : ''].join(' ');
    return `
      <button class="${classes}" data-day="${i}" aria-pressed="${i === state.selectedDay}"
              aria-label="${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}">
        <span class="dow">${label}</span>
        <span class="dom-s">${date.getDate()}</span>
      </button>`;
  }).join('');
}

function renderCalendar() {
  const { dayStartHour, dayEndHour, slotMinutes } = CONFIG;
  const slotsPerHour = 60 / slotMinutes;
  const slotCount = (dayEndHour - dayStartHour) * slotsPerHour;

  const slotsHtml = Array.from({ length: slotCount }, (_, i) =>
    `<div class="slot${(i + 1) % slotsPerHour === 0 ? ' hour-end' : ''}"></div>`
  ).join('');

  // Time labels column
  const labels = [];
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    const top = (h - dayStartHour) * slotsPerHour * slotHeight();
    const cls = h === dayStartHour ? ' first' : h === dayEndHour ? ' last' : '';
    labels.push(`<span class="time-label${cls}" style="top:${top}px">${pad2(h)}:00</span>`);
  }
  let html = `
    <div class="time-col">
      <div class="day-head" aria-hidden="true"></div>
      <div class="time-body" style="height:${slotCount * slotHeight()}px">${labels.join('')}</div>
    </div>`;

  // Day columns
  for (let i = 0; i < 7; i++) {
    const date = addDays(state.weekStart, i);
    const classes = ['day-col'];
    if (sameDay(date, today)) classes.push('is-today');
    if (i === state.selectedDay) classes.push('is-selected');
    html += `
      <div class="${classes.join(' ')}" data-date="${toDateKey(date)}">
        <div class="day-head">
          <span class="dow">${DOW_SHORT[i]}</span>
          <span class="dom">${date.getDate()}</span>
        </div>
        <div class="day-body">${slotsHtml}</div>
      </div>`;
  }

  $('calendar').innerHTML = html;
  renderEntries();
  renderNowLine();
}

function userById(id) { return USERS.find(u => u.id === id); }

function renderEntries() {
  const winStart = CONFIG.dayStartHour * 60;
  const winEnd = CONFIG.dayEndHour * 60;
  const h = slotHeight();
  const pxPerMin = h / CONFIG.slotMinutes;

  document.querySelectorAll('.day-col').forEach(col => {
    const body = col.querySelector('.day-body');
    const items = entryStore.forDate(col.dataset.date)
      .map(e => ({ entry: e, s: Math.max(toMinutes(e.start), winStart), e: Math.min(toMinutes(e.end), winEnd) }))
      .filter(it => it.e > it.s);

    body.insertAdjacentHTML('beforeend', layoutDay(items).map(it => {
      const { entry } = it;
      const user = userById(entry.userId);
      const mine = entry.userId === state.currentUser;
      const short = it.e - it.s <= CONFIG.slotMinutes;
      const time = `${entry.start}–${entry.end}`;
      const style = [
        `--user-color:${user.color}`, `--user-ink:${user.ink}`,
        `top:${(it.s - winStart) * pxPerMin + 1}px`,
        `height:${(it.e - it.s) * pxPerMin - 2}px`,
        `left:calc(${(it.col / it.cols) * 100}% + 2px)`,
        `width:calc(${100 / it.cols}% - 4px)`,
      ].join(';');
      const label = `${user.name}, ${time}${entry.note ? ', ' + entry.note : ''}`;
      return `
        <button class="event${mine ? ' is-mine' : ''}${short ? ' short' : ''}" data-entry="${entry.id}"
                style="${style}" aria-label="${escapeHtml(label)}">
          <span class="ev-name">${user.name}</span>
          <span class="ev-time">${time}</span>
          ${entry.note ? `<span class="ev-note">${escapeHtml(entry.note)}</span>` : ''}
        </button>`;
    }).join(''));
  });
}

function slotHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot-h')) || 28;
}

function renderNowLine() {
  document.querySelectorAll('.now-line').forEach(el => el.remove());
  const now = new Date();
  const col = document.querySelector(`.day-col[data-date="${toDateKey(now)}"] .day-body`);
  if (!col) return;
  const minutes = (now.getHours() - CONFIG.dayStartHour) * 60 + now.getMinutes();
  const total = (CONFIG.dayEndHour - CONFIG.dayStartHour) * 60;
  if (minutes < 0 || minutes > total) return;
  const line = document.createElement('div');
  line.className = 'now-line';
  line.style.top = `${(minutes / CONFIG.slotMinutes) * slotHeight()}px`;
  col.appendChild(line);
}

function renderDurationPicker() {
  $('durationPicker').innerHTML = DURATIONS.map(h =>
    `<button role="radio" aria-checked="${h === state.minDuration}" data-hours="${h}">${h} h</button>`
  ).join('');
}

function renderFreeList() {
  // Placeholder until busy entries + availability logic are implemented (Phase 1, steps 4–5)
  $('freeList').innerHTML = `
    <div class="empty-state">
      Tu pojawią się terminy, w których wszystkie trzy jesteście wolne
      przez co najmniej <strong>${state.minDuration} h</strong>.
    </div>`;
}

function render() {
  renderUsers();
  renderLegend();
  renderWeekRange();
  renderDayStrip();
  renderCalendar();
  renderDurationPicker();
  renderFreeList();
}

/* ==========================================================
   Toast
   ========================================================== */
let toastTimer;
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ==========================================================
   Events
   ========================================================== */
function goToWeek(offsetWeeks) {
  state.weekStart = addDays(state.weekStart, offsetWeeks * 7);
  renderWeekRange();
  renderDayStrip();
  renderCalendar();
}

$('prevWeek').addEventListener('click', () => goToWeek(-1));
$('nextWeek').addEventListener('click', () => goToWeek(1));
$('todayBtn').addEventListener('click', () => {
  state.weekStart = startOfWeek(new Date());
  state.selectedDay = dayIndex(new Date());
  goToWeek(0);
});

$('userSwitcher').addEventListener('click', e => {
  const btn = e.target.closest('[data-user]');
  if (!btn) return;
  state.currentUser = btn.dataset.user;
  storage.set(STORAGE_KEYS.currentUser, state.currentUser);
  renderUsers();
  renderCalendar(); // "mine" highlighting changes
});

// Calendar clicks: an entry (edit) or an empty slot (add, prefilled)
$('calendar').addEventListener('click', e => {
  const evBtn = e.target.closest('[data-entry]');
  if (evBtn) {
    const entry = entryStore.get(evBtn.dataset.entry);
    if (!entry) return;
    if (entry.userId !== state.currentUser) {
      showToast(`To wpis: ${userById(entry.userId).name}. Możesz edytować tylko swoje wpisy.`);
      return;
    }
    openEntryDialog(entry);
    return;
  }
  const body = e.target.closest('.day-body');
  if (!body) return;
  const dateKey = body.closest('.day-col').dataset.date;
  const y = e.clientY - body.getBoundingClientRect().top;
  const slotIdx = Math.max(0, Math.floor(y / slotHeight()));
  const start = CONFIG.dayStartHour * 60 + slotIdx * CONFIG.slotMinutes;
  const end = Math.min(start + 60, CONFIG.dayEndHour * 60);
  openEntryDialog(null, { date: dateKey, start: fromMinutes(start), end: fromMinutes(end) });
});

$('dayStrip').addEventListener('click', e => {
  const btn = e.target.closest('[data-day]');
  if (!btn) return;
  state.selectedDay = Number(btn.dataset.day);
  renderDayStrip();
  renderCalendar();
});

$('durationPicker').addEventListener('click', e => {
  const btn = e.target.closest('[data-hours]');
  if (!btn) return;
  state.minDuration = Number(btn.dataset.hours);
  storage.set(STORAGE_KEYS.minDuration, state.minDuration);
  renderDurationPicker();
  renderFreeList();
});

/* ==========================================================
   Entry dialog (add / edit / delete)
   ========================================================== */
const dialog = $('entryDialog');
let editingId = null;
let deleteArmed = false;

function timeOptions(fromMin, toMin, selected) {
  const opts = [];
  for (let m = fromMin; m <= toMin; m += CONFIG.slotMinutes) {
    const t = fromMinutes(m);
    opts.push(`<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`);
  }
  return opts.join('');
}

function openEntryDialog(entry, defaults = {}) {
  const winStart = CONFIG.dayStartHour * 60;
  const winEnd = CONFIG.dayEndHour * 60;
  const user = userById(state.currentUser);
  const values = entry || {
    date: defaults.date || toDateKey(addDays(state.weekStart, state.selectedDay)),
    start: defaults.start || fromMinutes(winStart),
    end: defaults.end || fromMinutes(Math.min(winStart + 60, winEnd)),
    note: '',
  };

  editingId = entry ? entry.id : null;
  $('entryTitle').textContent = entry ? 'Edytuj zajętość' : 'Dodaj zajętość';
  $('entryWho').style.cssText = userStyle(user);
  $('entryWho').innerHTML = `<span class="avatar">${user.name[0]}</span><span>${user.name} — zajęta</span>`;
  $('fDate').value = values.date;
  $('fStart').innerHTML = timeOptions(winStart, winEnd - CONFIG.slotMinutes, values.start);
  $('fEnd').innerHTML = timeOptions(winStart + CONFIG.slotMinutes, winEnd, values.end);
  $('fNote').value = values.note || '';
  $('formError').textContent = '';
  $('deleteBtn').hidden = !entry;
  resetDeleteButton();

  dialog.showModal();
}

function closeEntryDialog() { dialog.close(); }

function resetDeleteButton() {
  deleteArmed = false;
  $('deleteBtn').classList.remove('confirm');
  $('deleteBtn').querySelector('span').textContent = 'Usuń';
}

$('entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const date = $('fDate').value;
  const start = $('fStart').value;
  const end = $('fEnd').value;
  const note = $('fNote').value.trim();

  if (!DATE_RE.test(date)) { $('formError').textContent = 'Wybierz datę.'; return; }
  if (toMinutes(end) <= toMinutes(start)) {
    $('formError').textContent = 'Godzina „Do” musi być późniejsza niż „Od”.';
    return;
  }

  entryStore.upsert({ id: editingId || newId(), userId: state.currentUser, date, start, end, note });
  closeEntryDialog();

  // Jump to the week of the saved entry
  const d = parseDateKey(date);
  state.weekStart = startOfWeek(d);
  state.selectedDay = dayIndex(d);
  renderWeekRange();
  renderDayStrip();
  renderCalendar();
  showToast(editingId ? 'Zmiany zapisane.' : 'Zajętość dodana.');
});

$('deleteBtn').addEventListener('click', () => {
  if (!deleteArmed) {
    deleteArmed = true;
    $('deleteBtn').classList.add('confirm');
    $('deleteBtn').querySelector('span').textContent = 'Na pewno?';
    return;
  }
  entryStore.remove(editingId);
  closeEntryDialog();
  renderCalendar();
  showToast('Wpis usunięty.');
});

$('cancelBtn').addEventListener('click', closeEntryDialog);
$('closeDialog').addEventListener('click', closeEntryDialog);
dialog.addEventListener('click', e => { if (e.target === dialog) closeEntryDialog(); }); // click on backdrop

const openNew = () => openEntryDialog(null);
$('addBtn').addEventListener('click', openNew);
$('fab').addEventListener('click', openNew);

setInterval(renderNowLine, 60 * 1000);

entryStore.load();
render();
