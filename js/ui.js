// Petits outils d'interface : création de nœuds, icônes, popovers empilés, toast.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'hidden', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  repeat: '<path d="M17 3l3.5 3.5L17 10"/><path d="M4 11V9.5A3 3 0 0 1 7 6.5h13.5"/><path d="M7 21l-3.5-3.5L7 14"/><path d="M20 13v1.5a3 3 0 0 1-3 3H3.5"/>',
  bars: '<path d="M6 20V11M12 20V4M18 20v-6"/>',
  sub: '<path d="M14 9l5 5-5 5"/><path d="M5 4v6a4 4 0 0 0 4 4h10"/>',
  up: '<path d="M10 19l-5-5 5-5"/><path d="M19 4v6a4 4 0 0 1-4 4H5"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  horizons: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  hours: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  day: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M4 14.5h16"/>',
  month: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9.5 10v10M14.5 10v10"/>',
  year: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8 5V3.5M16 5V3.5M8 14h3M13 14h3"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1 1.3 1 2.4h5.6c0-1.1.3-1.8 1-2.4A6 6 0 0 0 12 3z"/>',
  habits: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.5 2.5 4.5-5"/>',
  logout: '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  board: '<rect x="4" y="4.5" width="6.5" height="15" rx="2"/><rect x="13.5" y="4.5" width="6.5" height="9" rx="2"/>',
};

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.style.width = span.style.height = `${size}px`;
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

// --- popovers empilés -------------------------------------------------------

const layers = [];
let backdrop = null;
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = h('div', { class: 'pop-backdrop', hidden: true });
  document.body.append(backdrop);
  return backdrop;
}

function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i === -1) return;
  // Fermer un calque ferme aussi ceux ouverts par-dessus.
  for (const l of layers.splice(i)) {
    l.el.remove();
    if (l.onClose) l.onClose();
  }
  if (backdrop) backdrop.hidden = layers.length === 0 || !isMobile();
}

export function closeAllPopovers() {
  if (layers.length) closeLayer(layers[0]);
}

export function hasPopover() {
  return layers.length > 0;
}

function place(layer, side) {
  const { el, anchor } = layer;
  if (isMobile()) { el.classList.add('as-sheet'); return; }
  const r = anchor.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = el.offsetWidth;
  const ht = el.offsetHeight;
  let left;
  let top;
  if (side === 'right') {
    left = r.right + 4;
    if (left + w > vw - margin) left = Math.max(margin, r.left - w - 4);
    top = r.top;
  } else {
    left = side === 'end' ? r.right - w : r.left;
    top = r.bottom + 6;
    if (top + ht > vh - margin) top = Math.max(margin, r.top - ht - 6);
  }
  left = Math.min(Math.max(margin, left), Math.max(margin, vw - w - margin));
  top = Math.min(Math.max(margin, top), Math.max(margin, vh - ht - margin));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

// `key` fait basculer : rouvrir le même popover le ferme.
export function openPopover(anchor, content, { side = 'start', className = '', key = null, onClose = null } = {}) {
  if (key) {
    const existing = layers.find((l) => l.key === key);
    if (existing) { closeLayer(existing); return null; }
  }
  const el = h('div', { class: `popover ${className}`.trim(), role: 'dialog' }, content);
  el.style.zIndex = String(1000 + layers.length * 2);
  document.body.append(el);
  const layer = { el, anchor, key, onClose };
  layers.push(layer);
  if (isMobile()) {
    const b = ensureBackdrop();
    b.hidden = false;
    b.style.zIndex = String(999 + (layers.length - 1) * 2);
  }
  place(layer, side);
  return { el, close: () => closeLayer(layer), reposition: () => place(layer, side) };
}

document.addEventListener('pointerdown', (e) => {
  if (!layers.length) return;
  if (layers.some((l) => l.el.contains(e.target) || (l.anchor.contains && l.anchor.contains(e.target)))) return;
  closeAllPopovers();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) {
    closeLayer(layers[layers.length - 1]);
    e.stopPropagation();
  }
}, true);

// Ancre invisible à un point d'écran (clic dans la grille des heures).
export function pointAnchor(x, y) {
  return { getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }), contains: () => false };
}

// --- toast ------------------------------------------------------------------

let toastEl = null;
let toastTimer = null;

export function toast(message, { actionLabel, onAction, ms = 5000 } = {}) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);
  const close = () => { if (toastEl) toastEl.remove(); toastEl = null; };
  toastEl = h('div', { class: 'toast', role: 'status' },
    h('span', null, message),
    actionLabel ? h('button', { type: 'button', class: 'toast-action', onclick: () => { close(); if (onAction) onAction(); } }, actionLabel) : null);
  document.body.append(toastEl);
  toastTimer = setTimeout(close, ms);
}
