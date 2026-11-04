// Vues du planificateur : Horizons, Heures, Jours, Semaines, Mois, Années.
import { h, icon, openPopover, closeAllPopovers, pointAnchor } from './ui.js';
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

  // --- ligne de tâche -------------------------------------------------------
  function taskRow(task, { nested = false, drag = false } = {}) {
    const s = state();
    const children = M.childrenOf(s, task.id);
    const parent = nested ? null : M.parentOf(s, task.id);
    const open = ui.expanded.has(task.id);

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
        h('button', { type: 'button', class: 'task-title', onclick: () => app.openDetail(task.id) }, task.title),
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
      body.append(block);
    }
    if (col.anchor === today) {
      const now = new Date();
      body.append(h('div', { class: 'now-line', style: { top: `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H}px` } }));
    }
    body.addEventListener('click', (e) => {
      if (e.target !== body && !e.target.classList.contains('hour-line')) return;
      const y = e.clientY - body.getBoundingClientRect().top;
      const start = Math.min(1425, Math.floor((y / HOUR_H) * 4) * 15);
      quickAdd(pointAnchor(e.clientX, e.clientY), col.anchor, start);
    });
    return { body, untimed: tasks.filter((t) => !t.time) };
  }

  function quickAdd(anchor, date, start) {
    const input = h('input', { type: 'text', class: 'field-input', placeholder: `Nouvelle tâche à ${D.fmtMinutes(start)}`, maxlength: '200' });
    const save = () => {
      const title = input.value.trim();
      if (!title) return;
      store.mutate((st) => M.addTask(st, { title, horizon: 'day', date, time: { start, dur: 60 } }), { undoable: true });
      closeAllPopovers();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const pop = openPopover(anchor, h('div', { class: 'form-pop' }, input), { className: 'form-pop-wrap' });
    if (pop) input.focus();
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
