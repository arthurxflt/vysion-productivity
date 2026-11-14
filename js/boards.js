// Tableaux (par défaut "Idées") : des listes d'éléments à cocher.
import { h, icon, openPopover, closeAllPopovers, toast } from './ui.js';
import * as M from './model.js';


// Un champ texte qui s'agrandit avec son contenu : l'idée entière reste lisible.
function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function itemField(text, onCommit, maxlength) {
  const field = h('textarea', {
    rows: '1', class: 'item-text', maxlength: String(maxlength), 'aria-label': 'Élément',
    oninput: (e) => autosize(e.currentTarget),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } },
    onchange: (e) => {
      const v = e.currentTarget.value.trim();
      if (v) onCommit(v); else e.currentTarget.value = text;
    },
  });
  field.value = text;
  requestAnimationFrame(() => autosize(field));
  return field;
}

export function createBoards(app) {
  const { store } = app;
  const apply = (fn, undoable = true) => store.mutate(fn, { undoable });

  function listCard(board, list) {
    const title = h('input', {
      type: 'text', class: 'list-title', value: list.title, maxlength: '80', 'aria-label': 'Nom de la liste',
      dataset: { focusKey: `list-title:${list.id}` },
      onchange: (e) => {
        const v = e.currentTarget.value.trim();
        if (v) apply((s) => M.renameList(s, board.id, list.id, v)); else e.currentTarget.value = list.title;
      },
    });
    const more = h('button', {
      type: 'button', class: 'more', 'aria-label': 'Options de la liste',
      onclick: (e) => openPopover(e.currentTarget, h('div', { class: 'menu' },
        h('button', {
          type: 'button', class: 'menu-item danger',
          onclick: () => {
            const n = list.items.length;
            if (n && !confirm(`Supprimer la liste « ${list.title} » et ses ${n} élément${n > 1 ? 's' : ''} ?`)) return;
            apply((s) => M.deleteList(s, board.id, list.id));
            closeAllPopovers();
            toast('Liste supprimée', { actionLabel: 'Annuler', onAction: () => store.undo() });
          },
        }, icon('trash', 16), h('span', { class: 'menu-label' }, 'Supprimer la liste'))),
      { side: 'end', className: 'menu-pop', key: `list:${list.id}` }),
    }, icon('dots', 18));

    const items = list.items.map((it) => h('li', { class: `task item${it.done ? ' done' : ''}` },
      h('button', {
        type: 'button', class: 'check', role: 'checkbox', 'aria-checked': String(it.done),
        onclick: () => apply((s) => M.toggleItem(s, board.id, list.id, it.id)),
      }, icon('check', 13)),
      itemField(it.text, (v) => apply((s) => M.editItem(s, board.id, list.id, it.id, v)), 300),
      h('button', { type: 'button', class: 'more', 'aria-label': 'Supprimer l’élément', onclick: () => apply((s) => M.deleteItem(s, board.id, list.id, it.id)) }, icon('x', 16))));

    const add = h('textarea', {
      rows: '1', class: 'add-input grow', placeholder: 'Ajouter…', maxlength: '300', dataset: { focusKey: `item:${list.id}` },
      oninput: (e) => autosize(e.currentTarget),
      onkeydown: (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (!v) return;
        e.currentTarget.value = '';
        apply((s) => M.addItem(s, board.id, list.id, v));
      },
    });
    requestAnimationFrame(() => autosize(add));

    return h('section', { class: 'col list' },
      h('header', { class: 'col-head' }, title, more),
      h('div', { class: 'col-body', dataset: { scrollKey: `list:${list.id}` } },
        h('ul', { class: 'tasks' }, items),
        h('div', { class: 'add-row' }, icon('plus', 15), add)));
  }

  function render(boardId) {
    const board = store.getState().boards.find((b) => b.id === boardId);
    if (!board) return [h('p', { class: 'hint pad' }, 'Ce tableau n’existe plus.')];
    const addList = h('button', {
      type: 'button', class: 'add-list',
      onclick: () => {
        let newId = null;
        apply((s) => { const l = M.addList(s, board.id); newId = l && l.id; });
        app.ui.focusAfterRender = newId ? `list-title:${newId}` : null;
        app.render();
      },
    }, icon('plus', 16), 'Ajouter une liste');
    return [h('div', { class: 'cols board', dataset: { scrollKey: 'cols' } }, board.lists.map((l) => listCard(board, l)), addList)];
  }

  return { render };
}
