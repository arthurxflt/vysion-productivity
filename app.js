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
const headerLogoutBtn = document.getElementById('headerLogoutBtn');

function updateAuthUI() {
  const loggedIn = !!currentUser;
  authGateEl.hidden = loggedIn;
  appContentEl.hidden = !loggedIn;
  headerLogoutBtn.hidden = !loggedIn;
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
    : 'Compte créé — vérifie ta boîte mail pour confirmer, puis connecte-toi.';
});

headerLogoutBtn.addEventListener('click', async () => {
  if (confirm('Te déconnecter sur cet appareil ?')) {
    await supabase.auth.signOut();
  }
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
const listTitleEl = document.getElementById('listTitle');
const addForm = document.getElementById('addForm');
const titleInput = document.getElementById('taskTitle');
const weightInput = document.getElementById('taskWeight');
const weightValueEl = document.getElementById('weightValue');
const scoreValueEl = document.getElementById('scoreValue');
const scoreLabelEl = document.getElementById('scoreLabel');
const scoreBarFillEl = document.getElementById('scoreBarFill');
const scoreSubEl = document.getElementById('scoreSub');
const priorityWarningEl = document.getElementById('priorityWarning');
const navDayChipsEl = document.getElementById('navDayChips');
const navOtherDateToggle = document.getElementById('navOtherDateToggle');
const navDateJumpInput = document.getElementById('navDateJump');
const completedWrapEl = document.getElementById('completedWrap');
const completedToggleEl = document.getElementById('completedToggle');
const completedToggleLabelEl = document.getElementById('completedToggleLabel');
const completedChevronEl = document.getElementById('completedChevron');
const completedListEl = document.getElementById('completedList');
const abandonedWrapEl = document.getElementById('abandonedWrap');
const abandonedToggleEl = document.getElementById('abandonedToggle');
const abandonedToggleLabelEl = document.getElementById('abandonedToggleLabel');
const abandonedChevronEl = document.getElementById('abandonedChevron');
const abandonedListEl = document.getElementById('abandonedList');
const dayNoteInput = document.getElementById('dayNoteInput');
const repeatModeSelect = document.getElementById('repeatMode');
const weekdayPicker = document.getElementById('weekdayPicker');
const datePickerRow = document.getElementById('datePickerRow');
const dayChipsEl = document.getElementById('dayChips');
const otherDateToggle = document.getElementById('otherDateToggle');
const taskDateInput = document.getElementById('taskDate');
const recurringWrap = document.getElementById('recurringWrap');
const recurringListEl = document.getElementById('recurringList');
const upcomingWrap = document.getElementById('upcomingWrap');
const upcomingList = document.getElementById('upcomingList');
const historyWrap = document.getElementById('historyWrap');
const historyList = document.getElementById('historyList');

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
let selectedTaskDate = todayKey();
let completedExpanded = false;
let abandonedExpanded = false;
const openNoteIds = new Set();
const selectedWeekdays = new Set();

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

function weightColor(weight) {
  if (weight >= 8) return '#e84393';
  if (weight >= 5) return '#6c5ce7';
  return '#74b9ff';
}

function computeScore(taskArr) {
  const totalWeight = taskArr.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = taskArr.filter(t => t.status === 'done').reduce((sum, t) => sum + t.weight, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100);
  return { totalWeight, doneWeight, percent };
}

function scoreMessage(percent, hasTasks) {
  if (!hasTasks) return "Aucune tâche pour l'instant";
  if (percent >= 80) return 'Journée Pareto : tu as attaqué l\'essentiel';
  if (percent >= 50) return 'Bonne progression sur ce qui compte';
  if (percent >= 20) return 'Encore du poids important à faire tomber';
  return "L'essentiel n'est pas encore fait";
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

function chipLabel(key) {
  const rel = relativeLabel(key);
  if (rel) return rel;
  const d = keyToDate(key);
  const wd = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.getDate()}`;
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
  selectedTaskDate = key;
  completedExpanded = false;
  abandonedExpanded = false;
  renderTasks();
}

function setTaskDate(key) {
  selectedTaskDate = key;
  renderDayChips();
}

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item'
    + (task.status === 'done' ? ' done' : '')
    + (task.status === 'abandoned' ? ' abandoned' : '');

  const main = document.createElement('div');
  main.className = 'task-item-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.status === 'done';
  checkbox.addEventListener('change', () => toggleTask(task.id));

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

  const badge = document.createElement('span');
  badge.className = 'task-weight-badge';
  badge.textContent = task.weight;
  badge.style.background = weightColor(task.weight);

  const noteBtn = document.createElement('button');
  noteBtn.type = 'button';
  noteBtn.className = 'task-icon-btn' + (task.note ? ' has-note' : '');
  noteBtn.textContent = '🗒️';
  noteBtn.title = task.note ? 'Modifier la note' : 'Ajouter une note';
  noteBtn.setAttribute('aria-label', 'Note de la tâche');
  noteBtn.addEventListener('click', () => toggleNoteEditor(task.id));

  main.append(checkbox, title, badge, noteBtn);

  if (task.status !== 'done') {
    const stateBtn = document.createElement('button');
    stateBtn.type = 'button';
    stateBtn.className = 'task-icon-btn';
    if (task.status === 'abandoned') {
      stateBtn.textContent = '↩';
      stateBtn.title = 'Remettre en tâche à faire';
      stateBtn.setAttribute('aria-label', 'Réactiver la tâche');
      stateBtn.addEventListener('click', () => restoreTask(task.id));
    } else {
      stateBtn.textContent = '🚫';
      stateBtn.title = 'Marquer comme abandonnée';
      stateBtn.setAttribute('aria-label', 'Abandonner la tâche');
      stateBtn.addEventListener('click', () => abandonTask(task.id, task.title));
    }
    main.append(stateBtn);
  }

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Supprimer la tâche');
  del.addEventListener('click', () => deleteTask(task.id));
  main.append(del);

  li.append(main);

  const isEditingNote = openNoteIds.has(task.id);
  if (task.note || isEditingNote) {
    const noteWrap = document.createElement('div');
    noteWrap.className = 'task-note-row';

    if (isEditingNote) {
      const textarea = document.createElement('textarea');
      textarea.className = 'task-note-input';
      textarea.dataset.taskId = task.id;
      textarea.placeholder = 'Ajouter une note…';
      textarea.value = task.note || '';
      textarea.rows = 2;
      textarea.addEventListener('blur', () => saveTaskNote(task.id, textarea.value));
      noteWrap.appendChild(textarea);
    } else {
      const noteText = document.createElement('p');
      noteText.className = 'task-note-text';
      noteText.textContent = task.note;
      noteText.addEventListener('click', () => toggleNoteEditor(task.id));
      noteWrap.appendChild(noteText);
    }

    li.appendChild(noteWrap);
  }

  return li;
}

function renderTasks() {
  const dayTasks = tasksForDate(selectedDate);
  const sorted = [...dayTasks].sort((a, b) => b.weight - a.weight);
  const undoneTasks = sorted.filter(t => t.status === 'pending');
  const doneTasks = sorted.filter(t => t.status === 'done');
  const abandonedTasks = sorted.filter(t => t.status === 'abandoned');

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
  completedToggleLabelEl.textContent = `Tâches effectuées (${doneTasks.length})`;
  completedListEl.innerHTML = '';
  doneTasks.forEach(task => completedListEl.appendChild(buildTaskItem(task)));
  completedListEl.hidden = !completedExpanded;
  completedChevronEl.textContent = completedExpanded ? '▴' : '▾';

  abandonedWrapEl.hidden = abandonedTasks.length === 0;
  abandonedToggleLabelEl.textContent = `Tâches abandonnées (${abandonedTasks.length})`;
  abandonedListEl.innerHTML = '';
  abandonedTasks.forEach(task => abandonedListEl.appendChild(buildTaskItem(task)));
  abandonedListEl.hidden = !abandonedExpanded;
  abandonedChevronEl.textContent = abandonedExpanded ? '▴' : '▾';

  const { percent } = computeScore(dayTasks);
  scoreValueEl.textContent = percent + '%';
  scoreLabelEl.textContent = scoreMessage(percent, dayTasks.length > 0);
  scoreBarFillEl.style.width = percent + '%';

  scoreSubEl.textContent = dayTasks.length > 0
    ? `${doneTasks.length}/${dayTasks.length} tâches cochées — le score reflète le poids, pas le nombre`
    : '';

  const hasPriority = dayTasks.some(t => t.weight >= PRIORITY_THRESHOLD);
  priorityWarningEl.hidden = !(dayTasks.length > 0 && !hasPriority);

  const relative = relativeLabel(selectedDate);
  listTitleEl.textContent = relative ? `Tâches — ${relative}` : `Tâches — ${shortLabel(selectedDate)}`;

  dayNoteInput.value = dayNotes[selectedDate] || '';

  navDateJumpInput.value = selectedDate;
  renderNavChips();

  taskDateInput.value = selectedTaskDate;
  renderDayChips();
  renderRecurringList();
  renderUpcoming();
  renderHistory();
}

function renderNavChips() {
  navDayChipsEl.innerHTML = '';
  const today = todayKey();
  const keys = [addDaysToKey(today, -1), today, addDaysToKey(today, 1)];
  // keep the currently viewed day visible even if it's further away
  if (!keys.includes(selectedDate)) keys.push(selectedDate);

  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-chip' + (key === selectedDate ? ' active' : '');
    btn.textContent = chipLabel(key);
    btn.addEventListener('click', () => goToDate(key));
    navDayChipsEl.appendChild(btn);
  });
}

function renderDayChips() {
  dayChipsEl.innerHTML = '';
  const start = todayKey();
  const keys = [];
  for (let i = 0; i < 6; i++) keys.push(addDaysToKey(start, i));
  if (!keys.includes(selectedTaskDate)) keys.push(selectedTaskDate);

  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-chip' + (key === selectedTaskDate ? ' active' : '');
    btn.textContent = chipLabel(key);
    btn.addEventListener('click', () => setTaskDate(key));
    dayChipsEl.appendChild(btn);
  });
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) task.status = task.status === 'done' ? 'pending' : 'done';
  saveTasks();
  renderTasks();
}

function abandonTask(id, title) {
  const ok = confirm(`Marquer « ${title} » comme abandonnée ?\n\nElle ne comptera plus dans ton score, mais restera visible dans "Tâches abandonnées".`);
  if (!ok) return;
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

function toggleNoteEditor(id) {
  if (openNoteIds.has(id)) {
    openNoteIds.delete(id);
  } else {
    openNoteIds.add(id);
  }
  renderTasks();
  if (openNoteIds.has(id)) {
    const textarea = document.querySelector(`.task-note-input[data-task-id="${id}"]`);
    if (textarea) textarea.focus();
  }
}

function saveTaskNote(id, value) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const trimmed = value.trim();
  openNoteIds.delete(id);
  if (task.note === trimmed) {
    renderTasks();
    return;
  }
  task.note = trimmed;
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

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
  recurringWrap.hidden = recurringTasks.length === 0;
  recurringListEl.innerHTML = '';
  recurringTasks.forEach(rt => {
    const li = document.createElement('li');
    li.className = 'recurring-item';

    const info = document.createElement('span');
    info.className = 'recurring-info';
    info.textContent = `${rt.title} · ${weekdayPatternLabel(rt.days)}`;

    const badge = document.createElement('span');
    badge.className = 'task-weight-badge';
    badge.textContent = rt.weight;
    badge.style.background = weightColor(rt.weight);

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Arrêter cette récurrence');
    del.addEventListener('click', () => deleteRecurringTask(rt.id));

    li.append(info, badge, del);
    recurringListEl.appendChild(li);
  });
}

function buildDayListItem(dateKey) {
  const { percent } = computeScore(tasksForDate(dateKey));
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'history-item';
  btn.addEventListener('click', () => goToDate(dateKey));

  const date = document.createElement('span');
  date.className = 'history-date';
  date.textContent = shortLabel(dateKey);

  const score = document.createElement('span');
  score.className = 'history-score';
  score.textContent = percent + '%';

  btn.append(date, score);
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
  dateEl.className = 'upcoming-day-date';
  dateEl.textContent = relativeLabel(dateKey) || longLabel(dateKey);

  const scoreEl = document.createElement('span');
  scoreEl.className = 'upcoming-day-score';
  scoreEl.textContent = percent + '%';

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
    weight.className = 'upcoming-task-weight';
    weight.textContent = task.weight;
    weight.style.color = weightColor(task.weight);

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
  upcomingWrap.hidden = futureDates.length === 0;
  upcomingList.innerHTML = '';
  futureDates.forEach(dateKey => upcomingList.appendChild(buildUpcomingDayBlock(dateKey)));
}

function renderHistory() {
  const today = todayKey();
  const pastDates = [...new Set(tasks.filter(t => t.date < today).map(t => t.date))].sort().reverse();
  historyWrap.hidden = pastDates.length === 0;
  historyList.innerHTML = '';
  pastDates.slice(0, 30).forEach(dateKey => historyList.appendChild(buildDayListItem(dateKey)));
}

weightInput.addEventListener('input', () => {
  weightValueEl.textContent = weightInput.value;
});

repeatModeSelect.addEventListener('change', () => {
  const mode = repeatModeSelect.value;
  weekdayPicker.hidden = mode !== 'custom';
  datePickerRow.hidden = mode !== 'once';
});

weekdayPicker.querySelectorAll('.weekday-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const day = Number(btn.dataset.day);
    if (selectedWeekdays.has(day)) {
      selectedWeekdays.delete(day);
      btn.classList.remove('active');
    } else {
      selectedWeekdays.add(day);
      btn.classList.add('active');
    }
  });
});

otherDateToggle.addEventListener('click', () => {
  taskDateInput.hidden = !taskDateInput.hidden;
  if (!taskDateInput.hidden) {
    taskDateInput.value = selectedTaskDate;
    taskDateInput.focus();
  }
});

taskDateInput.addEventListener('change', () => {
  if (taskDateInput.value) setTaskDate(taskDateInput.value);
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const weight = Number(weightInput.value);
  const mode = repeatModeSelect.value;

  if (mode === 'once') {
    addTask(title, weight, selectedTaskDate);
  } else {
    const days = mode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [...selectedWeekdays];
    if (days.length === 0) {
      alert('Choisis au moins un jour pour une tâche récurrente.');
      return;
    }
    addRecurringTask(title, weight, days);
  }

  titleInput.value = '';
  weightInput.value = 5;
  weightValueEl.textContent = '5';
  repeatModeSelect.value = 'once';
  weekdayPicker.hidden = true;
  datePickerRow.hidden = false;
  selectedWeekdays.clear();
  weekdayPicker.querySelectorAll('.weekday-chip.active').forEach(b => b.classList.remove('active'));
  taskDateInput.hidden = true;
  setTaskDate(selectedDate);
  titleInput.focus();
});

navOtherDateToggle.addEventListener('click', () => {
  navDateJumpInput.hidden = !navDateJumpInput.hidden;
  if (!navDateJumpInput.hidden) {
    navDateJumpInput.value = selectedDate;
    navDateJumpInput.focus();
  }
});

navDateJumpInput.addEventListener('change', () => {
  if (navDateJumpInput.value) {
    goToDate(navDateJumpInput.value);
    navDateJumpInput.hidden = true;
  }
});

completedToggleEl.addEventListener('click', () => {
  completedExpanded = !completedExpanded;
  completedListEl.hidden = !completedExpanded;
  completedChevronEl.textContent = completedExpanded ? '▴' : '▾';
});

abandonedToggleEl.addEventListener('click', () => {
  abandonedExpanded = !abandonedExpanded;
  abandonedListEl.hidden = !abandonedExpanded;
  abandonedChevronEl.textContent = abandonedExpanded ? '▴' : '▾';
});

dayNoteInput.addEventListener('blur', () => {
  const value = dayNoteInput.value.trim();
  if (value) dayNotes[selectedDate] = value;
  else delete dayNotes[selectedDate];
  saveDayNotes();
});

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
const habitCategorySelect = document.getElementById('habitCategory');
const habitDescriptionInput = document.getElementById('habitDescription');
const habitDeleteBtnEl = document.getElementById('habitDeleteBtn');

function loadHabitData() {
  try {
    const raw = localStorage.getItem(HABIT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
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
  habitData = row.data || { habits: [], entries: {} };
  localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify(habitData));
  renderHabits();
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
  let good = 0;
  let total = 0;
  habitData.habits.forEach((habit) => {
    const outcome = getOutcome(habit, habitData.entries[habit.id]?.[dateKey]);
    if (outcome === 'good' || outcome === 'bad') {
      total++;
      if (outcome === 'good') good++;
    }
  });
  return total === 0 ? null : Math.round((good / total) * 100);
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
      cell.textContent = '—';
      cell.classList.add('recap-empty');
    } else {
      const pct = getDayCompletion(formatKey(d));
      if (pct === null) {
        cell.textContent = '—';
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
    weekRecapValueEl.textContent = '—';
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
    `;
    card.appendChild(header);

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
        <span class="trend-stat-value">${rate === null ? '—' : rate + '%'}</span>
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
  document.querySelector(
    `input[name="isGood"][value="${habit.isGood ? 'good' : 'bad'}"]`
  ).checked = true;
  habitDeleteBtnEl.hidden = false;
  resetHabitDeleteConfirm();
  habitModalOverlayEl.hidden = false;
  habitNameInput.focus();
}

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

  if (editingHabitId) {
    const habit = habitData.habits.find((h) => h.id === editingHabitId);
    Object.assign(habit, { name, isGood, category, description });
  } else {
    habitData.habits.push({
      id: crypto.randomUUID(),
      name,
      isGood,
      category,
      description,
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
  weekStart = getMonday(new Date());
  renderHabits();
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
