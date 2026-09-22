import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://jfpcbruzqgioqdozpwfd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcGNicnV6cWdpb3Fkb3pwd2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTgyOTEsImV4cCI6MjEwMTE5NDI5MX0.u2jIgHR6Wnba-zZPd3-V-97tcY7NEUOoE7zETFUw_6s';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ============================================================
// Auth gate
// ============================================================

const authGateEl = document.getElementById('authGate');
const appContentEl = document.getElementById('appContent');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authSignInBtn = document.getElementById('authSignInBtn');
const authSignUpBtn = document.getElementById('authSignUpBtn');
const authStatusEl = document.getElementById('authStatus');

function updateAuthUI() {
  const loggedIn = !!currentUser;
  authGateEl.hidden = loggedIn;
  appContentEl.hidden = !loggedIn;
}

authSignInBtn.addEventListener('click', async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    authStatusEl.textContent = 'Renseigne un email et un mot de passe.';
    return;
  }
  authStatusEl.textContent = 'Connexion…';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  authStatusEl.textContent = error ? error.message : '';
});

authSignUpBtn.addEventListener('click', async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    authStatusEl.textContent = 'Renseigne un email et un mot de passe.';
    return;
  }
  if (password.length < 6) {
    authStatusEl.textContent = 'Le mot de passe doit faire au moins 6 caractères.';
    return;
  }
  authStatusEl.textContent = 'Création du compte…';
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    authStatusEl.textContent = error.message;
    return;
  }
  authStatusEl.textContent = data.session
    ? ''
    : 'Compte créé, vérifie ta boîte mail pour confirmer, puis connecte-toi.';
});

supabase.auth.onAuthStateChange((event, session) => {
  const user = session && session.user ? session.user : null;
  if (user && (!currentUser || currentUser.id !== user.id)) {
    currentUser = user;
    updateAuthUI();
    startTaskSyncForUser(user);
    startHabitSyncForUser(user);
  } else if (!user && currentUser) {
    currentUser = null;
    updateAuthUI();
    stopTaskSync();
    stopHabitSync();
  } else if (!user) {
    updateAuthUI();
  }
});

// ============================================================
// Module tabs
// ============================================================

const tabTasksBtn = document.getElementById('tabTasksBtn');
const tabHabitsBtn = document.getElementById('tabHabitsBtn');
const tasksModuleEl = document.getElementById('tasksModule');
const habitsModuleEl = document.getElementById('habitsModule');

function showModule(name) {
  tasksModuleEl.hidden = name !== 'tasks';
  habitsModuleEl.hidden = name !== 'habits';
  tabTasksBtn.classList.toggle('active', name === 'tasks');
  tabHabitsBtn.classList.toggle('active', name === 'habits');
}

tabTasksBtn.addEventListener('click', () => showModule('tasks'));
tabHabitsBtn.addEventListener('click', () => showModule('habits'));

// ============================================================
// Shared date helpers
// ============================================================

function pad(n) { return String(n).padStart(2, '0'); }

function formatKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayKey() {
  return formatKey(new Date());
}

function addDaysToKey(key, delta) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + delta);
  return formatKey(d);
}

function daysBetween(fromKey, toKey) {
  return Math.round((keyToDate(toKey) - keyToDate(fromKey)) / 86400000);
}

/* ============================================================
   ================   TASKS MODULE   ==========================
   ============================================================ */

const TASKS_KEY = 'vysion-tasks-v1';
const RECURRING_KEY = 'vysion-recurring-v1';
const DAY_NOTES_KEY = 'vysion-day-notes-v1';
const PRIORITY_THRESHOLD = 8;
const MATERIALIZE_DAYS_AHEAD = 30;
const UPCOMING_HIDE_RECURRING_DAYS = 4;

const taskListEl = document.getElementById('taskList');
const emptyStateEl = document.getElementById('emptyState');
const addForm = document.getElementById('addForm');
const titleInput = document.getElementById('taskTitle');
const dayTitleEl = document.getElementById('dayTitle');
const dayDateLineEl = document.getElementById('dayDateLine');
const dayDateInput = document.getElementById('dayDateInput');
const dayPrevBtn = document.getElementById('dayPrevBtn');
const dayNextBtn = document.getElementById('dayNextBtn');
const backTodayBtn = document.getElementById('backTodayBtn');
const scoreLineEl = document.getElementById('scoreLine');
const scoreBarEl = document.getElementById('scoreBar');
const scoreBarFillEl = document.getElementById('scoreBarFill');
const scoreMessageEl = document.getElementById('scoreMessage');
const priorityWarningEl = document.getElementById('priorityWarning');
const completedWrapEl = document.getElementById('completedWrap');
const completedToggleEl = document.getElementById('completedToggle');
const completedToggleLabelEl = document.getElementById('completedToggleLabel');
const completedListEl = document.getElementById('completedList');
const abandonedWrapEl = document.getElementById('abandonedWrap');
const abandonedToggleEl = document.getElementById('abandonedToggle');
const abandonedToggleLabelEl = document.getElementById('abandonedToggleLabel');
const abandonedListEl = document.getElementById('abandonedList');
const dayNoteInput = document.getElementById('dayNoteInput');
const recurringListEl = document.getElementById('recurringList');
const recurringEmptyEl = document.getElementById('recurringEmpty');
const upcomingListEl = document.getElementById('upcomingList');
const upcomingEmptyEl = document.getElementById('upcomingEmpty');
const historyListEl = document.getElementById('historyList');
const historyEmptyEl = document.getElementById('historyEmpty');

function loadTasks() {
  let loaded = null;
  try {
    loaded = JSON.parse(localStorage.getItem(TASKS_KEY));
  } catch {
    loaded = null;
  }
  if (!loaded) loaded = [];
  loaded.forEach(t => {
    if (!('originalDate' in t)) t.originalDate = t.date;
    if (!('recurringId' in t)) t.recurringId = null;
    if (!('status' in t)) {
      t.status = t.done ? 'done' : 'pending';
      delete t.done;
    }
    if (!('note' in t)) t.note = '';
  });
  return loaded;
}

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  pushTasksToCloud();
}

function loadRecurringTasks() {
  try {
    return JSON.parse(localStorage.getItem(RECURRING_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecurringTasks() {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringTasks));
  pushTasksToCloud();
}

function loadDayNotes() {
  try {
    return JSON.parse(localStorage.getItem(DAY_NOTES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDayNotes() {
  localStorage.setItem(DAY_NOTES_KEY, JSON.stringify(dayNotes));
  pushTasksToCloud();
}

let tasks = loadTasks();
let recurringTasks = loadRecurringTasks();
let dayNotes = loadDayNotes();
let selectedDate = todayKey();
let completedExpanded = false;
let abandonedExpanded = false;

let taskRealtimeChannel = null;
let lastTasksPushedAt = null;

async function pushTasksToCloud() {
  if (!currentUser) return;
  const updatedAt = new Date().toISOString();
  lastTasksPushedAt = updatedAt;
  await supabase.from('sync_data').upsert({
    user_id: currentUser.id,
    tasks,
    recurring_tasks: recurringTasks,
    day_notes: dayNotes,
    updated_at: updatedAt,
  });
}

function applyRemoteTasksRow(row) {
  lastTasksPushedAt = row.updated_at;
  tasks = row.tasks || [];
  recurringTasks = row.recurring_tasks || [];
  dayNotes = row.day_notes || {};
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringTasks));
  localStorage.setItem(DAY_NOTES_KEY, JSON.stringify(dayNotes));
  carryOverUnfinished();
  materializeRecurring();
  renderTasks();
}

async function startTaskSyncForUser(user) {
  const { data, error } = await supabase
    .from('sync_data')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return;

  if (data) {
    applyRemoteTasksRow(data);
  } else {
    await pushTasksToCloud();
  }

  if (taskRealtimeChannel) supabase.removeChannel(taskRealtimeChannel);
  taskRealtimeChannel = supabase
    .channel('sync_data_' + user.id)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sync_data', filter: `user_id=eq.${user.id}` },
      (payload) => {
        const row = payload.new;
        if (!row || row.updated_at === lastTasksPushedAt) return;
        applyRemoteTasksRow(row);
      }
    )
    .subscribe();
}

function stopTaskSync() {
  if (taskRealtimeChannel) {
    supabase.removeChannel(taskRealtimeChannel);
    taskRealtimeChannel = null;
  }
}

function tasksForDate(dateKey) {
  return tasks.filter(t => t.date === dateKey);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [142, 142, 147];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Importance runs from a dull gray (low) to the brand yellow (high): the
// more important a task or habit is, the more it visually "pops".
function importanceColor(weight, lowHex, highHex) {
  const t = Math.max(0, Math.min(1, (weight - 1) / 9));
  const low = hexToRgb(lowHex);
  const high = hexToRgb(highHex);
  const rgb = low.map((c, i) => Math.round(c + (high[i] - c) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Plain-text importance color/weight (task rows, sheet, list rows): reads
// the current theme's tuned gray/yellow so it stays legible in both themes.
function importanceTextColor(weight) {
  const style = getComputedStyle(document.documentElement);
  const low = style.getPropertyValue('--importance-low').trim() || '#8e8e93';
  const high = style.getPropertyValue('--importance-high').trim() || '#c98900';
  return importanceColor(weight, low, high);
}

function importanceTextWeight(weight) {
  if (weight >= 9) return '700';
  if (weight >= 7) return '600';
  return '500';
}

function setImportanceLabel(el, weight) {
  el.textContent = weight;
  el.style.color = importanceTextColor(weight);
}

// Habit weight badge: a filled pill with its own background, so it uses a
// fixed light-gray-to-yellow range regardless of the page theme.
function importanceBadgeColor(weight) {
  return importanceColor(weight, '#c7c7cc', '#f5b731');
}

// Abandoned tasks are left out of the score, as the sheet promises.
function computeScore(taskArr) {
  const scored = taskArr.filter(t => t.status !== 'abandoned');
  const doneTasks = scored.filter(t => t.status === 'done');
  const totalWeight = scored.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = doneTasks.reduce((sum, t) => sum + t.weight, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100);
  return { totalWeight, doneWeight, percent, total: scored.length, done: doneTasks.length };
}

function scoreMessage(percent, hasTasks) {
  if (!hasTasks) return "Aucune tâche pour l'instant";
  if (percent >= 80) return "L'essentiel est fait";
  if (percent >= 50) return 'Bonne progression';
  if (percent >= 20) return 'Il reste des tâches importantes';
  return "L'essentiel reste à faire";
}

function longLabel(key) {
  const label = keyToDate(key).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shortLabel(key) {
  const label = keyToDate(key).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function relativeLabel(key) {
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return null;
}

function dayTitleFor(key) {
  const rel = relativeLabel(key);
  if (rel) return rel;
  const wd = keyToDate(key).toLocaleDateString('fr-FR', { weekday: 'long' });
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

function fullDateLabel(key) {
  return keyToDate(key).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function weekdayPatternLabel(days) {
  if (days.length === 7) return 'Tous les jours';
  const names = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => names[d]).join(', ');
}

// Undone one-off tasks left behind in the past get a fresh copy on today,
// bumped one point in importance. The original stays put with its real
// done/undone state, so past days keep an honest score.
function carryOverUnfinished() {
  const today = todayKey();
  const toCarry = tasks.filter(t => !t.recurringId && t.status === 'pending' && !t.carriedToId && t.date < today);
  if (toCarry.length === 0) return;

  toCarry.forEach(source => {
    const copy = {
      id: crypto.randomUUID(),
      title: source.title,
      weight: Math.min(source.weight + 1, 10),
      status: 'pending',
      note: '',
      date: today,
      originalDate: source.originalDate,
      recurringId: null,
      carriedFromId: source.id,
      createdAt: new Date().toISOString(),
    };
    source.carriedToId = copy.id;
    tasks.push(copy);
  });
  saveTasks();
}

// Ensures every active recurring template has a real task instance
// for each matching weekday between today and the materialization horizon.
function materializeRecurring() {
  const start = todayKey();
  const end = addDaysToKey(start, MATERIALIZE_DAYS_AHEAD);
  let changed = false;
  recurringTasks.forEach(rt => {
    let cursor = start;
    while (cursor <= end) {
      const weekday = keyToDate(cursor).getDay();
      if (rt.days.includes(weekday)) {
        const exists = tasks.some(t => t.recurringId === rt.id && t.date === cursor);
        if (!exists) {
          tasks.push({
            id: crypto.randomUUID(),
            title: rt.title,
            weight: rt.weight,
            status: 'pending',
            note: '',
            date: cursor,
            originalDate: cursor,
            recurringId: rt.id,
            createdAt: new Date().toISOString(),
          });
          changed = true;
        }
      }
      cursor = addDaysToKey(cursor, 1);
    }
  });
  if (changed) saveTasks();
}

function goToDate(key) {
  selectedDate = key;
  completedExpanded = false;
  abandonedExpanded = false;
  closeSubpage();
  showModule('tasks');
  renderTasks();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Small two-step confirmation for destructive buttons: the first tap arms
// the button, the second one runs the action. It disarms itself after 4s.
function twoStep(btn, confirmLabel, action) {
  btn.dataset.label = btn.textContent;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('confirming')) {
      action();
      return;
    }
    btn.classList.add('confirming');
    btn.textContent = confirmLabel;
    setTimeout(() => resetTwoStep(btn), 4000);
  });
}

function resetTwoStep(btn) {
  if (!btn.isConnected) return;
  btn.classList.remove('confirming');
  btn.textContent = btn.dataset.label;
}

// ---- Swipe left on a task to reveal "Supprimer" (touch only) --------

const SWIPE_REVEAL = 88;
let openSwipeItem = null;
let swipeJustEnded = false;

function closeOpenSwipe() {
  if (openSwipeItem) {
    openSwipeItem.classList.remove('swiped');
    openSwipeItem = null;
  }
}

function attachSwipe(li, main) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let moved = false;

  main.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('.task-checkbox')) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    tracking = true;
    moved = false;
  });

  main.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!moved) {
      if (Math.abs(mx) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) {
        tracking = false;
        return;
      }
      moved = true;
      li.classList.add('dragging');
      if (openSwipeItem && openSwipeItem !== li) closeOpenSwipe();
    }
    const base = li.classList.contains('swiped') ? -SWIPE_REVEAL : 0;
    dx = Math.max(-SWIPE_REVEAL - 24, Math.min(0, base + mx));
    main.style.transform = `translateX(${dx}px)`;
  });

  const finish = () => {
    if (!tracking) return;
    tracking = false;
    if (!moved) return;
    li.classList.remove('dragging');
    main.style.transform = '';
    if (dx < -SWIPE_REVEAL / 2) {
      li.classList.add('swiped');
      openSwipeItem = li;
    } else {
      li.classList.remove('swiped');
      if (openSwipeItem === li) openSwipeItem = null;
    }
    swipeJustEnded = true;
    setTimeout(() => { swipeJustEnded = false; }, 60);
  };
  main.addEventListener('pointerup', finish);
  main.addEventListener('pointercancel', finish);
}

document.addEventListener('click', (e) => {
  if (openSwipeItem && !openSwipeItem.contains(e.target)) closeOpenSwipe();
});

// ---- Task rows ------------------------------------------------------

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item'
    + (task.status === 'done' ? ' done' : '')
    + (task.status === 'abandoned' ? ' abandoned' : '');
  li.dataset.taskId = task.id;

  const main = document.createElement('div');
  main.className = 'task-item-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.status === 'done';
  checkbox.setAttribute('aria-label', 'Cocher la tâche');
  checkbox.addEventListener('change', () => {
    checkbox.disabled = true;
    // Lock in the current height first so the collapse below has a real
    // starting point to animate from (an "auto" height can't transition).
    li.style.height = `${li.getBoundingClientRect().height}px`;
    requestAnimationFrame(() => li.classList.add('leaving'));
    setTimeout(() => toggleTask(task.id), 260);
  });

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('span');
  title.className = 'task-title';
  if (task.recurringId) {
    const tag = document.createElement('span');
    tag.className = 'task-tag';
    tag.textContent = '↻';
    tag.title = 'Tâche récurrente';
    title.appendChild(tag);
  } else if (task.date !== task.originalDate) {
    const tag = document.createElement('span');
    tag.className = 'task-tag';
    tag.textContent = '↪';
    tag.title = 'Reportée depuis ' + shortLabel(task.originalDate);
    title.appendChild(tag);
  }
  title.appendChild(document.createTextNode(task.title));
  body.appendChild(title);

  if (task.note) {
    const sub = document.createElement('span');
    sub.className = 'task-sub';
    sub.textContent = task.note;
    body.appendChild(sub);
  }

  const weight = document.createElement('span');
  weight.className = 'task-weight';
  weight.style.color = importanceTextColor(task.weight);
  weight.style.fontWeight = importanceTextWeight(task.weight);
  weight.textContent = task.weight;
  weight.title = 'Importance';

  const swipeDelete = document.createElement('button');
  swipeDelete.type = 'button';
  swipeDelete.className = 'task-swipe-delete';
  swipeDelete.textContent = 'Supprimer';
  swipeDelete.addEventListener('click', () => deleteTask(task.id));

  main.append(checkbox, body, weight);
  main.addEventListener('click', (e) => {
    if (e.target === checkbox) return;
    if (swipeJustEnded) return;
    if (li.classList.contains('swiped')) {
      closeOpenSwipe();
      return;
    }
    openTaskSheet(task.id);
  });

  li.append(swipeDelete, main);
  attachSwipe(li, main);
  return li;
}

function renderTasks() {
  openSwipeItem = null;

  const dayTasks = tasksForDate(selectedDate);
  const sorted = [...dayTasks].sort((a, b) => b.weight - a.weight);
  const undoneTasks = sorted.filter(t => t.status === 'pending');
  const doneTasks = sorted.filter(t => t.status === 'done');
  const abandonedTasks = sorted.filter(t => t.status === 'abandoned');

  const today = todayKey();
  dayTitleEl.textContent = dayTitleFor(selectedDate);
  dayDateLineEl.textContent = fullDateLabel(selectedDate);
  dayDateInput.value = selectedDate;
  backTodayBtn.hidden = selectedDate === today;

  taskListEl.innerHTML = '';
  undoneTasks.forEach(task => taskListEl.appendChild(buildTaskItem(task)));

  if (dayTasks.length === 0) {
    emptyStateEl.hidden = false;
    emptyStateEl.textContent = 'Aucune tâche prévue pour ce jour.';
  } else if (undoneTasks.length === 0) {
    emptyStateEl.hidden = false;
    emptyStateEl.textContent = doneTasks.length > 0 && abandonedTasks.length === 0
      ? 'Tout est fait pour ce jour ! 🎉'
      : 'Plus rien en attente pour ce jour.';
  } else {
    emptyStateEl.hidden = true;
  }

  completedWrapEl.hidden = doneTasks.length === 0;
  completedToggleLabelEl.textContent = `Tâches réalisées (${doneTasks.length})`;
  completedListEl.innerHTML = '';
  doneTasks.forEach(task => completedListEl.appendChild(buildTaskItem(task)));
  completedListEl.hidden = !completedExpanded;
  completedToggleEl.setAttribute('aria-expanded', String(completedExpanded));

  abandonedWrapEl.hidden = abandonedTasks.length === 0;
  abandonedToggleLabelEl.textContent = `Abandonnées (${abandonedTasks.length})`;
  abandonedListEl.innerHTML = '';
  abandonedTasks.forEach(task => abandonedListEl.appendChild(buildTaskItem(task)));
  abandonedListEl.hidden = !abandonedExpanded;
  abandonedToggleEl.setAttribute('aria-expanded', String(abandonedExpanded));

  const { percent, total, done } = computeScore(dayTasks);
  const hasTasks = total > 0;
  scoreBarEl.hidden = !hasTasks;
  scoreMessageEl.hidden = !hasTasks;
  scoreLineEl.textContent = hasTasks
    ? `${done} sur ${total} réalisées · ${percent} %`
    : 'Aucune tâche pour l\'instant';
  scoreBarFillEl.style.width = percent + '%';
  scoreMessageEl.textContent = scoreMessage(percent, hasTasks);

  const hasPriority = dayTasks.some(t => t.status !== 'abandoned' && t.weight >= PRIORITY_THRESHOLD);
  priorityWarningEl.hidden = !(hasTasks && !hasPriority);

  dayNoteInput.value = dayNotes[selectedDate] || '';
  autoGrow(dayNoteInput);

  renderRecurringList();
  renderUpcoming();
  renderHistory();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) task.status = task.status === 'done' ? 'pending' : 'done';
  saveTasks();
  renderTasks();
}

function abandonTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) task.status = 'abandoned';
  saveTasks();
  renderTasks();
}

function restoreTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) task.status = 'pending';
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

// ---- Task details sheet ---------------------------------------------

const sheetOverlayEl = document.getElementById('taskSheetOverlay');
const sheetTagEl = document.getElementById('sheetTag');
const sheetDoneBtn = document.getElementById('sheetDoneBtn');
const sheetTitleEl = document.getElementById('sheetTitle');
const sheetWeightEl = document.getElementById('sheetWeight');
const sheetWeightValueEl = document.getElementById('sheetWeightValue');
const sheetDateRowEl = document.getElementById('sheetDateRow');
const sheetDateEl = document.getElementById('sheetDate');
const sheetRepeatRowEl = document.getElementById('sheetRepeatRow');
const sheetRepeatEl = document.getElementById('sheetRepeat');
const sheetWeekdaysRowEl = document.getElementById('sheetWeekdaysRow');
const sheetWeekdaysEl = document.getElementById('sheetWeekdays');
const sheetRecurringInfoEl = document.getElementById('sheetRecurringInfo');
const sheetRecurringLabelEl = document.getElementById('sheetRecurringLabel');
const sheetNoteEl = document.getElementById('sheetNote');
const sheetStopRecurringBtn = document.getElementById('sheetStopRecurringBtn');
const sheetAbandonBtn = document.getElementById('sheetAbandonBtn');
const sheetDeleteBtn = document.getElementById('sheetDeleteBtn');
const sheetHintEl = document.getElementById('sheetHint');

let sheetTaskId = null;
const sheetWeekdays = new Set();

function syncSheetRepeatUI() {
  const mode = sheetRepeatEl.value;
  sheetWeekdaysRowEl.hidden = mode !== 'custom';
  sheetDateRowEl.hidden = mode !== 'once';
}

function openTaskSheet(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  sheetTaskId = id;

  const rt = task.recurringId ? recurringTasks.find(r => r.id === task.recurringId) : null;
  const isRecurring = !!task.recurringId;

  sheetTitleEl.value = task.title;
  sheetWeightEl.value = task.weight;
  setImportanceLabel(sheetWeightValueEl, task.weight);
  sheetNoteEl.value = task.note || '';

  if (isRecurring) sheetTagEl.textContent = 'Tâche récurrente';
  else if (task.date !== task.originalDate) sheetTagEl.textContent = 'Reportée depuis ' + shortLabel(task.originalDate);
  else sheetTagEl.textContent = '';

  sheetRepeatRowEl.hidden = isRecurring;
  sheetRecurringInfoEl.hidden = !isRecurring;
  sheetRecurringLabelEl.textContent = rt ? weekdayPatternLabel(rt.days) : 'Récurrente';
  sheetStopRecurringBtn.hidden = !rt;
  sheetDateEl.value = task.date;
  sheetRepeatEl.value = 'once';
  sheetWeekdays.clear();
  sheetWeekdaysEl.querySelectorAll('.weekday-chip').forEach(b => b.classList.remove('active'));
  if (isRecurring) {
    sheetDateRowEl.hidden = true;
    sheetWeekdaysRowEl.hidden = true;
  } else {
    syncSheetRepeatUI();
  }

  sheetAbandonBtn.hidden = task.status === 'done';
  sheetAbandonBtn.textContent = task.status === 'abandoned' ? 'Remettre à faire' : 'Abandonner cette tâche';
  sheetHintEl.hidden = task.status !== 'pending';
  sheetHintEl.textContent = 'Une tâche abandonnée ne compte plus dans le score du jour et reste visible dans Abandonnées.';
  resetTwoStep(sheetDeleteBtn);
  resetTwoStep(sheetStopRecurringBtn);

  sheetOverlayEl.hidden = false;
  document.body.classList.add('sheet-open');
  autoGrow(sheetTitleEl);
  sheetOverlayEl.querySelector('.sheet').scrollTop = 0;
}

function hideTaskSheet() {
  sheetOverlayEl.hidden = true;
  sheetTaskId = null;
  document.body.classList.remove('sheet-open');
}

// Writes the sheet fields back to the task. Returns false when the form is
// not valid yet (the sheet then stays open).
function commitTaskSheet() {
  const task = tasks.find(t => t.id === sheetTaskId);
  if (!task) return true;

  let recurrenceDays = null;
  if (!task.recurringId && sheetRepeatEl.value !== 'once') {
    recurrenceDays = sheetRepeatEl.value === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [...sheetWeekdays];
    if (recurrenceDays.length === 0) {
      alert('Choisis au moins un jour pour une tâche récurrente.');
      return false;
    }
  }

  const title = sheetTitleEl.value.trim();
  if (title) task.title = title;
  task.weight = Number(sheetWeightEl.value);
  task.note = sheetNoteEl.value.trim();

  if (!task.recurringId) {
    if (recurrenceDays) {
      const rt = {
        id: crypto.randomUUID(),
        title: task.title,
        weight: task.weight,
        days: recurrenceDays,
        createdAt: new Date().toISOString(),
      };
      recurringTasks.push(rt);
      if (recurrenceDays.includes(keyToDate(task.date).getDay())) task.recurringId = rt.id;
      else tasks = tasks.filter(t => t.id !== task.id);
      saveRecurringTasks();
      materializeRecurring();
    } else if (sheetDateEl.value && sheetDateEl.value !== task.date) {
      task.date = sheetDateEl.value;
    }
  }

  saveTasks();
  renderTasks();
  return true;
}

function closeTaskSheet() {
  if (!sheetTaskId) {
    hideTaskSheet();
    return;
  }
  if (commitTaskSheet()) hideTaskSheet();
}

sheetDoneBtn.addEventListener('click', closeTaskSheet);
sheetOverlayEl.addEventListener('click', (e) => {
  if (e.target === sheetOverlayEl) closeTaskSheet();
});
sheetWeightEl.addEventListener('input', () => {
  setImportanceLabel(sheetWeightValueEl, Number(sheetWeightEl.value));
});
sheetRepeatEl.addEventListener('change', syncSheetRepeatUI);
sheetTitleEl.addEventListener('input', () => autoGrow(sheetTitleEl));
sheetTitleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sheetTitleEl.blur();
  }
});
sheetWeekdaysEl.querySelectorAll('.weekday-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const day = Number(btn.dataset.day);
    if (sheetWeekdays.has(day)) {
      sheetWeekdays.delete(day);
      btn.classList.remove('active');
    } else {
      sheetWeekdays.add(day);
      btn.classList.add('active');
    }
  });
});

sheetAbandonBtn.addEventListener('click', () => {
  const task = tasks.find(t => t.id === sheetTaskId);
  if (!task) return;
  if (!commitTaskSheet()) return;
  const current = tasks.find(t => t.id === task.id);
  if (current) {
    current.status = current.status === 'abandoned' ? 'pending' : 'abandoned';
    saveTasks();
    renderTasks();
  }
  hideTaskSheet();
});

twoStep(sheetDeleteBtn, 'Confirmer la suppression', () => {
  const id = sheetTaskId;
  hideTaskSheet();
  deleteTask(id);
});

twoStep(sheetStopRecurringBtn, 'Confirmer l\'arrêt', () => {
  const task = tasks.find(t => t.id === sheetTaskId);
  const recurringId = task && task.recurringId;
  hideTaskSheet();
  if (recurringId) deleteRecurringTask(recurringId);
});

// ---- Theme (light / dark / automatic) --------------------------------

const THEME_KEY = 'vysion-theme-v1';
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_LABELS = { auto: 'Thème : Automatique', light: 'Thème : Clair', dark: 'Thème : Sombre' };

function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_ORDER.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(mode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

let currentTheme = loadTheme();
applyTheme(currentTheme);

function cycleTheme() {
  const idx = THEME_ORDER.indexOf(currentTheme);
  currentTheme = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
  try { localStorage.setItem(THEME_KEY, currentTheme); } catch {}
  applyTheme(currentTheme);
}

function themeMenuItem() {
  return { label: () => THEME_LABELS[currentTheme], action: cycleTheme, keepOpen: true };
}

// ---- Menu popover ---------------------------------------------------

const menuPopoverEl = document.getElementById('menuPopover');
const tasksMenuBtn = document.getElementById('tasksMenuBtn');
const habitsMenuBtn = document.getElementById('habitsMenuBtn');

function closeMenu() {
  menuPopoverEl.hidden = true;
}

function openMenu(anchorEl, items) {
  menuPopoverEl.innerHTML = '';
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item' + (item.danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    const getLabel = () => (typeof item.label === 'function' ? item.label() : item.label);
    btn.textContent = getLabel();
    btn.addEventListener('click', () => {
      item.action();
      // Some items (like the theme cycle) update in place instead of closing,
      // so tapping repeatedly steps through their states.
      if (item.keepOpen) btn.textContent = getLabel();
      else closeMenu();
    });
    menuPopoverEl.appendChild(btn);
  });
  menuPopoverEl.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  menuPopoverEl.style.top = `${rect.bottom + 6}px`;
  menuPopoverEl.style.left = 'auto';
  menuPopoverEl.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
}

function confirmLogout() {
  if (confirm('Te déconnecter sur cet appareil ?')) supabase.auth.signOut();
}

const LOGOUT_ITEM = { label: 'Se déconnecter', danger: true, action: confirmLogout };

tasksMenuBtn.addEventListener('click', () => {
  if (!menuPopoverEl.hidden) {
    closeMenu();
    return;
  }
  openMenu(tasksMenuBtn, [
    { label: 'Tâches récurrentes', action: () => openSubpage('recurring') },
    { label: 'À venir', action: () => openSubpage('upcoming') },
    { label: 'Historique', action: () => openSubpage('history') },
    themeMenuItem(),
    LOGOUT_ITEM,
  ]);
});

habitsMenuBtn.addEventListener('click', () => {
  if (!menuPopoverEl.hidden) {
    closeMenu();
    return;
  }
  openMenu(habitsMenuBtn, [themeMenuItem(), LOGOUT_ITEM]);
});

document.addEventListener('click', (e) => {
  if (menuPopoverEl.hidden) return;
  if (menuPopoverEl.contains(e.target)) return;
  if (e.target.closest('#tasksMenuBtn, #habitsMenuBtn')) return;
  closeMenu();
});

// ---- Sub pages (recurring, upcoming, history) -------------------------

const subpageEl = document.getElementById('subpage');
const subpageTitleEl = document.getElementById('subpageTitle');
const SUBPAGE_TITLES = { recurring: 'Récurrentes', upcoming: 'À venir', history: 'Historique' };

function openSubpage(name) {
  subpageTitleEl.textContent = SUBPAGE_TITLES[name];
  subpageEl.querySelectorAll('section[data-page]').forEach(s => {
    s.hidden = s.dataset.page !== name;
  });
  subpageEl.hidden = false;
  subpageEl.scrollTop = 0;
  document.body.classList.add('sheet-open');
}

function closeSubpage() {
  if (subpageEl.hidden) return;
  subpageEl.hidden = true;
  document.body.classList.remove('sheet-open');
}

document.getElementById('subpageBack').addEventListener('click', closeSubpage);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!sheetOverlayEl.hidden) closeTaskSheet();
  else if (!menuPopoverEl.hidden) closeMenu();
  else closeSubpage();
});

function addTask(title, weight, dateKey) {
  tasks.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    weight,
    status: 'pending',
    note: '',
    date: dateKey,
    originalDate: dateKey,
    recurringId: null,
    createdAt: new Date().toISOString(),
  });
  saveTasks();
  renderTasks();
}

function addRecurringTask(title, weight, days) {
  recurringTasks.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    weight,
    days,
    createdAt: new Date().toISOString(),
  });
  saveRecurringTasks();
  materializeRecurring();
  renderTasks();
}

function deleteRecurringTask(id) {
  recurringTasks = recurringTasks.filter(r => r.id !== id);
  saveRecurringTasks();
  const today = todayKey();
  tasks = tasks.filter(t => !(t.recurringId === id && t.date >= today && t.status !== 'done'));
  saveTasks();
  renderTasks();
}

function renderRecurringList() {
  recurringEmptyEl.hidden = recurringTasks.length > 0;
  recurringListEl.hidden = recurringTasks.length === 0;
  recurringListEl.innerHTML = '';
  recurringTasks.forEach(rt => {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'list-row';

    const main = document.createElement('span');
    main.className = 'list-row-main';
    const title = document.createElement('span');
    title.className = 'list-row-title';
    title.textContent = rt.title;
    const sub = document.createElement('span');
    sub.className = 'list-row-sub';
    sub.textContent = weekdayPatternLabel(rt.days);
    main.append(title, sub);

    const weight = document.createElement('span');
    weight.className = 'list-row-end';
    weight.style.color = importanceTextColor(rt.weight);
    weight.style.fontWeight = importanceTextWeight(rt.weight);
    weight.textContent = rt.weight;

    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'list-row-action';
    stop.textContent = 'Arrêter';
    twoStep(stop, 'Confirmer', () => deleteRecurringTask(rt.id));

    row.append(main, weight, stop);
    li.appendChild(row);
    recurringListEl.appendChild(li);
  });
}

function buildDayListItem(dateKey) {
  const { percent } = computeScore(tasksForDate(dateKey));
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'list-row';
  btn.addEventListener('click', () => goToDate(dateKey));

  const main = document.createElement('span');
  main.className = 'list-row-main';
  main.textContent = shortLabel(dateKey);

  const score = document.createElement('span');
  score.className = 'list-row-end accent';
  score.textContent = percent + ' %';

  btn.append(main, score);
  li.appendChild(btn);
  return li;
}

function isFrequentRecurring(task) {
  if (!task.recurringId) return false;
  const rt = recurringTasks.find(r => r.id === task.recurringId);
  return !!rt && rt.days.length >= UPCOMING_HIDE_RECURRING_DAYS;
}

function buildUpcomingDayBlock(dateKey) {
  const dayTasks = tasksForDate(dateKey)
    .filter(t => !isFrequentRecurring(t) && t.status !== 'abandoned')
    .sort((a, b) => b.weight - a.weight);
  const { percent } = computeScore(dayTasks);

  const wrap = document.createElement('div');
  wrap.className = 'upcoming-day';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'upcoming-day-header';
  header.addEventListener('click', () => goToDate(dateKey));

  const dateEl = document.createElement('span');
  dateEl.textContent = relativeLabel(dateKey) || longLabel(dateKey);

  const scoreEl = document.createElement('span');
  scoreEl.className = 'upcoming-day-score';
  scoreEl.textContent = percent + ' %';

  header.append(dateEl, scoreEl);

  const list = document.createElement('ul');
  list.className = 'upcoming-task-list';
  dayTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'upcoming-task' + (task.status === 'done' ? ' done' : '');

    const title = document.createElement('span');
    title.className = 'upcoming-task-title';
    if (task.recurringId) {
      const tag = document.createElement('span');
      tag.className = 'task-tag';
      tag.textContent = '↻';
      tag.title = 'Tâche récurrente';
      title.appendChild(tag);
    }
    title.appendChild(document.createTextNode(task.title));

    const weight = document.createElement('span');
    weight.className = 'list-row-end';
    weight.style.color = importanceTextColor(task.weight);
    weight.style.fontWeight = importanceTextWeight(task.weight);
    weight.textContent = task.weight;

    li.append(title, weight);
    list.appendChild(li);
  });

  wrap.append(header, list);
  return wrap;
}

function renderUpcoming() {
  const today = todayKey();
  const futureDates = [...new Set(
    tasks.filter(t => t.date > today && !isFrequentRecurring(t)).map(t => t.date)
  )].sort();
  upcomingEmptyEl.hidden = futureDates.length > 0;
  upcomingListEl.innerHTML = '';
  futureDates.forEach(dateKey => upcomingListEl.appendChild(buildUpcomingDayBlock(dateKey)));
}

function renderHistory() {
  const today = todayKey();
  const pastDates = [...new Set(tasks.filter(t => t.date < today).map(t => t.date))].sort().reverse();
  historyEmptyEl.hidden = pastDates.length > 0;
  historyListEl.hidden = pastDates.length === 0;
  historyListEl.innerHTML = '';
  pastDates.slice(0, 30).forEach(dateKey => historyListEl.appendChild(buildDayListItem(dateKey)));
}

dayPrevBtn.addEventListener('click', () => goToDate(addDaysToKey(selectedDate, -1)));
dayNextBtn.addEventListener('click', () => goToDate(addDaysToKey(selectedDate, 1)));
backTodayBtn.addEventListener('click', () => goToDate(todayKey()));

// The date input sits invisibly on top of the day title, so a tap on the
// title opens the native calendar on every platform.
dayDateInput.addEventListener('click', () => {
  try { dayDateInput.showPicker(); } catch { /* not supported, native tap handles it */ }
});
dayDateInput.addEventListener('change', () => {
  if (dayDateInput.value) goToDate(dayDateInput.value);
});

// New tasks are typed on the empty line at the bottom of the list, like a
// note. Importance, date and repeat are set afterwards in the details sheet.
addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  addTask(title, 5, selectedDate);
  titleInput.value = '';
  titleInput.focus();
});

completedToggleEl.addEventListener('click', () => {
  completedExpanded = !completedExpanded;
  completedListEl.hidden = !completedExpanded;
  completedToggleEl.setAttribute('aria-expanded', String(completedExpanded));
});

abandonedToggleEl.addEventListener('click', () => {
  abandonedExpanded = !abandonedExpanded;
  abandonedListEl.hidden = !abandonedExpanded;
  abandonedToggleEl.setAttribute('aria-expanded', String(abandonedExpanded));
});

dayNoteInput.addEventListener('input', () => autoGrow(dayNoteInput));
dayNoteInput.addEventListener('blur', () => {
  const value = dayNoteInput.value.trim();
  if (value) dayNotes[selectedDate] = value;
  else delete dayNotes[selectedDate];
  saveDayNotes();
});

// On touch devices the tab bar gets out of the way while the keyboard is up.
if (window.matchMedia('(pointer: coarse)').matches) {
  const isTextField = (el) => el && el.matches && el.matches('input[type="text"], input[type="email"], input[type="password"], textarea');
  document.addEventListener('focusin', (e) => {
    if (isTextField(e.target)) document.body.classList.add('typing');
  });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));
}

carryOverUnfinished();
materializeRecurring();
renderTasks();

/* ============================================================
   ================   HABITS MODULE   ==========================
   ============================================================ */

const HABIT_STORAGE_KEY = 'vysion-habit-data-v1';

const daysRowEl = document.getElementById('daysRow');
const habitListEl = document.getElementById('habitList');
const habitEmptyStateEl = document.getElementById('habitEmptyState');
const weekLabelEl = document.getElementById('weekLabel');
const cellPopupEl = document.getElementById('cellPopup');
const weekNavEl = document.getElementById('weekNav');
const trendsViewEl = document.getElementById('trendsView');
const viewTabs = document.querySelectorAll('.view-tab');
const dayRecapRowEl = document.getElementById('dayRecapRow');
const weekRecapEl = document.getElementById('weekRecap');
const weekRecapValueEl = document.getElementById('weekRecapValue');

const habitModalOverlayEl = document.getElementById('habitModalOverlay');
const habitModalTitleEl = document.getElementById('habitModalTitle');
const habitNameInput = document.getElementById('habitName');
const habitWeightInput = document.getElementById('habitWeight');
const habitWeightValueEl = document.getElementById('habitWeightValue');
const habitCategorySelect = document.getElementById('habitCategory');
const habitDescriptionInput = document.getElementById('habitDescription');
const habitDeleteBtnEl = document.getElementById('habitDeleteBtn');

function migrateHabitData(data) {
  const result = data && typeof data === 'object' ? data : { habits: [], entries: {} };
  if (!Array.isArray(result.habits)) result.habits = [];
  if (!result.entries) result.entries = {};
  let changed = false;
  result.habits.forEach((h) => {
    if (typeof h.weight !== 'number') {
      h.weight = 5;
      changed = true;
    }
  });
  return { data: result, changed };
}

function loadHabitData() {
  try {
    const raw = localStorage.getItem(HABIT_STORAGE_KEY);
    if (raw) {
      const { data, changed } = migrateHabitData(JSON.parse(raw));
      if (changed) localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch { /* ignore */ }
  return { habits: [], entries: {} };
}

function saveHabitData() {
  localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify(habitData));
  pushHabitsToCloud();
}

let habitData = loadHabitData();
let weekStart = getMonday(new Date());
let editingHabitId = null;
let activePopupTarget = null;
let currentView = 'week';

let habitRealtimeChannel = null;
let lastHabitsPushedAt = null;

async function pushHabitsToCloud() {
  if (!currentUser) return;
  const updatedAt = new Date().toISOString();
  lastHabitsPushedAt = updatedAt;
  await supabase.from('habit_data').upsert({
    user_id: currentUser.id,
    data: habitData,
    updated_at: updatedAt,
  });
}

function applyRemoteHabitRow(row) {
  lastHabitsPushedAt = row.updated_at;
  const { data, changed } = migrateHabitData(row.data);
  habitData = data;
  localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify(habitData));
  renderHabits();
  if (changed) pushHabitsToCloud();
}

async function startHabitSyncForUser(user) {
  const { data: row, error } = await supabase
    .from('habit_data')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return;

  if (row) {
    applyRemoteHabitRow(row);
  } else {
    await pushHabitsToCloud();
  }

  if (habitRealtimeChannel) supabase.removeChannel(habitRealtimeChannel);
  habitRealtimeChannel = supabase
    .channel('habit_data_' + user.id)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'habit_data', filter: `user_id=eq.${user.id}` },
      (payload) => {
        const row = payload.new;
        if (!row || row.updated_at === lastHabitsPushedAt) return;
        applyRemoteHabitRow(row);
      }
    )
    .subscribe();
}

function stopHabitSync() {
  if (habitRealtimeChannel) {
    supabase.removeChannel(habitRealtimeChannel);
    habitRealtimeChannel = null;
  }
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getWeekDays() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function renderHabits() {
  weekNavEl.hidden = currentView !== 'week';
  habitListEl.hidden = currentView !== 'week';
  trendsViewEl.hidden = currentView !== 'trends';
  habitEmptyStateEl.hidden = habitData.habits.length > 0;

  if (currentView === 'week') {
    renderWeekLabel();
    renderDaysRow();
    renderHabitRows();
    renderRecap();
  } else {
    dayRecapRowEl.hidden = true;
    weekRecapEl.hidden = true;
    renderTrendsView();
  }
}

const RECAP_COLOR_CLASSES = [
  'recap-empty', 'recap-red-vivid', 'recap-red-soft',
  'recap-orange', 'recap-green-soft', 'recap-green-vivid',
];

function getRecapColorClass(pct) {
  if (pct <= 20) return 'recap-red-vivid';
  if (pct < 40) return 'recap-red-soft';
  if (pct < 70) return 'recap-orange';
  if (pct < 80) return 'recap-green-soft';
  return 'recap-green-vivid';
}

function getDayCompletion(dateKey) {
  let doneWeight = 0;
  let totalWeight = 0;
  habitData.habits.forEach((habit) => {
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[dateKey]);
    if (outcome === 'good' || outcome === 'bad') {
      totalWeight += habit.weight;
      if (outcome === 'good') doneWeight += habit.weight;
    }
  });
  return totalWeight === 0 ? null : Math.round((doneWeight / totalWeight) * 100);
}

function renderRecap() {
  const hasHabits = habitData.habits.length > 0;
  dayRecapRowEl.hidden = !hasHabits;
  weekRecapEl.hidden = !hasHabits;
  if (!hasHabits) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getWeekDays();

  dayRecapRowEl.innerHTML = '';
  const dayPcts = [];
  days.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'day-recap-cell';
    if (d > today) {
      cell.textContent = '-';
      cell.classList.add('recap-empty');
    } else {
      const pct = getDayCompletion(formatKey(d));
      if (pct === null) {
        cell.textContent = '-';
        cell.classList.add('recap-empty');
      } else {
        cell.textContent = `${pct}%`;
        cell.classList.add(getRecapColorClass(pct));
        dayPcts.push(pct);
      }
    }
    dayRecapRowEl.appendChild(cell);
  });

  weekRecapEl.classList.remove(...RECAP_COLOR_CLASSES);
  if (dayPcts.length === 0) {
    weekRecapValueEl.textContent = '-';
    weekRecapEl.classList.add('recap-empty');
    return;
  }
  const weekPct = Math.round(dayPcts.reduce((a, b) => a + b, 0) / dayPcts.length);
  weekRecapValueEl.textContent = `${weekPct}%`;
  weekRecapEl.classList.add(getRecapColorClass(weekPct));
}

viewTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    viewTabs.forEach((t) => t.classList.toggle('active', t === tab));
    renderHabits();
  });
});

function renderWeekLabel() {
  const today = new Date();
  const thisMonday = getMonday(today);
  if (isSameDay(weekStart, thisMonday)) {
    weekLabelEl.textContent = 'Cette semaine ▾';
  } else {
    const days = getWeekDays();
    const opts = { day: 'numeric', month: 'short' };
    weekLabelEl.textContent =
      `${days[0].toLocaleDateString('fr-FR', opts)} – ${days[6].toLocaleDateString('fr-FR', opts)} ▾`;
  }
}

function renderDaysRow() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getWeekDays();
  daysRowEl.innerHTML = '';
  days.forEach((d, i) => {
    const col = document.createElement('div');
    col.className = 'day-col';
    if (isSameDay(d, today)) col.classList.add('today');
    if (d > today) col.classList.add('future');
    col.innerHTML = `<span class="dow">${DOW_LABELS[i]}</span><span class="dom">${d.getDate()}</span>`;
    daysRowEl.appendChild(col);
  });
}

function renderHabitRows() {
  habitListEl.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getWeekDays();

  habitData.habits.forEach((habit, index) => {
    const row = document.createElement('div');
    row.className = 'habit-row';

    const header = document.createElement('div');
    header.className = 'habit-row-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'habit-row-header-left';
    headerLeft.innerHTML = `
      <span class="habit-name">${escapeHtml(habit.name)}</span>
      <span class="habit-category">${escapeHtml(habit.category)}</span>
      <span class="task-weight-badge" style="background:${importanceBadgeColor(habit.weight)}">${habit.weight}</span>
    `;
    headerLeft.addEventListener('click', () => openEditHabitModal(habit.id));
    header.appendChild(headerLeft);

    const headerRight = document.createElement('div');
    headerRight.className = 'habit-row-header-right';

    const currentStreak = getCurrentStreak(habit, today);
    if (currentStreak && currentStreak.length >= 3) {
      const badge = document.createElement('span');
      badge.className = `streak-badge ${currentStreak.outcome}`;
      badge.textContent = currentStreak.length;
      headerRight.appendChild(badge);
    }

    const upBtn = document.createElement('button');
    upBtn.className = 'reorder-btn';
    upBtn.textContent = '▲';
    upBtn.title = 'Monter';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveHabit(habit.id, -1));
    headerRight.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'reorder-btn';
    downBtn.textContent = '▼';
    downBtn.title = 'Descendre';
    downBtn.disabled = index === habitData.habits.length - 1;
    downBtn.addEventListener('click', () => moveHabit(habit.id, 1));
    headerRight.appendChild(downBtn);

    header.appendChild(headerRight);
    row.appendChild(header);

    const cellsWrap = document.createElement('div');
    cellsWrap.className = 'habit-cells';

    days.forEach((d) => {
      const key = formatKey(d);
      const state = habitData.entries[habit.id]?.[key];
      const outcome = getOutcome(habit, state);
      const btn = document.createElement('button');
      btn.className = 'cell';
      const isFuture = d > today;
      if (isFuture) btn.classList.add('future');

      if (outcome === 'good' || outcome === 'bad') {
        btn.classList.add(outcome);
        if (getRunLength(habit, key, outcome) >= 3) btn.classList.add('in-streak');
      } else if (state === 'skipped') {
        btn.classList.add('skipped');
        btn.innerHTML = '<span class="cell-icon">⏭</span>';
      }

      btn.disabled = isFuture;
      if (!isFuture) {
        btn.addEventListener('click', () => openCellPopup(habit, key, btn));
      }
      cellsWrap.appendChild(btn);
    });

    row.appendChild(cellsWrap);
    habitListEl.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// For a habit you want to keep (isGood), doing it is good and skipping is
// bad. For a habit you want to quit (!isGood), it's the reverse: resisting
// ("No") is good, giving in ("Yes") is bad.
function getOutcome(habit, state) {
  if (state === 'done') return habit.isGood ? 'good' : 'bad';
  if (state === 'missed') return habit.isGood ? 'bad' : 'good';
  if (state === 'skipped') return 'skipped';
  return undefined;
}

function getStreakLength(habit, dateKey, outcome) {
  let count = 0;
  const d = keyToDate(dateKey);
  while (true) {
    const key = formatKey(d);
    const entryOutcome = getOutcome(habit, habitData.entries[habit.id]?.[key]);
    if (entryOutcome === outcome) {
      count++;
    } else if (entryOutcome !== 'skipped') {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function getRunLength(habit, dateKey, outcome) {
  let count = 0;
  let d = keyToDate(dateKey);
  while (true) {
    const key = formatKey(d);
    const entryOutcome = getOutcome(habit, habitData.entries[habit.id]?.[key]);
    if (entryOutcome === outcome) count++;
    else if (entryOutcome !== 'skipped') break;
    d.setDate(d.getDate() - 1);
  }
  d = keyToDate(dateKey);
  d.setDate(d.getDate() + 1);
  while (true) {
    const key = formatKey(d);
    const entryOutcome = getOutcome(habit, habitData.entries[habit.id]?.[key]);
    if (entryOutcome === outcome) count++;
    else if (entryOutcome !== 'skipped') break;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// The streak currently "in play": walks back from today through skipped
// days and, once, through an untracked today (today isn't over yet).
function getCurrentStreak(habit, today) {
  const cursor = new Date(today);
  let allowUntrackedToday = true;
  while (true) {
    const key = formatKey(cursor);
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[key]);
    if (outcome === 'skipped') {
      cursor.setDate(cursor.getDate() - 1);
      allowUntrackedToday = false;
      continue;
    }
    if (outcome === undefined && allowUntrackedToday) {
      cursor.setDate(cursor.getDate() - 1);
      allowUntrackedToday = false;
      continue;
    }
    if (outcome !== 'good' && outcome !== 'bad') return null;
    return { outcome, length: getStreakLength(habit, key, outcome) };
  }
}

function moveHabit(habitId, direction) {
  const index = habitData.habits.findIndex((h) => h.id === habitId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= habitData.habits.length) return;
  const [habit] = habitData.habits.splice(index, 1);
  habitData.habits.splice(target, 0, habit);
  saveHabitData();
  renderHabits();
}

function getBestStreak(habit) {
  const keys = Object.keys(habitData.entries[habit.id] || {});
  if (keys.length === 0) return 0;
  let cursor = keyToDate(keys.sort()[0]);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  let current = 0;
  let best = 0;
  while (cursor <= end) {
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[formatKey(cursor)]);
    if (outcome === 'good') {
      current++;
      best = Math.max(best, current);
    } else if (outcome !== 'skipped') {
      current = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}

function getCompletionRate(habit, days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  let good = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[formatKey(d)]);
    if (outcome === 'good' || outcome === 'bad') {
      total++;
      if (outcome === 'good') good++;
    }
  }
  return total === 0 ? null : Math.round((good / total) * 100);
}

// Completion rate for the 7 days starting at weekStartDate (future days,
// relative to today, are skipped rather than counted as misses).
function getWeeklyRate(habit, weekStartDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let good = 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    if (d > today) continue;
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[formatKey(d)]);
    if (outcome === 'good' || outcome === 'bad') {
      total++;
      if (outcome === 'good') good++;
    }
  }
  return total === 0 ? null : Math.round((good / total) * 100);
}

function colorForPct(pct) {
  if (pct <= 20) return 'var(--recap-red-vivid)';
  if (pct < 40) return 'var(--recap-red-soft)';
  if (pct < 70) return 'var(--recap-orange)';
  if (pct < 80) return 'var(--recap-green-soft)';
  return 'var(--recap-green-vivid)';
}

// Small inline SVG line chart of the last WEEKS_SHOWN weeks' completion rate,
// giving an at-a-glance trend instead of scanning individual day squares.
// Weeks with no tracked data are simply skipped (no point, no false "0%"),
// and the line only connects consecutive weeks that do have data - so a
// single tracked week reads as one clear dot rather than a solid block.
function buildTrendChart(habit) {
  const WEEKS_SHOWN = 8;
  const thisMonday = getMonday(new Date());
  const weeks = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    const ws = new Date(thisMonday);
    ws.setDate(ws.getDate() - i * 7);
    weeks.push(getWeeklyRate(habit, ws));
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const width = 280;
  const height = 70;
  const padX = 6;
  const padTop = 10;
  const padBottom = 10;
  const usableHeight = height - padTop - padBottom;
  const stepX = (width - padX * 2) / (WEEKS_SHOWN - 1);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'trend-chart');

  const points = weeks.map((pct, i) => {
    if (pct === null) return null;
    return { x: padX + i * stepX, y: padTop + usableHeight - (pct / 100) * usableHeight, pct };
  });

  if (!points.some(Boolean)) {
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2 + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-muted)');
    text.setAttribute('font-size', '12');
    text.textContent = 'Pas encore assez de données';
    svg.appendChild(text);
    return svg;
  }

  const midline = document.createElementNS(svgNS, 'line');
  midline.setAttribute('x1', 0);
  midline.setAttribute('x2', width);
  midline.setAttribute('y1', padTop + usableHeight / 2);
  midline.setAttribute('y2', padTop + usableHeight / 2);
  midline.setAttribute('stroke', 'var(--border)');
  midline.setAttribute('stroke-width', 1);
  svg.appendChild(midline);

  let segment = [];
  const flushSegment = () => {
    if (segment.length >= 2) {
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', segment.map((p) => `${p.x},${p.y}`).join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', 'var(--accent)');
      poly.setAttribute('stroke-width', 2);
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
    }
    segment = [];
  };
  points.forEach((p) => {
    if (p) segment.push(p);
    else flushSegment();
  });
  flushSegment();

  points.forEach((p) => {
    if (!p) return;
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', p.x);
    dot.setAttribute('cy', p.y);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', colorForPct(p.pct));
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${p.pct}%`;
    dot.appendChild(title);
    svg.appendChild(dot);
  });

  return svg;
}

function renderTrendsView() {
  trendsViewEl.innerHTML = '';
  if (habitData.habits.length === 0) return;

  const HEATMAP_DAYS = 28;
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  habitData.habits.forEach((habit) => {
    const card = document.createElement('div');
    card.className = 'trend-card';

    const header = document.createElement('div');
    header.className = 'trend-card-header';
    header.innerHTML = `
      <span class="habit-name">${escapeHtml(habit.name)}</span>
      <span class="habit-category">${escapeHtml(habit.category)}</span>
      <span class="task-weight-badge" style="background:${importanceBadgeColor(habit.weight)}">${habit.weight}</span>
    `;
    card.appendChild(header);

    const chartLabel = document.createElement('div');
    chartLabel.className = 'trend-chart-label';
    chartLabel.textContent = 'Tendance hebdomadaire (8 dernières semaines)';
    card.appendChild(chartLabel);
    card.appendChild(buildTrendChart(habit));

    const heatmap = document.createElement('div');
    heatmap.className = 'trend-heatmap';
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const state = habitData.entries[habit.id]?.[formatKey(d)];
      const outcome = getOutcome(habit, state);
      const day = document.createElement('div');
      day.className = 'trend-day';
      if (outcome === 'good' || outcome === 'bad') day.classList.add(outcome);
      else if (state === 'skipped') day.classList.add('skipped');
      day.title = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      heatmap.appendChild(day);
    }
    card.appendChild(heatmap);

    const rate = getCompletionRate(habit, 30);
    const best = getBestStreak(habit);
    const current = getCurrentStreak(habit, end);

    const stats = document.createElement('div');
    stats.className = 'trend-stats';
    stats.innerHTML = `
      <div class="trend-stat">
        <span class="trend-stat-value">${rate === null ? '-' : rate + '%'}</span>
        <span class="trend-stat-label">Réussite (30j)</span>
      </div>
      <div class="trend-stat">
        <span class="trend-stat-value">${current && current.outcome === 'good' ? current.length : 0}</span>
        <span class="trend-stat-label">Série actuelle</span>
      </div>
      <div class="trend-stat">
        <span class="trend-stat-value">${best}</span>
        <span class="trend-stat-label">Record</span>
      </div>
    `;
    card.appendChild(stats);

    trendsViewEl.appendChild(card);
  });
}

function setHabitEntry(habitId, dateKey, state) {
  if (!habitData.entries[habitId]) habitData.entries[habitId] = {};
  if (state) habitData.entries[habitId][dateKey] = state;
  else delete habitData.entries[habitId][dateKey];
  saveHabitData();
  renderHabits();
}

function openCellPopup(habit, dateKey, cellEl) {
  activePopupTarget = { habitId: habit.id, dateKey };
  cellPopupEl.classList.toggle('inverted', !habit.isGood);
  cellPopupEl.hidden = false;

  const rect = cellEl.getBoundingClientRect();
  const popupWidth = cellPopupEl.offsetWidth;
  let left = rect.left + rect.width / 2 - popupWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
  cellPopupEl.style.left = `${left}px`;
  cellPopupEl.style.top = `${rect.bottom + 10}px`;

  const arrowX = rect.left + rect.width / 2 - left - 9;
  document.querySelector('.popup-arrow').style.margin = `0 0 0 ${Math.max(12, Math.min(arrowX, popupWidth - 30))}px`;
}

function closeCellPopup() {
  cellPopupEl.hidden = true;
  activePopupTarget = null;
}

cellPopupEl.querySelectorAll('.popup-action').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!activePopupTarget) return;
    const { habitId, dateKey } = activePopupTarget;
    const action = btn.dataset.action;
    setHabitEntry(habitId, dateKey, action === 'erase' ? null : action);
    closeCellPopup();
  });
});

document.addEventListener('click', (e) => {
  if (!activePopupTarget) return;
  if (cellPopupEl.contains(e.target)) return;
  if (e.target.closest('.cell')) return;
  closeCellPopup();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCellPopup();
});

function openAddHabitModal() {
  editingHabitId = null;
  habitModalTitleEl.textContent = 'Nouvelle habitude';
  habitNameInput.value = '';
  habitCategorySelect.value = 'Productivité';
  habitDescriptionInput.value = '';
  habitWeightInput.value = '5';
  setImportanceLabel(habitWeightValueEl, 5);
  document.querySelector('input[name="isGood"][value="good"]').checked = true;
  habitDeleteBtnEl.hidden = true;
  resetHabitDeleteConfirm();
  habitModalOverlayEl.hidden = false;
  habitNameInput.focus();
}

function openEditHabitModal(habitId) {
  const habit = habitData.habits.find((h) => h.id === habitId);
  if (!habit) return;
  editingHabitId = habitId;
  habitModalTitleEl.textContent = "Modifier l'habitude";
  habitNameInput.value = habit.name;
  habitCategorySelect.value = habit.category;
  habitDescriptionInput.value = habit.description || '';
  habitWeightInput.value = String(habit.weight);
  setImportanceLabel(habitWeightValueEl, habit.weight);
  document.querySelector(
    `input[name="isGood"][value="${habit.isGood ? 'good' : 'bad'}"]`
  ).checked = true;
  habitDeleteBtnEl.hidden = false;
  resetHabitDeleteConfirm();
  habitModalOverlayEl.hidden = false;
  habitNameInput.focus();
}

habitWeightInput.addEventListener('input', () => {
  setImportanceLabel(habitWeightValueEl, Number(habitWeightInput.value));
});

function closeHabitModal() {
  habitModalOverlayEl.hidden = true;
  editingHabitId = null;
}

function saveHabit() {
  const name = habitNameInput.value.trim();
  if (!name) {
    habitNameInput.focus();
    return;
  }
  const isGood = document.querySelector('input[name="isGood"]:checked').value === 'good';
  const category = habitCategorySelect.value;
  const description = habitDescriptionInput.value.trim();
  const weight = Number(habitWeightInput.value);

  if (editingHabitId) {
    const habit = habitData.habits.find((h) => h.id === editingHabitId);
    Object.assign(habit, { name, isGood, category, description, weight });
  } else {
    habitData.habits.push({
      id: crypto.randomUUID(),
      name,
      isGood,
      category,
      description,
      weight,
    });
  }

  closeHabitModal();
  saveHabitData();
  renderHabits();
}

function deleteHabit() {
  if (!editingHabitId) return;
  if (!habitDeleteBtnEl.classList.contains('confirming')) {
    habitDeleteBtnEl.classList.add('confirming');
    habitDeleteBtnEl.textContent = 'Confirmer la suppression';
    return;
  }
  habitData.habits = habitData.habits.filter((h) => h.id !== editingHabitId);
  delete habitData.entries[editingHabitId];
  closeHabitModal();
  saveHabitData();
  renderHabits();
}

function resetHabitDeleteConfirm() {
  habitDeleteBtnEl.classList.remove('confirming');
  habitDeleteBtnEl.textContent = 'Supprimer';
}

document.getElementById('addHabitBtn').addEventListener('click', openAddHabitModal);
document.getElementById('habitCancelBtn').addEventListener('click', closeHabitModal);
document.getElementById('habitSaveBtn').addEventListener('click', saveHabit);
habitDeleteBtnEl.addEventListener('click', deleteHabit);
habitModalOverlayEl.addEventListener('click', (e) => {
  if (e.target === habitModalOverlayEl) closeHabitModal();
});

document.getElementById('prevWeek').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() - 7);
  renderHabits();
});
document.getElementById('nextWeek').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() + 7);
  renderHabits();
});
weekLabelEl.addEventListener('click', () => {
  openWeekPicker();
});

// ---- Week picker (calendar to jump to any past/future week) --------

const weekPickerOverlayEl = document.getElementById('weekPickerOverlay');
const weekPickerMonthLabelEl = document.getElementById('weekPickerMonthLabel');
const weekPickerGridEl = document.getElementById('weekPickerGrid');
const weekPickerPrevMonthBtn = document.getElementById('weekPickerPrevMonth');
const weekPickerNextMonthBtn = document.getElementById('weekPickerNextMonth');
const weekPickerTodayBtn = document.getElementById('weekPickerTodayBtn');
const weekPickerCloseBtn = document.getElementById('weekPickerCloseBtn');
const WEEK_PICKER_DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

let weekPickerMonthCursor = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);

function openWeekPicker() {
  weekPickerMonthCursor = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  renderWeekPicker();
  weekPickerOverlayEl.hidden = false;
}

function closeWeekPicker() {
  weekPickerOverlayEl.hidden = true;
}

function renderWeekPicker() {
  const monthLabel = weekPickerMonthCursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  weekPickerMonthLabelEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  weekPickerGridEl.innerHTML = '';
  WEEK_PICKER_DOW.forEach(label => {
    const el = document.createElement('div');
    el.className = 'week-picker-dow';
    el.textContent = label;
    weekPickerGridEl.appendChild(el);
  });

  const firstOfMonth = new Date(weekPickerMonthCursor.getFullYear(), weekPickerMonthCursor.getMonth(), 1);
  const gridStart = getMonday(firstOfMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'week-picker-day';
    if (d.getMonth() !== weekPickerMonthCursor.getMonth()) btn.classList.add('muted');
    if (isSameDay(d, today)) btn.classList.add('today');
    if (d >= weekStart && d <= weekEnd) btn.classList.add('in-selected-week');
    btn.textContent = d.getDate();
    btn.addEventListener('click', () => {
      weekStart = getMonday(d);
      closeWeekPicker();
      renderHabits();
    });
    weekPickerGridEl.appendChild(btn);
  }
}

weekPickerPrevMonthBtn.addEventListener('click', () => {
  weekPickerMonthCursor.setMonth(weekPickerMonthCursor.getMonth() - 1);
  renderWeekPicker();
});
weekPickerNextMonthBtn.addEventListener('click', () => {
  weekPickerMonthCursor.setMonth(weekPickerMonthCursor.getMonth() + 1);
  renderWeekPicker();
});
weekPickerTodayBtn.addEventListener('click', () => {
  weekStart = getMonday(new Date());
  closeWeekPicker();
  renderHabits();
});
weekPickerCloseBtn.addEventListener('click', closeWeekPicker);
weekPickerOverlayEl.addEventListener('click', (e) => {
  if (e.target === weekPickerOverlayEl) closeWeekPicker();
});

renderHabits();

// ============================================================
// Service worker (offline cache)
// ============================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
