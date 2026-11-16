// Vues du planificateur : Horizons, Heures, Jours, Semaines, Mois, Années.
import { h, icon, openPopover, closeAllPopovers } from './ui.js';
import * as D from './dates.js';
import * as M from './model.js';
import { setImportanceLabel } from './colors.js';

export const VIEW_META = {
  horizons: { label: 'Horizons', icon: 'horizons', step: 'day' },
  heures: { label: 'Heures', icon: 'hours', step: 'day' },
  jours: { label: 'Jours', icon: 'day', step: 'day' },
  semaines: { label: 'Semaines', icon: 'week', step: 'week' },
  mois: { label: 'Mois', icon: 'month', step: 'month' },
  annees: { label: 'Années', icon: 'year', step: 'year' },
};

export const HOUR_H = 56;
const MIN_BLOCK = 22;

export function createViews(app) {
  const { store, ui } = app;
  const state = () => store.getState();

  const colKey = (col) => `${col.horizon}:${col.anchor}`;

  function columnTitles(col) {
    const today = app.today();
    if (col.horizon === 'day') return [D.dayTitle(col.anchor, today), D.dayDateLabel(col.anchor)];
    if (col.horizon === 'week') return [D.weekRange(col.anchor), D.weekTitle(col.anchor)];
    if (col.horizon === 'month') return [D.monthTitle(col.anchor), col.anchor.slice(0, 4)];
    return [col.anchor.slice(0, 4), 'Année'];
  }

  function labelDot(label) {
    const d = app.labels.dot(label, 8);
    d.title = label.name;
    return d;
  }

  // --- ligne de tâche -------------------------------------------------------
  function taskRow(task, { nested = false, drag = false } = {}) {
    const s = state();
    const children = M.childrenOf(s, task.id);
    const parent = nested ? null : M.parentOf(s, task.id);
    const open = ui.expanded.has(task.id);
    const label = M.labelOf(s, task);

    const check = h('button', {
      type: 'button',
      class: 'check',
      role: 'checkbox',
      'aria-checked': String(task.done),
      'aria-label': task.done ? 'Marquer comme à faire' : 'Marquer comme faite',
      onclick: () => store.mutate((st) => M.toggleDone(st, task.id), { undoable: true }),
    }, icon('check', 13));

    const weight = h('button', {
      type: 'button',
      class: 'weight',
      title: 'Importance',
      onclick: (e) => app.taskMenu.openImportance(e.currentTarget, task.id, { side: 'end' }),
    });
    setImportanceLabel(weight, task.weight);

    const more = h('button', {
      type: 'button', class: 'more', title: 'Plus d’options', 'aria-label': 'Plus d’options', 'aria-haspopup': 'menu',
      onclick: (e) => app.taskMenu.open(e.currentTarget, task.id),
    }, icon('dots', 18));

    const meta = [];
    if (parent) meta.push(h('span', { class: 'task-sub' }, parent.title));
    if (task.time) meta.push(h('span', { class: 'task-sub time' }, D.timeRange(task.time.start, task.time.dur)));
    if (children.length) {
      meta.push(h('button', {
        type: 'button', class: `task-sub toggle${open ? ' open' : ''}`, 'aria-expanded': String(open),
        onclick: () => { if (open) ui.expanded.delete(task.id); else ui.expanded.add(task.id); app.render(); },
      }, `${children.length} ${children.length > 1 ? 'sous-objectifs' : 'sous-objectif'}`, icon('chevD', 12)));
    }

    const li = h('li', { class: `task${task.done ? ' done' : ''}${nested ? ' nested' : ''}`, dataset: { id: task.id } },
      check,
      h('div', { class: 'task-main' },
        h('button', { type: 'button', class: 'task-title', onclick: () => app.openDetail(task.id) }, label ? labelDot(label) : null, task.title),
        meta.length ? h('div', { class: 'task-meta' }, meta) : null),
      weight,
      more);
    if (drag) {
      li.classList.add('draggable');
      li.prepend(h('span', { class: 'grip', title: 'Glisser vers une heure' }, icon('grip', 14)));
      enableDrag(li, task);
    }
    if (open && children.length) {
      li.append(h('ul', { class: 'subtasks' }, children.map((c) => taskRow(c, { nested: true }))));
    }
    return li;
  }


  // --- glisser une tâche sans heure vers la grille -----------------------------
  // Pointer events plutôt que le glisser-déposer HTML5, qui ne marche pas au doigt.
  // Souris : on attrape la ligne entière. Tactile : seulement la poignée, pour ne
  // pas bloquer le défilement.
  function enableDrag(li, task) {
    li.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.check, .more, .weight, input')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      let slot = null;
      let drop = null;

      const scroller = () => li.closest('.hours-scroll');
      const clearSlot = () => { if (slot) slot.remove(); slot = null; };

      const locate = (x, y) => {
        const col = document.elementsFromPoint(x, y).find((n) => n.classList && n.classList.contains('hours-col'));
        if (!col) return null;
        const rect = col.getBoundingClientRect();
        const minutes = Math.floor((((y - rect.top) / HOUR_H) * 60) / 15) * 15;
        return { col, anchor: col.dataset.anchor, start: Math.max(0, Math.min(1380, minutes)) };
      };

      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          closeAllPopovers();
          ghost = h('div', { class: 'drag-ghost' }, task.title);
          document.body.append(ghost);
          document.body.classList.add('dragging');
          li.classList.add('drag-source');
        }
        ghost.style.left = `${ev.clientX + 12}px`;
        ghost.style.top = `${ev.clientY + 8}px`;
        const sc = scroller();
        if (sc) {
          const r = sc.getBoundingClientRect();
          if (ev.clientY > r.bottom - 56) sc.scrollTop += 14;
          else if (ev.clientY < r.top + 150 && sc.scrollTop > 0) sc.scrollTop -= 14;
          if (ev.clientX > r.right - 40) sc.scrollLeft += 14;
          else if (ev.clientX < r.left + 60) sc.scrollLeft -= 14;
        }
        drop = locate(ev.clientX, ev.clientY);
        clearSlot();
        if (drop) {
          slot = h('div', { class: 'drop-slot', style: { top: `${(drop.start / 60) * HOUR_H}px`, height: `${HOUR_H - 2}px` } }, D.timeRange(drop.start, 60));
          drop.col.append(slot);
        }
      };

      const finish = (ev) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        const dragged = !!ghost;
        if (ghost) ghost.remove();
        clearSlot();
        document.body.classList.remove('dragging');
        li.classList.remove('drag-source');
        if (!dragged) return;
        // Le relâchement ne doit pas compter comme un clic sur le titre.
        window.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
        if (ev.type === 'pointercancel' || !drop) return;
        const { anchor, start } = drop;
        store.mutate((st) => {
          M.reschedule(st, task.id, { horizon: 'day', date: anchor });
          M.updateTask(st, task.id, { time: { start, dur: 60 } });
        }, { undoable: true });
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });
  }

  // --- colonne --------------------------------------------------------------
  function column(col, { showNav = false } = {}) {
    store.maintain((s) => M.ensureForPeriod(s, col.horizon, col.anchor));
    const tasks = M.columnTasks(state(), col.horizon, col.anchor);
    const [title, sub] = columnTitles(col);
    const current = D.contains(col.horizon, col.anchor, app.today());
    const key = colKey(col);

    const input = h('input', {
      type: 'text', class: 'add-input', placeholder: 'Ajouter…', maxlength: '200',
      'aria-label': `Ajouter une tâche, ${title}`, dataset: { focusKey: `add:${key}` },
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        const text = e.currentTarget.value.trim();
        if (!text) return;
        e.currentTarget.value = '';
        store.mutate((st) => M.addTask(st, { title: text, horizon: col.horizon, date: col.anchor }), { undoable: true });
      },
    });

    return h('section', { class: `col${current ? ' current' : ''}`, dataset: { key } },
      h('header', { class: 'col-head' },
        h('div', { class: 'col-titles' }, h('h2', { class: 'col-title' }, title), h('span', { class: 'col-sub' }, sub)),
        showNav ? h('div', { class: 'col-nav' },
          h('button', { type: 'button', 'aria-label': 'Période précédente', onclick: () => app.setFocus(M.moveFocus(ui.focus, col.horizon, -1)) }, icon('chevL', 16)),
          h('button', { type: 'button', 'aria-label': 'Période suivante', onclick: () => app.setFocus(M.moveFocus(ui.focus, col.horizon, 1)) }, icon('chevR', 16))) : null),
      h('div', { class: 'col-body', dataset: { scrollKey: key } },
        h('ul', { class: 'tasks' }, tasks.map((t) => taskRow(t))),
        h('div', { class: 'add-row' }, icon('plus', 15), input)));
  }

  // --- vue Heures -----------------------------------------------------------
  function hourColumn(col) {
    const today = app.today();
    const tasks = M.columnTasks(state(), 'day', col.anchor);
    const timed = Object.values(state().tasks).filter((t) => t.horizon === 'day' && t.anchor === col.anchor && t.time);
    const layout = Object.fromEntries(M.layoutBlocks(timed.map((t) => ({ id: t.id, start: t.time.start, dur: t.time.dur }))).map((b) => [b.id, b]));

    const body = h('div', { class: 'hours-col', dataset: { anchor: col.anchor }, style: { height: `${24 * HOUR_H}px` } });
    for (let hour = 0; hour < 24; hour++) body.append(h('div', { class: 'hour-line', style: { top: `${hour * HOUR_H}px` } }));
    for (const t of timed) {
      const pos = layout[t.id];
      const top = (t.time.start / 60) * HOUR_H;
      const height = Math.max(MIN_BLOCK, (Math.min(t.time.dur, 1440 - t.time.start) / 60) * HOUR_H - 2);
      const block = h('button', {
        type: 'button', class: `block${t.done ? ' done' : ''}`, title: t.title,
        style: { top: `${top}px`, height: `${height}px`, left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`, width: `calc(${100 / pos.cols}% - 4px)` },
        onclick: () => app.openDetail(t.id),
      }, h('span', { class: 'block-title' }, t.title), height >= 40 ? h('span', { class: 'block-time' }, D.timeRange(t.time.start, t.time.dur)) : null);
      const label = M.labelOf(state(), t);
      if (label) block.style.setProperty('--blk', label.color);
      body.append(block);
    }
    if (col.anchor === today) {
      const now = new Date();
      body.append(h('div', { class: 'now-line', style: { top: `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H}px` } }));
    }
    enableCreate(body, col.anchor);
    return { body, untimed: tasks.filter((t) => !t.time) };
  }

  // --- créer une tâche en glissant sur la grille (comme Google Agenda) ---------
  // Appuyer sur une heure puis étirer : un bloc suit le pointeur par pas de
  // 15 minutes, et au relâchement on saisit le titre. Un simple clic crée un
  // bloc d'une heure. Au doigt, un appui long déclenche la sélection (sinon on
  // fait défiler la grille).
  const SNAP = 15;
  function enableCreate(body, date) {
    const yIn = (clientY) => clientY - body.getBoundingClientRect().top;
    const down = (y) => Math.max(0, Math.min(1440 - SNAP, Math.floor(y / HOUR_H * 60 / SNAP) * SNAP));
    const near = (y) => Math.max(0, Math.min(1440, Math.round(y / HOUR_H * 60 / SNAP) * SNAP));

    body.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target !== body && !e.target.classList.contains('hour-line')) return;
      const touch = e.pointerType === 'touch';
      const sx = e.clientX;
      const sy = e.clientY;
      const pressMin = down(yIn(sy));
      const scroller = body.closest('.hours-scroll');
      let armed = !touch;
      let dragging = false;
      let timer = null;
      let ticker = null;
      let last = { x: sx, y: sy };
      let preview = null;
      let range = { start: pressMin, dur: 60 };

      const compute = () => {
        const cur = near(yIn(last.y));
        const start = cur >= pressMin ? pressMin : cur;
        const end = cur >= pressMin ? Math.max(cur, pressMin + SNAP) : pressMin + SNAP;
        range = { start, dur: Math.min(1440, end) - start };
      };
      const draw = () => {
        if (!preview) {
          preview = h('div', { class: 'create-block' }, h('span', { class: 'block-title' }, '(Sans titre)'), h('span', { class: 'block-time' }));
          body.append(preview);
        }
        preview.style.top = `${(range.start / 60) * HOUR_H}px`;
        preview.style.height = `${Math.max(MIN_BLOCK, (range.dur / 60) * HOUR_H - 2)}px`;
        preview.lastChild.textContent = `${D.timeRange(range.start, range.dur)}`;
      };
      const stopTick = () => { clearInterval(ticker); ticker = null; };
      const scrollEdges = () => {
        if (!scroller) return;
        const r = scroller.getBoundingClientRect();
        if (last.y > r.bottom - 56) scroller.scrollTop += 12;
        else if (last.y < r.top + 150 && scroller.scrollTop > 0) scroller.scrollTop -= 12;
      };
      const begin = () => {
        dragging = true;
        closeAllPopovers();
        document.body.classList.add('creating');
        compute();
        draw();
        ticker = setInterval(() => {
          if (!body.isConnected) { cleanup(); return; }
          scrollEdges();
          compute();
          draw();
        }, 40);
      };
      const blockTouchScroll = (ev) => { if (armed && ev.cancelable) ev.preventDefault(); };
      const cleanup = () => {
        clearTimeout(timer);
        stopTick();
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('touchmove', blockTouchScroll);
        document.body.classList.remove('creating');
      };
      const move = (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        const dist = Math.hypot(last.x - sx, last.y - sy);
        if (!armed) { if (dist > 8) cleanup(); return; } // le doigt défile la grille
        if (!dragging && dist > 4) begin();
      };
      const cancel = () => { cleanup(); if (preview) preview.remove(); };
      const up = (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        const wasDragging = dragging;
        cleanup();
        if (wasDragging) compute();
        else range = { start: Math.min(pressMin, 1440 - 60), dur: 60 };
        if (!body.isConnected) return;
        draw();
        openCreatePopover(preview, date, range);
      };

      if (touch) {
        timer = setTimeout(() => {
          armed = true;
          if (navigator.vibrate) navigator.vibrate(8);
          begin();
        }, 380);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      document.addEventListener('touchmove', blockTouchScroll, { passive: false });
    });
  }

  // Titre + liste, puis création. `preview` est le bloc fantôme dans la grille.
  function openCreatePopover(preview, date, range) {
    let labelId = null;
    const title = h('input', { type: 'text', class: 'field-input', placeholder: 'Titre de la tâche', maxlength: '200', 'aria-label': 'Titre' });
    const labelBtn = h('button', { type: 'button', class: 'field-btn' });
    const paint = () => {
      const label = (state().labels || []).find((l) => l.id === labelId) || null;
      labelBtn.replaceChildren(app.labels.dot(label, 11), h('span', { class: 'grow' }, label ? label.name : 'Aucune liste'), icon('chevD', 14));
      if (label) preview.style.setProperty('--blk', label.color); else preview.style.removeProperty('--blk');
    };
    labelBtn.addEventListener('click', () => app.labels.openPicker(labelBtn, labelId, (id) => { labelId = id; paint(); }, { side: 'start', key: 'create-label' }));
    paint();
    const save = () => {
      const text = title.value.trim() || 'Sans titre';
      store.mutate((st) => M.addTask(st, { title: text, horizon: 'day', date, time: range, labelId }), { undoable: true });
      closeAllPopovers();
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const body = h('div', { class: 'form-pop' },
      title,
      h('p', { class: 'form-hint strong' }, `${D.dayDateLabel(date)}, ${D.timeRange(range.start, range.dur)}`),
      labelBtn,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-accent', onclick: save }, 'Enregistrer')));
    const pop = openPopover(preview, body, { side: 'right', className: 'form-pop-wrap', key: 'create', onClose: () => preview.remove() });
    if (pop) title.focus(); else preview.remove();
  }

  function hoursView(cols) {
    cols.forEach((col) => store.maintain((s) => M.ensureForPeriod(s, 'day', col.anchor)));
    const built = cols.map((col) => ({ col, ...hourColumn(col) }));
    const gutter = h('div', { class: 'hours-gutter', style: { height: `${24 * HOUR_H}px` } },
      Array.from({ length: 24 }, (_, hour) => h('span', { style: { top: `${hour * HOUR_H}px` } }, hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`)));

    const heads = built.map(({ col }) => {
      const [title, sub] = columnTitles(col);
      return h('header', { class: `hours-head${D.contains('day', col.anchor, app.today()) ? ' current' : ''}` },
        h('h2', { class: 'col-title' }, title), h('span', { class: 'col-sub' }, sub));
    });
    const untimed = built.map(({ col, untimed: list }) => {
      const input = h('input', {
        type: 'text', class: 'add-input', placeholder: 'Ajouter…', maxlength: '200', dataset: { focusKey: `add:day:${col.anchor}` },
        onkeydown: (e) => {
          if (e.key !== 'Enter' || !e.currentTarget.value.trim()) return;
          const text = e.currentTarget.value.trim();
          e.currentTarget.value = '';
          store.mutate((st) => M.addTask(st, { title: text, horizon: 'day', date: col.anchor }), { undoable: true });
        },
      });
      return h('div', { class: 'hours-untimed' },
        list.length ? h('ul', { class: 'tasks compact' }, list.map((t) => taskRow(t, { drag: true }))) : null,
        h('div', { class: 'add-row' }, icon('plus', 15), input));
    });

    return h('div', { class: 'hours-scroll', dataset: { scrollKey: 'hours' } },
      h('div', { class: 'hours-grid' },
        h('div', { class: 'hours-corner' }), heads,
        h('div', { class: 'hours-corner untimed-label' }, h('span', null, 'Sans heure')), untimed,
        gutter, built.map((b) => b.body)));
  }

  // --- vue entière ----------------------------------------------------------
  function render(view) {
    const cols = M.viewColumns(view, ui.focus);
    const meta = VIEW_META[view];
    const content = view === 'heures'
      ? hoursView(cols)
      : h('div', { class: `cols cols-${cols.length}`, dataset: { scrollKey: 'cols' } }, cols.map((c) => column(c, { showNav: view === 'horizons' })));

    const step = meta.step;
    const pill = h('div', { class: 'nav-pill', role: 'group', 'aria-label': 'Navigation' },
      h('button', { type: 'button', 'aria-label': 'Précédent', onclick: () => app.setFocus(M.moveFocus(ui.focus, step, -1)) }, icon('chevL', 18)),
      h('button', { type: 'button', class: 'today-btn', onclick: () => app.setFocus(app.today()) }, 'Aujourd’hui'),
      h('button', { type: 'button', 'aria-label': 'Suivant', onclick: () => app.setFocus(M.moveFocus(ui.focus, step, 1)) }, icon('chevR', 18)));

    return [content, pill];
  }

  return { render };
}
