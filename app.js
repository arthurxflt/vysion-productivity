import { h, icon, openPopover, closeAllPopovers, toast } from './js/ui.js';
import * as D from './js/dates.js';
import * as M from './js/model.js';
import { createStore, createSync } from './js/store.js';
import { createViews, VIEW_META, HOUR_H } from './js/views.js';
import { createTaskMenu } from './js/taskmenu.js';
import { createDetail } from './js/detail.js';
import { createLabels } from './js/labels.js';
import { createBoards } from './js/boards.js';
import { createHabits } from './js/habits.js';

const SUPABASE_URL = 'https://jfpcbruzqgioqdozpwfd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcGNicnV6cWdpb3Fkb3pwd2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTgyOTEsImV4cCI6MjEwMTE5NDI5MX0.u2jIgHR6Wnba-zZPd3-V-97tcY7NEUOoE7zETFUw_6s';

// Le contournement de la connexion n'existe qu'en local, avec #dev dans l'URL.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEV = IS_LOCAL && location.hash === '#dev';

let supabase = null;
if (!DEV) {
  try {
    // Délai maximal : sans réseau l'import resterait en attente et l'app resterait bloquée.
    const lib = await Promise.race([
      import('https://esm.sh/@supabase/supabase-js@2'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch {
    // Hors ligne : l'app reste utilisable avec les données de l'appareil.
  }
}

function safeStorage() {
  try {
    const probe = '__vysion_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}
const storage = safeStorage();
const read = (k, fallback) => { try { return storage.getItem(k) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { storage.setItem(k, v); } catch { /* ignoré */ } };

const $ = (id) => document.getElementById(id);

// --- thème ------------------------------------------------------------------
const THEME_KEY = 'vysion-theme-v2';
let theme = read(THEME_KEY, 'dark') === 'light' ? 'light' : 'dark';
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#1d1d1f' : '#ffffff';
  const btn = $('themeBtn');
  if (btn) {
    btn.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon', 17), theme === 'dark' ? 'Thème clair' : 'Thème sombre');
  }
}

// --- état -------------------------------------------------------------------
const store = createStore({ storage, key: 'vysion-planner-v2' });
const todayKey = () => D.todayKey();
const ROUTE_KEY = 'vysion-route-v2';
const savedRoute = read(ROUTE_KEY, 'horizons');
const ui = {
  route: savedRoute,
  focus: todayKey(),
  expanded: new Set(),
  detailId: null,
  resetScroll: true,
  focusAfterRender: null,
};

let currentUser = null;
let sync = null;
let syncLabel = DEV ? 'Mode local' : 'Hors ligne';

const app = { store, ui, today: todayKey, render: () => render(), taskMenu: null, labels: null, openDetail, closeDetail, setFocus };
app.labels = createLabels(app);
app.taskMenu = createTaskMenu(app);
const views = createViews(app);
const boards = createBoards(app);
const detail = createDetail(app, $('detail'));
const habits = createHabits({ supabase, getUser: () => currentUser });

function openDetail(id) {
  closeAllPopovers();
  ui.detailId = id;
  detail.render(true);
}
function closeDetail(id) {
  if (!id || ui.detailId === id) detail.close();
}
function setFocus(key) {
  closeAllPopovers();
  ui.focus = key;
  ui.resetScroll = true;
  render();
}
function setRoute(route) {
  closeAllPopovers();
  detail.close();
  ui.route = route;
  ui.resetScroll = true;
  write(ROUTE_KEY, route);
  document.body.classList.remove('nav-open');
  render();
}

// --- barre latérale -----------------------------------------------------------
function navItem(iconName, label, route, extra) {
  const active = ui.route === route;
  return h('div', { class: `sb-row${active ? ' active' : ''}` },
    h('button', { type: 'button', class: 'sb-item', 'aria-current': active ? 'page' : null, onclick: () => setRoute(route) }, icon(iconName, 18), h('span', null, label)),
    extra || null);
}

function boardMenu(anchor, board) {
  const item = (label, danger, onclick) => h('button', { type: 'button', class: `menu-item${danger ? ' danger' : ''}`, onclick }, h('span', { class: 'menu-label' }, label));
  openPopover(anchor, h('div', { class: 'menu' },
    item('Renommer', false, () => {
      closeAllPopovers();
      const name = prompt('Nom du tableau', board.title);
      if (name && name.trim()) store.mutate((s) => M.renameBoard(s, board.id, name), { undoable: true });
    }),
    item('Supprimer', true, () => {
      closeAllPopovers();
      if (!confirm(`Supprimer le tableau « ${board.title} » et toutes ses listes ?`)) return;
      store.mutate((s) => M.deleteBoard(s, board.id), { undoable: true });
      if (ui.route === `board:${board.id}`) setRoute('horizons');
      toast('Tableau supprimé', { actionLabel: 'Annuler', onAction: () => store.undo() });
    })), { side: 'end', className: 'menu-pop', key: `board:${board.id}` });
}

let addingBoard = false;
function renderSidebar() {
  const nav = $('sbNav');
  nav.replaceChildren(...M.VIEWS.map((v) => navItem(VIEW_META[v].icon, VIEW_META[v].label, v)));

  const list = $('sbBoards');
  const rows = store.getState().boards.map((b) => navItem('bulb', b.title, `board:${b.id}`,
    h('button', { type: 'button', class: 'sb-more', 'aria-label': `Options de ${b.title}`, onclick: (e) => boardMenu(e.currentTarget, b) }, icon('dots', 16))));
  list.replaceChildren(...rows);
  $('sbHabits').replaceChildren(h('div', { class: `sb-row${ui.route === 'habits' ? ' active' : ''}` }, habitsItem()));

  const add = $('sbAddBoard');
  if (addingBoard) {
    const input = h('input', {
      type: 'text', class: 'sb-input', placeholder: 'Nom du tableau', maxlength: '60', dataset: { focusKey: 'new-board' },
      onkeydown: (e) => {
        if (e.key === 'Escape') { addingBoard = false; render(); return; }
        if (e.key !== 'Enter') return;
        const name = e.currentTarget.value.trim();
        addingBoard = false;
        if (!name) { render(); return; }
        let id = null;
        store.mutate((s) => { const b = M.addBoard(s, name); id = b && b.id; }, { undoable: true });
        if (id) setRoute(`board:${id}`);
      },
      onblur: () => { if (addingBoard) { addingBoard = false; render(); } },
    });
    add.replaceChildren(icon('plus', 16), input);
    add.classList.add('editing');
  } else {
    add.classList.remove('editing');
    add.replaceChildren(icon('plus', 16), h('span', null, 'Ajouter…'));
  }
  renderLabelsSidebar();
  $('syncStatus').textContent = syncLabel;
}

let addingLabel = false;
function renderLabelsSidebar() {
  const labels = store.getState().labels || [];
  $('sbLabels').replaceChildren(...labels.map((l) => h('div', { class: 'sb-row' },
    h('button', {
      type: 'button', class: 'sb-item', title: 'Modifier la liste', onclick: (e) => app.labels.openEditor(e.currentTarget, l.id),
    }, h('span', { class: 'sb-dot' }, app.labels.dot(l, 12)), h('span', null, l.name)))));

  const add = $('sbAddLabel');
  if (addingLabel) {
    const input = h('input', {
      type: 'text', class: 'sb-input', placeholder: 'Nom de la liste', maxlength: '40', dataset: { focusKey: 'new-label' },
      onkeydown: (e) => {
        if (e.key === 'Escape') { addingLabel = false; render(); return; }
        if (e.key !== 'Enter') return;
        const name = e.currentTarget.value.trim();
        addingLabel = false;
        if (!name) { render(); return; }
        store.mutate((s) => { M.addLabel(s, name); }, { undoable: true });
      },
      onblur: () => { if (addingLabel) { addingLabel = false; render(); } },
    });
    add.replaceChildren(icon('plus', 16), input);
    add.classList.add('editing');
  } else {
    add.classList.remove('editing');
    add.replaceChildren(icon('plus', 16), h('span', null, 'Ajouter…'));
  }
}

function habitsItem() {
  const active = ui.route === 'habits';
  return h('button', { type: 'button', class: 'sb-item', 'aria-current': active ? 'page' : null, onclick: () => setRoute('habits') }, icon('habits', 18), h('span', null, 'Habitudes'));
}

// --- rendu ----------------------------------------------------------------
function captureUi() {
  const planner = $('planner');
  const snap = { scroll: {}, focus: null };
  planner.querySelectorAll('[data-scroll-key]').forEach((el) => { snap.scroll[el.dataset.scrollKey] = [el.scrollTop, el.scrollLeft]; });
  const a = document.activeElement;
  if (a && a.dataset && a.dataset.focusKey && (planner.contains(a) || $('sidebar').contains(a))) {
    snap.focus = { key: a.dataset.focusKey, value: a.value, start: a.selectionStart, end: a.selectionEnd };
  }
  return snap;
}

function restoreUi(snap) {
  const planner = $('planner');
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  planner.querySelectorAll('[data-scroll-key]').forEach((el) => {
    const key = el.dataset.scrollKey;
    if (key === 'hours') {
      const head = el.querySelector('.hours-head');
      if (head) el.style.setProperty('--hours-head-h', `${head.offsetHeight}px`);
      if (snap.scroll.hours && !ui.resetScroll) { el.scrollTop = snap.scroll.hours[0]; el.scrollLeft = snap.scroll.hours[1]; return; }
      const now = new Date();
      const showNow = ui.focus === todayKey();
      el.scrollTop = Math.max(0, ((showNow ? now.getHours() - 1 : 7) * HOUR_H));
      const dayCols = el.querySelectorAll('.hours-col');
      el.scrollLeft = mobile && dayCols[1] ? dayCols[1].offsetLeft - 52 : 0;
      return;
    }
    if (key === 'cols') {
      if (ui.resetScroll) {
        const kids = el.children;
        const target = el.classList.contains('cols-3') ? kids[1] : kids[0];
        el.scrollLeft = mobile && target ? target.offsetLeft - el.offsetLeft : 0;
      } else if (snap.scroll.cols) {
        el.scrollLeft = snap.scroll.cols[1];
      }
      return;
    }
    if (snap.scroll[key]) el.scrollTop = snap.scroll[key][0];
  });
  ui.resetScroll = false;

  const wanted = ui.focusAfterRender;
  ui.focusAfterRender = null;
  if (wanted) {
    const el = document.querySelector(`[data-focus-key="${wanted}"]`);
    if (el) { el.focus(); if (el.select) el.select(); return; }
  }
  if (snap.focus) {
    const el = document.querySelector(`[data-focus-key="${snap.focus.key}"]`);
    if (el) {
      el.focus();
      if (snap.focus.value && el.value !== snap.focus.value) el.value = snap.focus.value;
      try { el.setSelectionRange(snap.focus.start, snap.focus.end); } catch { /* type sans sélection */ }
    }
  }
}

function routeTitle() {
  if (ui.route === 'habits') return 'Habitudes';
  if (ui.route.startsWith('board:')) {
    const b = store.getState().boards.find((x) => `board:${x.id}` === ui.route);
    return b ? b.title : 'Tableau';
  }
  return (VIEW_META[ui.route] || VIEW_META.horizons).label;
}

function render() {
  if ($('appContent').hidden) return;
  const snap = captureUi();
  if (!ui.route.startsWith('board:') && ui.route !== 'habits' && !VIEW_META[ui.route]) ui.route = 'horizons';
  if (ui.route.startsWith('board:') && !store.getState().boards.some((b) => `board:${b.id}` === ui.route)) ui.route = 'horizons';

  renderSidebar();
  $('mobileTitle').textContent = routeTitle();
  const planner = $('planner');
  const habitsEl = $('habitsModule');
  const isHabits = ui.route === 'habits';
  planner.hidden = isHabits;
  habitsEl.hidden = !isHabits;
  document.body.dataset.route = ui.route.startsWith('board:') ? 'board' : ui.route;

  if (isHabits) {
    habits.render();
  } else {
    const nodes = ui.route.startsWith('board:') ? boards.render(ui.route.slice(6)) : views.render(ui.route);
    planner.replaceChildren(...nodes);
    restoreUi(snap);
  }
  if (ui.detailId) detail.render();
  if (snap.focus && snap.focus.key === 'new-label') {
    const el = document.querySelector('[data-focus-key="new-label"]');
    if (el) el.focus();
  }
  if (snap.focus && snap.focus.key === 'new-board') {
    const el = document.querySelector('[data-focus-key="new-board"]');
    if (el) el.focus();
  }
}

store.subscribe(() => render());

// --- connexion ----------------------------------------------------------------
function showApp(visible) {
  $('authGate').hidden = visible;
  $('appContent').hidden = !visible;
  if (visible) render();
}

const STATUS_LABELS = {
  synced: 'Synchronisé', pending: 'Enregistrement…', offline: 'Hors ligne',
  error: 'Erreur de synchro', 'missing-table': 'Synchro indisponible',
};

async function startSessionFor(user) {
  currentUser = user;
  showApp(true);
  sync = createSync({
    supabase, store, getUserId: () => (currentUser ? currentUser.id : null), table: 'planner_data',
    onStatus: (s) => { syncLabel = STATUS_LABELS[s] || s; const el = $('syncStatus'); if (el) el.textContent = syncLabel; },
  });
  await sync.start();
  habits.start(user);
}

function endSession() {
  currentUser = null;
  if (sync) sync.stop();
  sync = null;
  habits.stop();
  showApp(false);
}

async function authInit() {
  const status = $('authStatus');
  const creds = () => ({ email: $('authEmail').value.trim(), password: $('authPassword').value });
  $('authSignInBtn').addEventListener('click', async () => {
    const { email, password } = creds();
    if (!email || !password) { status.textContent = 'Renseigne un email et un mot de passe.'; return; }
    status.textContent = 'Connexion…';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    status.textContent = error ? error.message : '';
  });
  $('authSignUpBtn').addEventListener('click', async () => {
    const { email, password } = creds();
    if (!email || !password) { status.textContent = 'Renseigne un email et un mot de passe.'; return; }
    if (password.length < 6) { status.textContent = 'Le mot de passe doit faire au moins 6 caractères.'; return; }
    status.textContent = 'Création du compte…';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { status.textContent = error.message; return; }
    status.textContent = data.session ? '' : 'Compte créé, vérifie ta boîte mail pour confirmer, puis connecte-toi.';
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session && session.user ? session.user : null;
    if (user && (!currentUser || currentUser.id !== user.id)) startSessionFor(user);
    else if (!user && currentUser) endSession();
    else if (!user) showApp(false);
  });
}

// --- branchements -------------------------------------------------------------
$('themeBtn').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  write(THEME_KEY, theme);
  applyTheme();
});
$('logoutBtn').addEventListener('click', () => {
  if (!supabase || DEV) return;
  if (confirm('Te déconnecter sur cet appareil ?')) supabase.auth.signOut();
});
$('sbAddBoard').addEventListener('click', () => {
  if (addingBoard) return;
  addingBoard = true;
  render();
  const el = document.querySelector('[data-focus-key="new-board"]');
  if (el) el.focus();
});
$('sbAddLabel').addEventListener('click', () => {
  if (addingLabel) return;
  addingLabel = true;
  render();
  const el = document.querySelector('[data-focus-key="new-label"]');
  if (el) el.focus();
});
$('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (store.canUndo()) { e.preventDefault(); store.undo(); toast('Action annulée'); }
  }
  if (e.key === 'Escape' && ui.detailId && !document.querySelector('.popover')) detail.close();
});

let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (sync) sync.flush(); return; }
  if (todayKey() !== lastToday) {
    lastToday = todayKey();
    ui.focus = lastToday;
    ui.resetScroll = true;
    render();
  }
});
window.addEventListener('pagehide', () => { if (sync) sync.flush(); });

applyTheme();

if (DEV || !supabase) {
  showApp(true);
} else {
  authInit();
}

if ('serviceWorker' in navigator && !IS_LOCAL) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
