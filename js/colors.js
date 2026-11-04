// Couleurs d'importance : du gris (faible) vers l'orange (forte).

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [142, 142, 147];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function importanceColor(weight, lowHex, highHex) {
  const t = Math.max(0, Math.min(1, (weight - 1) / 9));
  const low = hexToRgb(lowHex);
  const high = hexToRgb(highHex);
  const rgb = low.map((c, i) => Math.round(c + (high[i] - c) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Texte brut (lignes de tâches, panneau) : lit les teintes du thème courant
// pour rester lisible en clair comme en sombre.
export function importanceTextColor(weight) {
  const style = getComputedStyle(document.documentElement);
  const low = style.getPropertyValue('--importance-low').trim() || '#8e8e93';
  const high = style.getPropertyValue('--importance-high').trim() || '#e8710a';
  return importanceColor(weight, low, high);
}

export function importanceTextWeight(weight) {
  if (weight >= 9) return '700';
  if (weight >= 7) return '600';
  return '500';
}

export function setImportanceLabel(el, weight) {
  el.textContent = weight;
  el.style.color = importanceTextColor(weight);
  el.style.fontWeight = importanceTextWeight(weight);
}

// Pastille des habitudes : fond plein, donc une plage fixe indépendante du thème.
export function importanceBadgeColor(weight) {
  return importanceColor(weight, '#c7c7cc', '#ff8a3d');
}
