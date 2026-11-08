'use strict';

/* Tiny test runner — results are shown on tests.html and stored in window.testResults */
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, error: err.message }); }
}
function assertEqual(actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`oczekiwano: ${e}\notrzymano:  ${a}`);
}

/* Helpers: build entries and read results as "HH:MM-HH:MM" strings */
const D1 = '2026-11-10';
const D2 = '2026-11-11';
const entry = (date, start, end, userId = 'kasia') => ({ id: `${date}${start}${userId}`, userId, date, start, end, note: '' });
const opts = (minHours = 1, extra = {}) => ({ dayStartMin: 9 * 60, dayEndMin: 22 * 60, minDurationMin: minHours * 60, ...extra });
const fmt = slots => slots.map(s => `${s.date === D1 ? '' : s.date + ' '}${fromMinutes(s.start)}-${fromMinutes(s.end)}`);
const free = (entries, minHours, extra, dates = [D1]) => fmt(findCommonFreeSlots(entries, dates, opts(minHours, extra)));

/* ---------- Test cases ---------- */
test('Brak wpisów → cały dzień 09:00–22:00 wolny', () => {
  assertEqual(free([], 1), ['09:00-22:00']);
});

test('Jeden wpis 12:00–14:00 → dwa okna', () => {
  assertEqual(free([entry(D1, '12:00', '14:00')], 1), ['09:00-12:00', '14:00-22:00']);
});

test('Nachodzące wpisy różnych osób są łączone', () => {
  const e = [entry(D1, '10:00', '12:00', 'kasia'), entry(D1, '11:00', '13:00', 'ola')];
  assertEqual(free(e, 1), ['09:00-10:00', '13:00-22:00']);
});

test('Wpisy stykające się (12:00 koniec / 12:00 start) nie zostawiają przerwy', () => {
  const e = [entry(D1, '10:00', '12:00', 'kasia'), entry(D1, '12:00', '14:00', 'emilia')];
  assertEqual(free(e, 1), ['09:00-10:00', '14:00-22:00']);
});

test('Wpis zawarty w innym wpisie', () => {
  const e = [entry(D1, '10:00', '18:00', 'kasia'), entry(D1, '12:00', '13:00', 'ola')];
  assertEqual(free(e, 1), ['09:00-10:00', '18:00-22:00']);
});

test('Okno 1,5 h: widoczne przy min. 1 h, ukryte przy min. 2 h', () => {
  const e = [entry(D1, '09:00', '10:00'), entry(D1, '11:30', '22:00', 'ola')];
  assertEqual(free(e, 1), ['10:00-11:30']);
  assertEqual(free(e, 2), []);
});

test('Okno dokładnie równe minimum jest uwzględnione', () => {
  const e = [entry(D1, '09:00', '19:00')];
  assertEqual(free(e, 3), ['19:00-22:00']);
});

test('Minimum 3 h odrzuca krótsze okna', () => {
  const e = [entry(D1, '11:00', '12:00'), entry(D1, '14:30', '20:00', 'emilia')];
  assertEqual(free(e, 1), ['09:00-11:00', '12:00-14:30', '20:00-22:00']);
  assertEqual(free(e, 3), []);
});

test('Wpis wychodzący poza okno dnia (07:00–09:30) jest przycinany', () => {
  assertEqual(free([entry(D1, '07:00', '09:30')], 1), ['09:30-22:00']);
});

test('Wpis zajmujący cały dzień → brak wolnych terminów', () => {
  assertEqual(free([entry(D1, '09:00', '22:00')], 1), []);
});

test('Wpisy z innych dni nie wpływają na wynik', () => {
  const e = [entry(D2, '09:00', '22:00')];
  assertEqual(free(e, 1, {}, [D1, D2]), ['09:00-22:00']);
});

test('Kilka dni → osobne okna dla każdego dnia', () => {
  const e = [entry(D1, '09:00', '20:00'), entry(D2, '15:00', '22:00')];
  assertEqual(free(e, 2, {}, [D1, D2]), ['20:00-22:00', `${D2} 09:00-15:00`]);
});

test('Dni z przeszłości są pomijane', () => {
  assertEqual(free([], 1, { todayKey: D2, nowMin: 0 }, [D1, D2]), [`${D2} 09:00-22:00`]);
});

test('Dziś: liczymy od teraz, zaokrąglając w górę do 30 min (14:10 → 14:30)', () => {
  assertEqual(free([], 1, { todayKey: D1, nowMin: 14 * 60 + 10 }), ['14:30-22:00']);
});

test('Dziś po 21:00 przy min. 1 h → brak terminów', () => {
  assertEqual(free([], 1, { todayKey: D1, nowMin: 21 * 60 + 5 }), []);
});

test('Dziś: wpis, który już trwa, nadal blokuje czas', () => {
  const e = [entry(D1, '13:00', '16:00')];
  assertEqual(free(e, 1, { todayKey: D1, nowMin: 14 * 60 }), ['16:00-22:00']);
});

test('mergeIntervals: łączy nakładające się i stykające przedziały', () => {
  assertEqual(mergeIntervals([{ s: 5, e: 8 }, { s: 1, e: 3 }, { s: 3, e: 4 }, { s: 7, e: 10 }]),
    [{ s: 1, e: 4 }, { s: 5, e: 10 }]);
});

/* ---------- Recurrence ---------- */
test('Powtarzanie: „Nie powtarzaj” → tylko jeden dzień', () => {
  assertEqual(expandRecurrence('2026-11-09', 'none', '2026-12-31'), ['2026-11-09']);
});

test('Powtarzanie: dni robocze pon–nd → 5 dni (bez weekendu)', () => {
  assertEqual(expandRecurrence('2026-11-09', 'weekdays', '2026-11-15'),
    ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
});

test('Powtarzanie: dni robocze zaczynające się w sobotę pomijają weekend', () => {
  assertEqual(expandRecurrence('2026-11-14', 'weekdays', '2026-11-17'), ['2026-11-16', '2026-11-17']);
});

test('Powtarzanie: codziennie przez przełom miesiąca', () => {
  assertEqual(expandRecurrence('2026-11-29', 'daily', '2026-12-02'),
    ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
});

test('Powtarzanie: co tydzień w ten sam dzień tygodnia', () => {
  assertEqual(expandRecurrence('2026-11-09', 'weekly', '2026-11-30'),
    ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
});

test('Powtarzanie: zmiana czasu (marzec) nie przesuwa dat', () => {
  assertEqual(expandRecurrence('2027-03-27', 'daily', '2027-03-29'), ['2027-03-27', '2027-03-28', '2027-03-29']);
});

test('Powtarzanie: data końcowa przed początkową → brak dni', () => {
  assertEqual(expandRecurrence('2026-11-09', 'daily', '2026-11-01'), []);
});

test('Powtarzanie: limit liczby zajęć', () => {
  assertEqual(expandRecurrence('2026-01-01', 'daily', '2030-01-01', 10).length, 10);
});

/* ---------- Render ---------- */
const passed = results.filter(r => r.ok).length;
const summary = document.getElementById('summary');
summary.textContent = `${passed} / ${results.length} testów zaliczonych`;
summary.className = passed === results.length ? 'ok' : 'fail';
document.getElementById('results').innerHTML = results.map(r => {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = r.name;
  if (!r.ok) { const pre = document.createElement('pre'); pre.textContent = r.error; li.appendChild(pre); }
  return li.outerHTML;
}).join('');
window.testResults = { passed, total: results.length, failed: results.filter(r => !r.ok) };
