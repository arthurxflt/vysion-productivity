// Panneau de détail d'une tâche (s'ouvre au clic sur son titre).
import { h, icon, toast } from './ui.js';
import * as D from './dates.js';
import * as M from './model.js';
import { setImportanceLabel } from './colors.js';
import { periodLabel } from './taskmenu.js';

export function createDetail(app, root) {
  const { store, ui } = app;

  function close() {
    ui.detailId = null;
    root.hidden = true;
    root.replaceChildren();
    document.body.classList.remove('detail-open');
  }

  function row(iconName, label, value, onclick) {
    return h('button', { type: 'button', class: 'detail-row', onclick: (e) => onclick(e.currentTarget) },
      icon(iconName, 16), h('span', { class: 'detail-row-label' }, label), h('span', { class: 'detail-row-value' }, value));
  }

  function render(force = false) {
    const id = ui.detailId;
    const task = id && store.getState().tasks[id];
    if (!task) { if (id) close(); return; }
    // Ne pas écraser une saisie en cours dans ce panneau.
    const active = document.activeElement;
    if (!force && !root.hidden && root.dataset.id === id && root.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) return;

    const s = store.getState();
    const today = app.today();
    const parent = M.parentOf(s, id);
    const children = M.childrenOf(s, id);
    const series = task.seriesId ? s.series[task.seriesId] : null;
    const apply = (fn) => store.mutate(fn, { undoable: true });

    const title = h('input', {
      type: 'text', class: 'detail-title', value: task.title, maxlength: '200', 'aria-label': 'Titre',
      onchange: (e) => { const v = e.currentTarget.value.trim(); if (v) apply((st) => M.updateTask(st, id, { title: v })); else e.currentTarget.value = task.title; },
    });
    const check = h('button', {
      type: 'button', class: 'check', role: 'checkbox', 'aria-checked': String(task.done),
      onclick: () => apply((st) => M.toggleDone(st, id)),
    }, icon('check', 13));

    const num = h('span', { class: 'detail-weight-num' });
    setImportanceLabel(num, task.weight);
    const slider = h('input', {
      type: 'range', min: '1', max: '10', step: '1', value: String(task.weight), 'aria-label': 'Importance', class: 'detail-range',
      oninput: (e) => setImportanceLabel(num, Number(e.currentTarget.value)),
      onchange: (e) => apply((st) => M.updateTask(st, id, { weight: Number(e.currentTarget.value) })),
    });

    const note = h('textarea', {
      class: 'detail-note', rows: '4', placeholder: 'Ajouter une note…', 'aria-label': 'Note',
      onchange: (e) => apply((st) => M.updateTask(st, id, { note: e.currentTarget.value })),
    });
    note.value = task.note || '';

    const addSub = h('input', {
      type: 'text', class: 'add-input', placeholder: 'Ajouter un sous-objectif…', maxlength: '200', dataset: { focusKey: `detail-sub:${id}` },
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        const v = e.currentTarget.value.trim();
        if (!v) return;
        e.currentTarget.value = '';
        ui.expanded.add(id);
        apply((st) => M.addSubgoal(st, id, v, today));
      },
    });

    const subList = children.map((c) => h('li', { class: `detail-sub${c.done ? ' done' : ''}` },
      h('button', { type: 'button', class: 'check', role: 'checkbox', 'aria-checked': String(c.done), onclick: () => apply((st) => M.toggleDone(st, c.id)) }, icon('check', 13)),
      h('button', { type: 'button', class: 'task-title', onclick: () => app.openDetail(c.id) }, c.title),
      h('span', { class: 'task-sub' }, periodLabel(c.horizon, c.anchor, today))));

    root.dataset.id = id;
    root.hidden = false;
    document.body.classList.add('detail-open');
    root.replaceChildren(
      h('header', { class: 'detail-head' },
        h('span', { class: 'detail-kind' }, { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' }[task.horizon]),
        h('button', { type: 'button', class: 'icon-plain', 'aria-label': 'Fermer', onclick: close }, icon('x', 18))),
      h('div', { class: 'detail-body' },
        h('div', { class: 'detail-titlerow' }, check, title),
        parent ? h('button', { type: 'button', class: 'detail-parent', onclick: () => app.openDetail(parent.id) }, icon('up', 14), parent.title) : null,
        row('cal', 'Période', periodLabel(task.horizon, task.anchor, today), (el) => app.taskMenu.openCalendar(el, id, { side: 'end' })),
        task.horizon === 'day' ? row('clock', 'Heure', task.time ? D.timeRange(task.time.start, task.time.dur) : 'Aucune', (el) => app.taskMenu.openTimeEditor(el, id, { side: 'end' })) : null,
        row('repeat', 'Répéter', series ? M.ruleLabel(series.rule) : 'Ne se répète pas', (el) => app.taskMenu.openRepeat(el, id, { side: 'end' })),
        row('up', 'Objectif parent', parent ? parent.title : 'Aucun', (el) => app.taskMenu.openParentPicker(el, id, { side: 'end' })),
        h('div', { class: 'detail-importance' }, icon('bars', 16), h('span', { class: 'detail-row-label' }, 'Importance'), slider, num),
        note,
        h('h3', { class: 'detail-h' }, 'Sous-objectifs'),
        h('ul', { class: 'detail-subs' }, subList),
        h('div', { class: 'add-row' }, icon('plus', 15), addSub),
        h('button', { type: 'button', class: 'detail-delete', onclick: () => app.taskMenu.removeTask(id) }, icon('trash', 16), 'Supprimer la tâche')));
  }

  return { render, close };
}
