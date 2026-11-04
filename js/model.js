// Logique pure du planificateur : aucune dépendance au DOM ni au réseau.
// Toutes les fonctions qui modifient prennent l'état en premier argument et le
// modifient en place (le store se charge de l'historique et de la sauvegarde).
import {
  addDays, addMonths, addYears, contains, daysBetween, overlaps, periodEnd,
  periodStart, shift, startOfWeek, weekdayIndex, WEEKDAYS_SHORT,
} from './dates.js';

export const DEFAULT_WEIGHT = 5;
export const HORIZONS = ['day', 'week', 'month', 'year'];
const RANK = { day: 0, week: 1, month: 2, year: 3 };

export const VIEWS = ['horizons', 'heures', 'jours', 'semaines', 'mois', 'annees'];

export const PRESETS = {
  daily: { unit: 'day', every: 1 },
  weekly: { unit: 'week', every: 1 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'year', every: 1 },
  decade: { unit: 'year', every: 10 },
};
const PRESET_ORDER = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'decade'];
const PRESET_LABELS = {
  daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel',
  quarterly: 'Trimestriel', yearly: 'Annuel', decade: 'Tous les dix ans',
};
// Un horizon ne peut pas se répéter plus souvent que sa propre durée.
const MIN_UNIT = { day: 'day', week: 'week', month: 'month', year: 'year' };
const UNIT_RANK = { day: 0, week: 1, month: 2, year: 3 };

export function createState() {
  return {
    v: 2, updatedAt: 0, seq: 0, tasks: {}, series: {},
    boards: [{ id: 'ideas', title: 'Idées', lists: [] }],
  };
}

let uidCounter = 0;
export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clampWeight(w) {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n)) return DEFAULT_WEIGHT;
  return Math.min(10, Math.max(1, n));
}

// --- tâches -----------------------------------------------------------------

export function addTask(state, { title, horizon = 'day', date, weight, parentId = null, time = null, note = '' }) {
  const clean = String(title ?? '').trim();
  if (!clean) return null;
  const task = {
    id: uid(),
    title: clean,
    note: note || '',
    horizon,
    anchor: periodStart(horizon, date),
    weight: weight === undefined || weight === null ? DEFAULT_WEIGHT : clampWeight(weight),
    done: false,
    doneAt: null,
    parentId,
    time: horizon === 'day' ? time : null,
    seriesId: null,
    occ: null,
    createdAt: Date.now(),
    seq: ++state.seq,
  };
  state.tasks[task.id] = task;
  return task;
}

const TEMPLATE_KEYS = ['title', 'note', 'weight', 'time'];

export function updateTask(state, id, patch) {
  const t = state.tasks[id];
  if (!t) return null;
  const applied = {};
  if ('title' in patch) {
    const title = String(patch.title ?? '').trim();
    if (title) applied.title = title;
  }
  if ('note' in patch) applied.note = String(patch.note ?? '');
  if ('weight' in patch) applied.weight = clampWeight(patch.weight);
  if ('time' in patch && t.horizon === 'day') applied.time = patch.time || null;
  Object.assign(t, applied);

  // Les modifications se propagent au modèle de la série et aux occurrences
  // à venir qui n'ont pas encore été faites.
  const series = t.seriesId && state.series[t.seriesId];
  if (series) {
    const shared = {};
    for (const k of TEMPLATE_KEYS) if (k in applied) shared[k] = applied[k];
    Object.assign(series.template, shared);
    for (const other of Object.values(state.tasks)) {
      if (other.seriesId === t.seriesId && other.id !== t.id && !other.done && other.anchor > t.anchor) {
        for (const k of Object.keys(shared)) if (k !== 'time' || other.horizon === 'day') other[k] = shared[k];
      }
    }
  }
  return t;
}

export function toggleDone(state, id) {
  const t = state.tasks[id];
  if (!t) return null;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  return t;
}

export function deleteTask(state, id) {
  const t = state.tasks[id];
  if (!t) return false;
  const series = t.seriesId && state.series[t.seriesId];
  if (series && t.occ && !series.skip.includes(t.occ)) series.skip.push(t.occ);
  for (const other of Object.values(state.tasks)) if (other.parentId === id) other.parentId = null;
  delete state.tasks[id];
  return true;
}

export function reschedule(state, id, { horizon, date }) {
  const t = state.tasks[id];
  if (!t) return null;
  t.horizon = horizon || t.horizon;
  t.anchor = periodStart(t.horizon, date);
  if (t.horizon !== 'day') t.time = null;
  return t;
}

// --- tri et listes ----------------------------------------------------------

const order = (t) => (t.seq ?? t.createdAt ?? 0);
export function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.weight !== b.weight) return b.weight - a.weight;
  return order(a) - order(b);
}

export function columnTasks(state, horizon, anchor) {
  return Object.values(state.tasks)
    .filter((t) => {
      if (t.horizon !== horizon || t.anchor !== anchor) return false;
      const p = t.parentId && state.tasks[t.parentId];
      // Un sous-objectif de même horizon et même période s'affiche sous son parent.
      return !(p && p.horizon === t.horizon && p.anchor === t.anchor);
    })
    .sort(compareTasks);
}

// --- sous-objectifs ---------------------------------------------------------

export function parentOf(state, id) {
  const t = state.tasks[id];
  return (t && t.parentId && state.tasks[t.parentId]) || null;
}
export function childrenOf(state, id) {
  return Object.values(state.tasks).filter((t) => t.parentId === id).sort(compareTasks);
}
export function setParent(state, id, parentId) {
  const t = state.tasks[id];
  if (!t) return null;
  if (!parentId) { t.parentId = null; return t; }
  const p = state.tasks[parentId];
  if (!p || p.id === t.id) return t;
  // Jamais de cycle : on refuse un parent qui descend de la tâche.
  for (let cur = p; cur; cur = cur.parentId && state.tasks[cur.parentId]) if (cur.id === t.id) return t;
  t.parentId = parentId;
  return t;
}
export function parentCandidates(state, task) {
  return Object.values(state.tasks)
    .filter((p) => RANK[p.horizon] > RANK[task.horizon] && overlaps(p.horizon, p.anchor, task.horizon, task.anchor))
    .sort(compareTasks);
}

export function defaultChildAnchor(parent, todayK) {
  const { horizon, anchor } = parent;
  if (horizon === 'year') {
    return { horizon: 'month', anchor: contains('year', anchor, todayK) ? periodStart('month', todayK) : anchor };
  }
  if (horizon === 'month') {
    if (contains('month', anchor, todayK)) return { horizon: 'week', anchor: startOfWeek(todayK) };
    const monday = weekdayIndex(anchor) === 1 ? anchor : addDays(startOfWeek(anchor), 7);
    return { horizon: 'week', anchor: monday };
  }
  if (horizon === 'week') {
    return { horizon: 'day', anchor: contains('week', anchor, todayK) ? todayK : anchor };
  }
  return { horizon: 'day', anchor };
}
export function addSubgoal(state, parentId, title, todayK) {
  const parent = state.tasks[parentId];
  if (!parent) return null;
  const { horizon, anchor } = defaultChildAnchor(parent, todayK);
  return addTask(state, { title, horizon, date: anchor, parentId });
}

// --- navigation -------------------------------------------------------------

export function moveFocus(focus, horizon, n) {
  return shift(horizon, focus, n);
}

export function viewColumns(view, focus) {
  const around = (h) => [-1, 0, 1].map((n) => ({ horizon: h, anchor: shift(h, h === 'day' ? focus : periodStart(h, focus), n) }));
  switch (view) {
    case 'horizons':
      return HORIZONS.map((h) => ({ horizon: h, anchor: periodStart(h, focus) }));
    case 'jours':
    case 'heures':
      return around('day');
    case 'semaines':
      return around('week');
    case 'mois':
      return around('month');
    case 'annees':
      return around('year');
    default:
      return [];
  }
}

// --- répétition -------------------------------------------------------------

export function allowedPresets(horizon) {
  const floor = UNIT_RANK[MIN_UNIT[horizon]];
  return PRESET_ORDER.filter((k) => UNIT_RANK[PRESETS[k].unit] >= floor);
}

export function ruleKey(rule) {
  if (!rule || (rule.weekdays && rule.weekdays.length)) return 'custom';
  const hit = PRESET_ORDER.find((k) => PRESETS[k].unit === rule.unit && PRESETS[k].every === rule.every);
  return hit || 'custom';
}
const UNIT_LABELS = {
  day: ['jour', 'jours'], week: ['semaine', 'semaines'], month: ['mois', 'mois'], year: ['an', 'ans'],
};
export function ruleLabel(rule) {
  const key = ruleKey(rule);
  if (key !== 'custom') return PRESET_LABELS[key];
  const every = rule.every || 1;
  const [one, many] = UNIT_LABELS[rule.unit];
  const base = every === 1 ? `Chaque ${one}` : `Tous les ${every} ${many}`;
  if (rule.unit === 'week' && rule.weekdays && rule.weekdays.length) {
    const days = [...rule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS_SHORT[d]);
    return `${base} (${days.join(', ')})`;
  }
  return base;
}

function stepDate(rule, start, k) {
  const n = k * Math.max(1, rule.every || 1);
  if (rule.unit === 'week') return addDays(start, 7 * n);
  if (rule.unit === 'month') return addMonths(start, n);
  if (rule.unit === 'year') return addYears(start, n);
  return addDays(start, n);
}
function span(unit, start, anchor) {
  if (unit === 'week') return Math.floor(daysBetween(start, anchor) / 7);
  if (unit === 'month') return (Number(anchor.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(anchor.slice(5, 7)) - Number(start.slice(5, 7));
  if (unit === 'year') return Number(anchor.slice(0, 4)) - Number(start.slice(0, 4));
  return daysBetween(start, anchor);
}

// La période `anchor` (de l'horizon donné) est-elle une occurrence de la règle
// qui commence à `start` ?
export function occursOn(rule, horizon, start, anchor) {
  if (anchor < start) return false;
  const every = Math.max(1, rule.every || 1);
  if (horizon === 'day' && rule.unit === 'week' && rule.weekdays && rule.weekdays.length) {
    if (!rule.weekdays.includes(weekdayIndex(anchor))) return false;
    const weeks = daysBetween(startOfWeek(start), startOfWeek(anchor)) / 7;
    return weeks % every === 0;
  }
  const k0 = Math.floor(span(rule.unit, start, anchor) / every);
  for (let k = Math.max(0, k0 - 1); k <= k0 + 1; k++) {
    if (periodStart(horizon, stepDate(rule, start, k)) === anchor) return true;
  }
  return false;
}

function snapshotTemplate(t) {
  return { title: t.title, note: t.note, weight: t.weight, time: t.time };
}

// Crée les occurrences manquantes pour la période affichée. Retourne le nombre créé.
export function ensureForPeriod(state, horizon, anchor) {
  let created = 0;
  for (const series of Object.values(state.series)) {
    if (series.horizon !== horizon || anchor <= series.anchor) continue;
    if (series.skip.includes(anchor)) continue;
    if (!occursOn(series.rule, horizon, series.anchor, anchor)) continue;
    const exists = Object.values(state.tasks).some((t) => t.seriesId === series.id && t.occ === anchor);
    if (exists) continue;
    const t = addTask(state, { ...series.template, horizon, date: anchor });
    if (!t) continue;
    t.seriesId = series.id;
    t.occ = anchor;
    created++;
  }
  return created;
}

function dropFutureInstances(state, seriesId, afterAnchor) {
  for (const t of Object.values(state.tasks)) {
    if (t.seriesId === seriesId && !t.done && t.anchor > afterAnchor) delete state.tasks[t.id];
  }
}

export function setRepeat(state, id, rule) {
  const t = state.tasks[id];
  if (!t) return null;
  const existing = t.seriesId && state.series[t.seriesId];
  if (!rule) {
    if (existing) {
      dropFutureInstances(state, existing.id, t.anchor);
      for (const other of Object.values(state.tasks)) {
        if (other.seriesId === existing.id) { other.seriesId = null; other.occ = null; }
      }
      delete state.series[existing.id];
    }
    return t;
  }
  const clean = { unit: rule.unit, every: Math.max(1, Math.round(rule.every || 1)) };
  if (rule.weekdays && rule.weekdays.length) clean.weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  if (existing) {
    dropFutureInstances(state, existing.id, t.anchor);
    existing.rule = clean;
    existing.anchor = t.anchor;
    existing.skip = [];
    existing.template = snapshotTemplate(t);
    t.occ = t.anchor;
    return t;
  }
  const series = { id: uid(), rule: clean, horizon: t.horizon, anchor: t.anchor, template: snapshotTemplate(t), skip: [] };
  state.series[series.id] = series;
  t.seriesId = series.id;
  t.occ = t.anchor;
  return t;
}

// --- vue Heures -------------------------------------------------------------

// Place des blocs {id,start,dur} côte à côte quand ils se chevauchent.
export function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const cols = Math.max(...group.map((g) => g.col)) + 1;
    for (const g of group) out.push({ id: g.id, col: g.col, cols });
    group = [];
  };
  let colEnds = [];
  for (const b of sorted) {
    if (b.start >= groupEnd) { flush(); colEnds = []; groupEnd = -1; }
    let col = colEnds.findIndex((end) => end <= b.start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = b.start + b.dur;
    group.push({ id: b.id, col });
    groupEnd = Math.max(groupEnd, b.start + b.dur);
  }
  flush();
  return out;
}

// --- tableaux (Idées) -------------------------------------------------------

const findBoard = (state, id) => state.boards.find((b) => b.id === id) || null;
const findList = (state, boardId, listId) => {
  const b = findBoard(state, boardId);
  return (b && b.lists.find((l) => l.id === listId)) || null;
};

export function addBoard(state, title) {
  const clean = String(title ?? '').trim();
  if (!clean) return null;
  const board = { id: uid(), title: clean, lists: [] };
  state.boards.push(board);
  return board;
}
export function renameBoard(state, id, title) {
  const b = findBoard(state, id);
  const clean = String(title ?? '').trim();
  if (b && clean) b.title = clean;
  return b;
}
export function deleteBoard(state, id) {
  const i = state.boards.findIndex((b) => b.id === id);
  if (i === -1) return false;
  state.boards.splice(i, 1);
  return true;
}
export function addList(state, boardId, title = 'Nouvelle liste') {
  const b = findBoard(state, boardId);
  if (!b) return null;
  const list = { id: uid(), title: String(title).trim() || 'Nouvelle liste', items: [] };
  b.lists.push(list);
  return list;
}
export function renameList(state, boardId, listId, title) {
  const l = findList(state, boardId, listId);
  const clean = String(title ?? '').trim();
  if (l && clean) l.title = clean;
  return l;
}
export function deleteList(state, boardId, listId) {
  const b = findBoard(state, boardId);
  if (!b) return false;
  const i = b.lists.findIndex((l) => l.id === listId);
  if (i === -1) return false;
  b.lists.splice(i, 1);
  return true;
}
export function addItem(state, boardId, listId, text) {
  const l = findList(state, boardId, listId);
  const clean = String(text ?? '').trim();
  if (!l || !clean) return null;
  const item = { id: uid(), text: clean, done: false };
  l.items.push(item);
  return item;
}
export function toggleItem(state, boardId, listId, itemId) {
  const it = (findList(state, boardId, listId)?.items || []).find((x) => x.id === itemId);
  if (it) it.done = !it.done;
  return it || null;
}
export function editItem(state, boardId, listId, itemId, text) {
  const it = (findList(state, boardId, listId)?.items || []).find((x) => x.id === itemId);
  const clean = String(text ?? '').trim();
  if (it && clean) it.text = clean;
  return it || null;
}
export function deleteItem(state, boardId, listId, itemId) {
  const l = findList(state, boardId, listId);
  if (!l) return false;
  const i = l.items.findIndex((x) => x.id === itemId);
  if (i === -1) return false;
  l.items.splice(i, 1);
  return true;
}

export { periodEnd };
