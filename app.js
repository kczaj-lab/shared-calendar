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
  renderNowLine();
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

const comingSoon = () => showToast('Dodawanie wpisów pojawi się w następnym kroku.');
$('addBtn').addEventListener('click', comingSoon);
$('fab').addEventListener('click', comingSoon);

setInterval(renderNowLine, 60 * 1000);

render();
