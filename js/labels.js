// Listes de couleur : une puce de couleur + un nom que l'utilisateur crée lui-même
// (par exemple Deep Work en bleu, Sport en rouge). Une tâche appartient à une
// liste au plus. Ce module fournit la puce, le sélecteur et l'éditeur.
import { h, icon, openPopover, closeAllPopovers, toast } from './ui.js';
import * as M from './model.js';

export function createLabels(app) {
  const { store } = app;
  const all = () => store.getState().labels || [];
  const apply = (fn) => store.mutate(fn, { undoable: true });

  function dot(label, size = 9) {
    const el = h('span', { class: 'label-dot', 'aria-hidden': 'true' });
    el.style.width = el.style.height = `${size}px`;
    if (label) el.style.background = label.color;
    else el.classList.add('empty');
    return el;
  }

  // Grille de couleurs ; `onPick(couleur)` est appelée au clic.
  function swatches(selected, onPick) {
    const box = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur' });
    const draw = (current) => box.replaceChildren(...M.LABEL_COLORS.map((c) => {
      const b = h('button', {
        type: 'button', class: `swatch${c === current ? ' selected' : ''}`, role: 'radio', 'aria-checked': String(c === current),
        'aria-label': c, onclick: () => { onPick(c); draw(c); },
      });
      b.style.background = c;
      return b;
    }));
    draw(selected);
    return box;
  }

  const nextColor = () => {
    const used = new Set(all().map((l) => l.color));
    return M.LABEL_COLORS.find((c) => !used.has(c)) || M.LABEL_COLORS[all().length % M.LABEL_COLORS.length];
  };

  // Formulaire de création (nom + couleur). `onCreated(label)` reçoit la liste créée.
  function createForm(onCreated) {
    let color = nextColor();
    const name = h('input', { type: 'text', class: 'field-input', placeholder: 'Nom de la liste (ex. Deep Work)', maxlength: '40' });
    const save = () => {
      const v = name.value.trim();
      if (!v) { name.focus(); return; }
      let created = null;
      apply((s) => { created = M.addLabel(s, v, color); });
      if (created) onCreated(created);
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const body = h('div', { class: 'form-pop' }, name, swatches(color, (c) => { color = c; }),
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-accent', onclick: save }, 'Créer la liste')));
    return { body, name };
  }

  // Sélecteur : choisir la liste d'une tâche, ou en créer une à la volée.
  // `onPick(id | null)`.
  function openPicker(anchor, currentId, onPick, { side = 'right', key = null } = {}) {
    const item = (label, text, onclick, checked) => h('button', {
      type: 'button', class: `menu-item${checked ? ' checked' : ''}`, onclick,
    }, label ? dot(label, 11) : h('span', { class: 'menu-ico-gap' }), h('span', { class: 'menu-label' }, text), checked ? icon('check', 15) : null);

    let pop = null;
    const choose = (id) => { onPick(id); if (pop) pop.close(); };
    const list = h('div', { class: 'menu' },
      all().map((l) => item(l, l.name, () => choose(l.id), l.id === currentId)),
      all().length ? h('div', { class: 'menu-sep' }) : null,
      currentId ? item(null, 'Aucune liste', () => choose(null), false) : null,
      h('button', {
        type: 'button', class: 'menu-item', onclick: () => {
          const form = createForm((created) => choose(created.id));
          pop.el.replaceChildren(form.body);
          pop.reposition();
          form.name.focus();
        },
      }, icon('plus', 16), h('span', { class: 'menu-label' }, 'Nouvelle liste…')));
    pop = openPopover(anchor, list, { side, className: 'menu-pop', key });
    return pop;
  }

  // Éditeur d'une liste : nom, couleur, suppression.
  function openEditor(anchor, id) {
    const label = all().find((l) => l.id === id);
    if (!label) return;
    const name = h('input', { type: 'text', class: 'field-input', value: label.name, maxlength: '40', 'aria-label': 'Nom de la liste' });
    let saved = label.name;
    const commit = () => {
      const v = name.value.trim();
      if (v && v !== saved) { saved = v; apply((s) => M.updateLabel(s, id, { name: v })); }
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); closeAllPopovers(); } });
    name.addEventListener('blur', commit);
    const body = h('div', { class: 'form-pop' }, name,
      swatches(label.color, (c) => apply((s) => M.updateLabel(s, id, { color: c }))),
      h('div', { class: 'form-actions' },
        h('button', {
          type: 'button', class: 'btn-quiet danger', onclick: () => {
            closeAllPopovers();
            apply((s) => M.deleteLabel(s, id));
            toast(`Liste « ${label.name} » supprimée`, { actionLabel: 'Annuler', onAction: () => store.undo() });
          },
        }, 'Supprimer'),
        h('button', { type: 'button', class: 'btn-accent', onclick: () => { commit(); closeAllPopovers(); } }, 'OK')));
    const pop = openPopover(anchor, body, { side: 'right', className: 'form-pop-wrap', key: `label:${id}` });
    if (pop) { name.focus(); name.select(); }
  }

  return { dot, openPicker, openEditor };
}
