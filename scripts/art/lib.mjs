// کتابخانه‌ی کوچک وکتور: پالت، گرادیان‌ها و تکه‌های مشترک (سبک کارتونی با خط دور تیره)
export const OUT = '#2b1c10';
export const grad = (id, stops, dir = 'v') => {
  const [x2, y2] = dir === 'v' ? [0, 1] : dir === 'h' ? [1, 0] : [1, 1];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
};
export const rgrad = (id, stops, cx = .5, cy = .5, r = .5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;

export const DEFS = [
  grad('steel', [[0, '#f4f7fb'], [.5, '#b8c6d6'], [1, '#6f7f94']]),
  grad('steelDark', [[0, '#c9d4e0'], [1, '#55657a']]),
  grad('gold', [[0, '#ffe98a'], [.5, '#f2b52c'], [1, '#b8780e']]),
  grad('goldDark', [[0, '#d9a63a'], [1, '#7d4f08']]),
  grad('blue', [[0, '#6cc0ff'], [.55, '#2f7fd6'], [1, '#1b4f96']]),
  grad('red', [[0, '#ff7f6e'], [1, '#a8261f']]),
  grad('green', [[0, '#9be26a'], [.5, '#4fa83a'], [1, '#2a6b21']]),
  grad('greenDark', [[0, '#5f9a3f'], [1, '#203f1a']]),
  grad('purple', [[0, '#d6b3ff'], [.5, '#8c56e0'], [1, '#4c2a8f']]),
  grad('skin', [[0, '#ffe0c2'], [1, '#e2a97f']]),
  grad('brown', [[0, '#9b6a3c'], [1, '#5a3717']]),
  grad('wood', [[0, '#b9834c'], [1, '#6a4322']]),
  grad('stone', [[0, '#d8d3c8'], [.5, '#a8a196'], [1, '#6a6459']]),
  grad('stoneDark', [[0, '#8f8778'], [1, '#4a4338']]),
  grad('grassTop', [[0, '#a5d94a'], [1, '#7fbf3a']]),
  grad('dirt', [[0, '#d6a86a'], [1, '#a97a42']]),
  grad('cliffL', [[0, '#8b6a44'], [1, '#4f3a22']]),
  grad('cliffR', [[0, '#a27c4f'], [1, '#5d4428']]),
  grad('lava', [[0, '#ffd166'], [.5, '#ff6a2a'], [1, '#9a1c10']]),
  grad('bone', [[0, '#fff8e6'], [1, '#c9b892']]),
  grad('water', [[0, '#7fe3f0'], [1, '#2a8fb8']]),
  grad('crystal', [[0, '#e6d2ff'], [.5, '#9f6dff'], [1, '#4b2a9c']]),
  grad('ice', [[0, '#eafaff'], [.5, '#8fd8ff'], [1, '#2f7fd6']]),
  grad('dark', [[0, '#5a5a6a'], [1, '#1e1e28']]),
  rgrad('shadow', [[0, '#000', .45], [1, '#000', 0]]),
  rgrad('fire', [[0, '#fff3a0'], [.4, '#ff9a2e'], [1, '#d9412f', 0]], .5, .8, .6),
  rgrad('glow', [[0, '#ffb347', .55], [1, '#ffb347', 0]]),
  rgrad('glowPurple', [[0, '#c69bff', .6], [1, '#c69bff', 0]]),
  rgrad('glowGold', [[0, '#ffe98a', .7], [1, '#ffe98a', 0]]),
].join('');

export const svg = (w, h, body, scale = 2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}"><defs>${DEFS}</defs><g stroke="${OUT}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

export const shadow = (cx, cy, rx, ry = rx * 0.25) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#shadow)" stroke="none"/>`;
export const hi = (d, o = .7, w = 3) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}"/>`;

// چهره‌ی چیبی: چشم‌ها، ابرو، دهان، گونه
export const face = (cx, cy, mood = 'smile', eyeDx = 16) => {
  const mouth = mood === 'smile' ? `<path d="M${cx - 12} ${cy + 22} q12 8 24 0" fill="none" stroke-width="3"/>` :
    mood === 'grin' ? `<path d="M${cx - 14} ${cy + 20} q14 12 28 0 z" fill="#fff" stroke-width="3"/>` :
    mood === 'angry' ? `<path d="M${cx - 12} ${cy + 24} q12 -6 24 0" fill="none" stroke-width="3"/>` :
    `<path d="M${cx - 8} ${cy + 22} h16" fill="none" stroke-width="3"/>`;
  const brow = mood === 'angry' ? `<path d="M${cx - 26} ${cy - 16} l16 6 M${cx + 26} ${cy - 16} l-16 6" stroke-width="4"/>` : `<path d="M${cx - 24} ${cy - 14} l14 4 M${cx + 24} ${cy - 14} l-14 4" stroke-width="4"/>`;
  return `<ellipse cx="${cx - eyeDx}" cy="${cy}" rx="6" ry="8" fill="${OUT}" stroke="none"/><ellipse cx="${cx + eyeDx}" cy="${cy}" rx="6" ry="8" fill="${OUT}" stroke="none"/>
  <circle cx="${cx - eyeDx + 2}" cy="${cy - 3}" r="2" fill="#fff" stroke="none"/><circle cx="${cx + eyeDx + 2}" cy="${cy - 3}" r="2" fill="#fff" stroke="none"/>${brow}${mouth}
  <circle cx="${cx - 24}" cy="${cy + 12}" r="5" fill="#f4a08a" stroke="none" opacity=".6"/><circle cx="${cx + 24}" cy="${cy + 12}" r="5" fill="#f4a08a" stroke="none" opacity=".6"/>`;
};

// بلوک زمین ایزومتریک ۳۲۰×۲۵۶ (وجه بالا لوزی از (160,40) تا (300,110)/(20,110)/(160,180))
export const isoBlock = (top = 'url(#grassTop)', extra = '') => `
  <path d="M160 40 L300 110 L160 180 L20 110z" fill="${top}"/>
  <path d="M20 110 L160 180 V236 L20 166z" fill="url(#cliffL)"/>
  <path d="M300 110 L160 180 V236 L300 166z" fill="url(#cliffR)"/>
  <path d="M40 118 l8 30 M70 134 l6 26 M250 134 l-6 26 M280 118 l-8 30" stroke="#3a2712" stroke-width="2" opacity=".7"/>${extra}`;

export const flag = (x, y, h, fill = 'url(#gold)') => `<path d="M${x} ${y} v-${h}" stroke-width="4"/><path d="M${x} ${y - h + 2} l30 8 l-30 9z" fill="${fill}"/>`;
export const fireAt = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="8" rx="44" ry="22" fill="url(#glow)" stroke="none"/><path d="M-20 8 l40 -4 M-18 0 l36 12" stroke="#5a3717" stroke-width="5"/><path d="M0 -30 c-14 12 -18 26 -8 36 c2-8 6-12 8-14 c2 6 6 10 6 16 c10-8 8-24 -6-38z" fill="url(#fire)" stroke="#c23a1c"/></g>`;
export const tent = (x, y, w, h, fill, dark) => `<path d="M${x} ${y - h} L${x - w / 2} ${y} h${w}z" fill="${fill}"/><path d="M${x} ${y - h} L${x - w * 0.15} ${y} h${w * 0.3}z" fill="${dark}" opacity=".55" stroke="none"/>`;
export const tree = (x, y, s = 1, leaf = 'url(#green)', trunk = 'url(#wood)') => `<g transform="translate(${x} ${y}) scale(${s})">${shadow(0, 4, 34, 10)}<path d="M-8 0 h16 v-30 h-16z" fill="${trunk}"/><circle cx="0" cy="-52" r="34" fill="${leaf}"/><circle cx="-22" cy="-40" r="22" fill="${leaf}"/><circle cx="22" cy="-40" r="22" fill="${leaf}"/><circle cx="0" cy="-74" r="20" fill="${leaf}"/>${hi('M-18 -70 q18 -12 34 0', .6)}</g>`;
export const rock = (x, y, s = 1, fill = 'url(#stone)') => `<g transform="translate(${x} ${y}) scale(${s})">${shadow(0, 6, 40, 12)}<path d="M-38 4 l10-30 l22-14 l26 8 l16 24 l-10 16 h-54z" fill="${fill}"/>${hi('M-24 -20 l18 -12 l14 4', .6)}<path d="M-6 -6 l10 10 M10 -14 l8 6" stroke="#5a5348" stroke-width="2"/></g>`;
