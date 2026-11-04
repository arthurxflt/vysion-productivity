// Module Habitudes, repris de la version précédente sans changer sa logique.
// Il reçoit le client Supabase et un accesseur d'utilisateur au lieu de les
// lire dans des variables globales.
import { importanceBadgeColor, setImportanceLabel } from './colors.js';

export function createHabits({ supabase, getUser }) {
  const pad = (n) => String(n).padStart(2, '0');
  function formatKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

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
    const currentUser = getUser();
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
        `${days[0].toLocaleDateString('fr-FR', opts)} au ${days[6].toLocaleDateString('fr-FR', opts)} ▾`;
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

  return {
    start: startHabitSyncForUser,
    stop: stopHabitSync,
    render: renderHabits,
  };
}
