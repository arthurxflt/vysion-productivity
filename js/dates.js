// Dates et libellés français. Les dates sont des clés 'YYYY-MM-DD' ; tout le
// calcul passe par UTC pour ne jamais subir un changement d'heure.

const DAY_MS = 86400000;

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
// Indexé comme Date#getDay : 0 = dimanche.
export const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function parse(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export const weekdayIndex = (key) => parse(key).getUTCDay();
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY_MS);

export function addDays(key, n) {
  return toKey(new Date(parse(key).getTime() + n * DAY_MS));
}
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
export function addMonths(key, n) {
  const d = parse(key);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return toKey(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m)))));
}
export function addYears(key, n) {
  return addMonths(key, n * 12);
}

export function startOfWeek(key) {
  const wd = (weekdayIndex(key) + 6) % 7; // lundi = 0
  return addDays(key, -wd);
}
export function isoWeek(key) {
  // Le jeudi de la semaine décide de l'année ISO.
  const thursday = parse(addDays(startOfWeek(key), 3));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  return { week: Math.floor((thursday - jan1) / DAY_MS / 7) + 1, year };
}

export function periodStart(horizon, key) {
  if (horizon === 'week') return startOfWeek(key);
  if (horizon === 'month') return key.slice(0, 8) + '01';
  if (horizon === 'year') return key.slice(0, 5) + '01-01';
  return key;
}
export function periodEnd(horizon, anchor) {
  if (horizon === 'week') return addDays(anchor, 6);
  if (horizon === 'month') return addDays(addMonths(anchor, 1), -1);
  if (horizon === 'year') return `${anchor.slice(0, 4)}-12-31`;
  return anchor;
}
// Pour une période, on retombe toujours sur son premier jour.
export function shift(horizon, key, n) {
  if (horizon === 'week') return addDays(startOfWeek(key), 7 * n);
  if (horizon === 'month') return addMonths(periodStart('month', key), n);
  if (horizon === 'year') return addYears(periodStart('year', key), n);
  return addDays(key, n);
}
export function contains(horizon, anchor, key) {
  return key >= anchor && key <= periodEnd(horizon, anchor);
}
export function overlaps(h1, a1, h2, a2) {
  return a1 <= periodEnd(h2, a2) && a2 <= periodEnd(h1, a1);
}

// --- libellés ---------------------------------------------------------------

export function weekdayTitle(key) {
  return cap(WEEKDAYS[weekdayIndex(key)]);
}
export function dayTitle(key, today) {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return weekdayTitle(key);
}
export function dayDateLabel(key) {
  const d = parse(key);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function weekRange(anchor) {
  const a = parse(anchor);
  const b = parse(periodEnd('week', anchor));
  const left = a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}`
    : `${a.getUTCDate()} ${MONTHS_SHORT[a.getUTCMonth()]}`;
  return `${left} au ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`;
}
export function weekTitle(anchor) {
  const { week, year } = isoWeek(anchor);
  return `S${week}, ${year}`;
}
export function monthTitle(anchor) {
  return cap(MONTHS[parse(anchor).getUTCMonth()]);
}
export function yearTitle(anchor) {
  return anchor.slice(0, 4);
}
export function monthYearLabel(key) {
  const d = parse(key);
  return `${cap(MONTHS[d.getUTCMonth()])} ${d.getUTCFullYear()}`;
}

export function fmtMinutes(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
export function timeRange(start, dur) {
  const end = start + dur;
  return `${fmtMinutes(start)} à ${end >= 1440 ? '24:00' : fmtMinutes(end)}`;
}
