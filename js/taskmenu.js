// Menu "..." d'une tâche et tous ses sous-menus. Les mêmes sélecteurs servent
// aussi au panneau de détail.
import { h, icon, openPopover, closeAllPopovers, toast } from './ui.js';
import * as D from './dates.js';
import * as M from './model.js';
import { importanceTextColor, importanceTextWeight } from './colors.js';

const HORIZON_NAMES = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' };

export function periodLabel(horizon, anchor, today) {
  if (horizon === 'day') return `${D.dayTitle(anchor, today)}, ${D.dayDateLabel(anchor)}`;
  if (horizon === 'week') return `${D.weekRange(anchor)} (${D.weekTitle(anchor)})`;
  if (horizon === 'month') return `${D.monthTitle(anchor)} ${anchor.slice(0, 4)}`;
  return anchor.slice(0, 4);
}

export function createTaskMenu(app) {
  const { store } = app;
  const get = (id) => store.getState().tasks[id];
  const apply = (fn) => store.mutate(fn, { undoable: true });

  // --- importance -----------------------------------------------------------
  function openImportance(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    const cells = [];
    for (let n = 1; n <= 10; n++) {
      const btn = h('button', {
        type: 'button',
        class: `imp-cell${n === t.weight ? ' selected' : ''}`,
        onclick: () => { apply((s) => M.updateTask(s, id, { weight: n })); closeAllPopovers(); },
      }, String(n));
      btn.style.color = importanceTextColor(n);
      btn.style.fontWeight = importanceTextWeight(n);
      cells.push(btn);
    }
    openPopover(anchor, h('div', { class: 'imp-grid' }, cells), { side, className: 'imp-pop', key: `imp:${id}` });
  }

  // --- calendrier -----------------------------------------------------------
  function openCalendar(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    const today = app.today();
    let cursor = D.periodStart('month', D.contains(t.horizon, t.anchor, today) ? today : t.anchor);
    const wrap = h('div', { class: 'cal' });
    const pop = openPopover(anchor, wrap, { side, className: 'cal-pop', key: `cal:${id}` });
    if (!pop) return;

    const pick = (horizon, date) => {
      apply((s) => M.reschedule(s, id, { horizon, date }));
      closeAllPopovers();
      const moved = get(id);
      if (moved) toast(`Replanifiée : ${periodLabel(moved.horizon, moved.anchor, today)}`);
    };

    const draw = () => {
      const monthEnd = D.periodEnd('month', cursor);
      const rows = [];
      for (let ws = D.startOfWeek(cursor); ws <= monthEnd; ws = D.addDays(ws, 7)) {
        const { week } = D.isoWeek(ws);
        const cells = [h('button', {
          type: 'button',
          class: `cal-week${t.horizon === 'week' && t.anchor === ws ? ' selected' : ''}`,
          title: `Semaine ${week}`,
          onclick: () => pick('week', ws),
        }, String(week))];
        for (let i = 0; i < 7; i++) {
          const day = D.addDays(ws, i);
          const classes = ['cal-day'];
          if (day.slice(0, 7) !== cursor.slice(0, 7)) classes.push('muted');
          if (day === today) classes.push('today');
          if (t.horizon === 'day' && t.anchor === day) classes.push('selected');
          cells.push(h('button', { type: 'button', class: classes.join(' '), onclick: () => pick('day', day) }, String(Number(day.slice(8)))));
        }
        rows.push(h('div', { class: 'cal-row' }, cells));
      }
      const dow = h('div', { class: 'cal-row cal-dow' }, h('span', null, ''), ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', null, d)));
      wrap.replaceChildren(
        h('div', { class: 'cal-head' },
          h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Mois précédent', onclick: () => { cursor = D.addMonths(cursor, -1); draw(); } }, icon('chevL', 16)),
          h('button', { type: 'button', class: 'cal-title', title: 'Choisir ce mois', onclick: () => pick('month', cursor) }, D.monthTitle(cursor)),
          h('button', { type: 'button', class: 'cal-title', title: 'Choisir cette année', onclick: () => pick('year', cursor) }, cursor.slice(0, 4)),
          h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Mois suivant', onclick: () => { cursor = D.addMonths(cursor, 1); draw(); } }, icon('chevR', 16))),
        h('div', { class: 'cal-quick' },
          h('button', { type: 'button', onclick: () => pick('day', today) }, 'Aujourd’hui'),
          h('button', { type: 'button', onclick: () => pick('day', D.addDays(today, 1)) }, 'Demain'),
          h('button', { type: 'button', onclick: () => pick('week', today) }, 'Cette semaine')),
        dow,
        ...rows);
    };
    draw();
  }

  // --- heure ----------------------------------------------------------------
  // La durée est libre : heures + minutes (2 h 48 est possible), plus quelques
  // raccourcis pour les durées courantes.
  const durLabel = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

  function openTimeEditor(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t || t.horizon !== 'day') return;
    const now = new Date();
    const defaultStart = t.anchor === app.today() ? Math.min(23 * 60, (now.getHours() + 1) * 60) : 9 * 60;
    const cur = t.time || { start: defaultStart, dur: 60 };
    const start = h('input', { type: 'time', class: 'field-input', value: D.fmtMinutes(cur.start), step: '60' });
    const hh = h('input', { type: 'number', min: '0', max: '24', step: '1', inputmode: 'numeric', class: 'field-input narrow', value: String(Math.floor(cur.dur / 60)), 'aria-label': 'Durée en heures' });
    const mm = h('input', { type: 'number', min: '0', max: '59', step: '1', inputmode: 'numeric', class: 'field-input narrow', value: String(cur.dur % 60), 'aria-label': 'Durée en minutes' });
    const hint = h('p', { class: 'form-hint' });
    const readDur = () => Math.max(0, Math.floor(Number(hh.value) || 0)) * 60 + Math.max(0, Math.floor(Number(mm.value) || 0));
    const refresh = () => {
      const s = D.parseTime(start.value);
      const d = readDur();
      if (s === null) hint.textContent = 'Heure de début invalide';
      else if (d < 1) hint.textContent = 'La durée doit faire au moins 1 minute';
      else hint.textContent = `${durLabel(Math.min(d, 1440 - s))}, de ${D.fmtMinutes(s)} à ${s + d >= 1440 ? '24:00' : D.fmtMinutes(s + d)}`;
    };
    for (const el of [start, hh, mm]) el.addEventListener('input', refresh);
    refresh();
    const chips = h('div', { class: 'chips' }, [30, 60, 90, 120, 180].map((m) => h('button', {
      type: 'button', class: 'chip', onclick: () => { hh.value = String(Math.floor(m / 60)); mm.value = String(m % 60); refresh(); },
    }, durLabel(m))));
    const save = () => {
      const s = D.parseTime(start.value);
      if (s === null) { start.focus(); return; }
      const d = readDur();
      if (d < 1) { mm.focus(); return; }
      apply((st) => M.updateTask(st, id, { time: { start: s, dur: d } }));
      closeAllPopovers();
    };
    const body = h('div', { class: 'form-pop' },
      h('label', null, h('span', null, 'Début'), start),
      h('div', { class: 'field-group' },
        h('span', null, 'Durée'),
        h('div', { class: 'inline-row dur-row' }, hh, h('span', null, 'h'), mm, h('span', null, 'min')),
        chips,
        hint),
      h('div', { class: 'form-actions' },
        t.time ? h('button', { type: 'button', class: 'btn-quiet', onclick: () => { apply((st) => M.updateTask(st, id, { time: null })); closeAllPopovers(); } }, 'Retirer l’heure') : null,
        h('button', { type: 'button', class: 'btn-accent', onclick: save }, 'Enregistrer')));
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const pop = openPopover(anchor, body, { side, className: 'form-pop-wrap', key: `time:${id}` });
    if (pop) start.focus();
  }

  // --- liste de couleur -----------------------------------------------------
  function openLabel(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    app.labels.openPicker(anchor, t.labelId, (labelId) => {
      apply((s) => M.updateTask(s, id, { labelId }));
      closeAllPopovers();
    }, { side, key: `label-pick:${id}` });
  }

  // --- répétition -----------------------------------------------------------
  function seriesOf(t) {
    return t.seriesId ? store.getState().series[t.seriesId] : null;
  }

  function openCustomRepeat(anchor, id) {
    const t = get(id);
    if (!t) return;
    const existing = seriesOf(t);
    const rule = existing ? existing.rule : { unit: t.horizon === 'day' ? 'week' : t.horizon, every: 1 };
    const unitsAll = [['day', 'jours'], ['week', 'semaines'], ['month', 'mois'], ['year', 'ans']];
    const floor = { day: 0, week: 1, month: 2, year: 3 }[t.horizon];
    const units = unitsAll.filter((u, i) => i >= floor);
    const every = h('input', { type: 'number', min: '1', max: '99', value: String(rule.every || 1), class: 'field-input narrow' });
    const unit = h('select', { class: 'field-input' }, units.map(([v, l]) => h('option', { value: v, selected: v === rule.unit }, l)));
    const picked = new Set(rule.weekdays && rule.weekdays.length ? rule.weekdays : [D.weekdayIndex(t.anchor)]);
    const dayBox = h('div', { class: 'weekday-row' });
    const drawDays = () => {
      dayBox.hidden = !(t.horizon === 'day' && unit.value === 'week');
      dayBox.replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => h('button', {
        type: 'button',
        class: `wd${picked.has(d) ? ' on' : ''}`,
        onclick: () => { if (picked.has(d)) { if (picked.size > 1) picked.delete(d); } else picked.add(d); drawDays(); },
      }, D.WEEKDAYS_SHORT[d].slice(0, 3))));
    };
    unit.addEventListener('change', drawDays);
    drawDays();
    const apply2 = () => {
      const rule2 = { unit: unit.value, every: Math.max(1, Math.round(Number(every.value) || 1)) };
      if (t.horizon === 'day' && unit.value === 'week') rule2.weekdays = [...picked].sort((a, b) => a - b);
      apply((s) => M.setRepeat(s, id, rule2));
      closeAllPopovers();
      toast(`Répétition : ${M.ruleLabel(rule2)}`);
    };
    const body = h('div', { class: 'form-pop' },
      h('div', { class: 'inline-row' }, h('span', null, 'Répéter tous les'), every, unit),
      dayBox,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-accent', onclick: apply2 }, 'Enregistrer')));
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply2(); } });
    openPopover(anchor, body, { side: 'right', className: 'form-pop-wrap', key: `repeat-custom:${id}` });
  }

  function openRepeat(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    const series = seriesOf(t);
    const current = series ? M.ruleKey(series.rule) : null;
    const choose = (key) => {
      apply((s) => M.setRepeat(s, id, M.PRESETS[key]));
      closeAllPopovers();
      toast(`Répétition : ${M.ruleLabel(M.PRESETS[key])}`);
    };
    const items = M.allowedPresets(t.horizon).map((key) => menuItem(null, M.ruleLabel(M.PRESETS[key]), { checked: current === key, onclick: () => choose(key) }));
    const btn = menuItem(null, 'Personnalisé…', { checked: current === 'custom', onclick: (e) => openCustomRepeat(e.currentTarget, id) });
    const stop = series ? menuItem(null, 'Ne pas répéter', { onclick: () => { apply((s) => M.setRepeat(s, id, null)); closeAllPopovers(); toast('Répétition arrêtée'); } }) : null;
    openPopover(anchor, h('div', { class: 'menu' }, items, btn, stop ? h('div', { class: 'menu-sep' }) : null, stop), { side, className: 'menu-pop', key: `repeat:${id}` });
  }

  // --- parent ---------------------------------------------------------------
  function openParentPicker(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    const state = store.getState();
    const today = app.today();
    const candidates = M.parentCandidates(state, t);
    const choose = (parentId) => {
      apply((s) => M.setParent(s, id, parentId));
      closeAllPopovers();
      toast(parentId ? 'Sous-objectif lié' : 'Devenu objectif principal');
    };
    const rows = candidates.map((p) => h('button', {
      type: 'button', class: `menu-item pick${t.parentId === p.id ? ' checked' : ''}`, onclick: () => choose(p.id),
    }, h('span', { class: 'pick-title' }, p.title), h('span', { class: 'menu-right' }, `${HORIZON_NAMES[p.horizon]} · ${periodLabel(p.horizon, p.anchor, today)}`)));
    const empty = candidates.length ? null : h('p', { class: 'hint' }, t.horizon === 'year' ? 'Une tâche annuelle n’a pas de parent.' : 'Aucun objectif de plus grand horizon ne couvre cette période.');
    openPopover(anchor, h('div', { class: 'menu wide' }, rows, empty), { side, className: 'menu-pop', key: `parent:${id}` });
  }

  // --- sous-objectif --------------------------------------------------------
  function openSubgoalAdd(anchor, id, { side = 'right' } = {}) {
    const t = get(id);
    if (!t) return;
    const input = h('input', { type: 'text', class: 'field-input', placeholder: 'Nom du sous-objectif', maxlength: '200' });
    const save = () => {
      const title = input.value.trim();
      if (!title) return;
      apply((s) => M.addSubgoal(s, id, title, app.today()));
      app.ui.expanded.add(id);
      closeAllPopovers();
      app.render();
      toast('Sous-objectif ajouté');
    };
    const body = h('div', { class: 'form-pop' }, input,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-accent', onclick: save }, 'Ajouter')));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const pop = openPopover(anchor, body, { side, className: 'form-pop-wrap', key: `sub:${id}` });
    if (pop) input.focus();
  }

  // --- suppression ----------------------------------------------------------
  function removeTask(id) {
    const t = get(id);
    if (!t) return;
    const title = t.title;
    apply((s) => M.deleteTask(s, id));
    closeAllPopovers();
    app.closeDetail(id);
    toast(`« ${title} » supprimée`, { actionLabel: 'Annuler', onAction: () => store.undo() });
  }

  // --- menu principal -------------------------------------------------------
  function menuItem(iconName, label, { right = null, onclick, danger = false, checked = false } = {}) {
    const btn = h('button', { type: 'button', class: `menu-item${danger ? ' danger' : ''}${checked ? ' checked' : ''}`, onclick },
      typeof iconName === 'string' ? icon(iconName, 16) : (iconName || h('span', { class: 'menu-ico-gap' })),
      h('span', { class: 'menu-label' }, label),
      right ? (right.nodeType ? right : h('span', { class: 'menu-right' }, right)) : null,
      checked ? icon('check', 15) : null);
    return btn;
  }

  function labelRight(t) {
    const label = M.labelOf(store.getState(), t);
    return label ? h('span', { class: 'menu-right with-dot' }, app.labels.dot(label, 10), label.name) : null;
  }

  function open(anchor, id) {
    const t = get(id);
    if (!t) return;
    const series = seriesOf(t);
    const weightTag = h('span', { class: 'menu-right' }, String(t.weight));
    weightTag.style.color = importanceTextColor(t.weight);
    const items = [
      menuItem('bars', 'Importance', { right: weightTag, onclick: (e) => openImportance(e.currentTarget, id) }),
      menuItem('cal', 'Replanifier', { onclick: (e) => openCalendar(e.currentTarget, id) }),
      t.horizon === 'day' ? menuItem('clock', 'Heure', { right: t.time ? D.timeRange(t.time.start, t.time.dur) : null, onclick: (e) => openTimeEditor(e.currentTarget, id) }) : null,
      menuItem('tag', 'Liste', { right: labelRight(t), onclick: (e) => openLabel(e.currentTarget, id) }),
      menuItem('repeat', 'Répéter', { right: series ? M.ruleLabel(series.rule) : null, onclick: (e) => openRepeat(e.currentTarget, id) }),
      menuItem('sub', 'Ajouter un sous-objectif', { onclick: (e) => openSubgoalAdd(e.currentTarget, id) }),
      menuItem('up', 'En faire un sous-objectif de…', { onclick: (e) => openParentPicker(e.currentTarget, id) }),
      t.parentId ? menuItem('up', 'En faire un objectif principal', { onclick: () => { apply((s) => M.setParent(s, id, null)); closeAllPopovers(); toast('Devenu objectif principal'); } }) : null,
      h('div', { class: 'menu-sep' }),
      menuItem('trash', 'Supprimer', { danger: true, onclick: () => removeTask(id) }),
    ];
    openPopover(anchor, h('div', { class: 'menu' }, items), { side: 'end', className: 'menu-pop', key: `menu:${id}` });
  }

  return { open, openImportance, openCalendar, openTimeEditor, openLabel, openRepeat, openParentPicker, openSubgoalAdd, removeTask };
}
