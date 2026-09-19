// پنج نیرو (چیبی) با پز ایستاده و ۴ فریم راه‌رفتن. هر پیکره ۲۵۶×۳۲۰.
import { svg, shadow, hi, face, OUT } from './lib.mjs';

// پارامترهای انیمیشن: زاویه‌ی پا/دست و بالا-پایین بدن برای هر فریم
const FRAMES = [
  { legL: -18, legR: 18, armL: 12, armR: -12, bob: 0 },
  { legL: 0, legR: 0, armL: 0, armR: 0, bob: -4 },
  { legL: 18, legR: -18, armL: -12, armR: 12, bob: 0 },
  { legL: 0, legR: 0, armL: 0, armR: 0, bob: -4 },
];
const IDLE = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };

// بدن پایه: پاها، تنه، بازوها، سر — با قلاب‌های تزئینی هر کلاس
function body(p, c) {
  const { legL, legR, armL, armR, bob } = p;
  const y = bob;
  const leg = (x, ang, fill) => `<g transform="translate(${x} ${236 + y}) rotate(${ang})"><path d="M-14 0 l-4 44 h30 l-2-44z" fill="${fill}"/><path d="M-20 42 h34 l4 14 h-42z" fill="url(#brown)"/></g>`;
  const arm = (x, ang, fill, hand) => `<g transform="translate(${x} ${166 + y}) rotate(${ang})"><path d="M-10 0 c-10 8 -14 30 -8 48 l20 0 c-2-18 2-36 12-44z" fill="${fill}"/>${hand}</g>`;
  return `
  ${shadow(128, 302, 68, 15)}
  ${c.back ? c.back(y) : ''}
  ${leg(104, legL, c.legs)} ${leg(150, legR, c.legs)}
  ${c.cape ? `<path d="M84 ${150 + y} c-14 30 -18 70 -10 96 l24-6 c-8-30 -8-60 0-88z" fill="${c.cape}"/>` : ''}
  <path d="M94 ${150 + y} c10-10 58-10 68 0 l10 90 c-30 10 -58 10 -88 0z" fill="${c.torso}"/>
  ${c.torsoDetail ? c.torsoDetail(y) : ''}
  <path d="M98 ${214 + y} c30 8 58 8 88 0 v14 c-30 8 -58 8 -88 0z" fill="url(#brown)"/>
  <rect x="118" y="${212 + y}" width="22" height="18" rx="4" fill="url(#gold)"/>
  ${arm(176, -armR, c.torso, c.handR ? c.handR(y) : `<circle cx="4" cy="52" r="11" fill="url(#skin)"/>`)}
  ${arm(82, -armL, c.torso, c.handL ? c.handL(y) : `<circle cx="2" cy="52" r="11" fill="url(#skin)"/>`)}
  ${c.shoulders ? `<ellipse cx="90" cy="${158 + y}" rx="22" ry="16" fill="${c.shoulders}"/><ellipse cx="166" cy="${158 + y}" rx="22" ry="16" fill="${c.shoulders}"/>` : ''}
  <ellipse cx="128" cy="${104 + y}" rx="46" ry="44" fill="url(#skin)"/>
  ${c.hat(y)}
  ${face(128, 116 + y, c.mood ?? 'smile')}
  ${c.front ? c.front(y) : ''}`;
}

const CLASSES = {
  soldier: {
    legs: 'url(#steelDark)', torso: 'url(#steel)', cape: 'url(#red)', shoulders: 'url(#steel)',
    torsoDetail: y => `<path d="M118 ${158 + y} c6-4 14-4 20 0 l4 74 c-10 4 -18 4 -28 0z" fill="url(#steelDark)" opacity=".55"/>`,
    hat: y => `<path d="M80 ${100 + y} c0-34 22-54 48-54 s48 20 48 54 v10 c-12 6 -20 8 -30 8 l-4-18 h-28 l-4 18 c-10 0 -18-2 -30-8z" fill="url(#steel)"/>${hi(`M96 ${60 + y} c10-12 54-12 64 0`)}<path d="M124 ${44 + y} c-10-20 -2-34 4-40 c6 6 14 20 4 40z" fill="url(#red)"/>`,
    handR: () => `<circle cx="4" cy="52" r="11" fill="url(#skin)"/><path d="M4 46 l-4-120 c0-8 8-8 8 0 l-4 120z" fill="url(#steel)"/><rect x="-12" y="34" width="32" height="8" rx="3" fill="url(#gold)"/>`,
    handL: () => `<path d="M-38 -6 c0-20 18-34 36-34 s36 14 36 34 c0 30 -18 50 -36 60 c-18-10 -36-30 -36-60z" fill="url(#blue)"/><path d="M-30 -4 c0-14 12-24 28-24 s28 10 28 24 c0 22 -12 38 -28 46 c-16-8 -28-24 -28-46z" fill="none" stroke="url(#gold)" stroke-width="5"/><path d="M-2 -22 v54 M-22 4 h40" stroke="#ffe98a" stroke-width="6"/><circle cx="-2" cy="4" r="9" fill="url(#gold)"/>`,
  },
  guard: {
    legs: 'url(#goldDark)', torso: 'url(#gold)', cape: 'url(#blue)', shoulders: 'url(#gold)', mood: 'angry',
    torsoDetail: y => `<path d="M104 ${160 + y} h48 l-6 60 h-36z" fill="url(#goldDark)" opacity=".5"/><circle cx="128" cy="${186 + y}" r="10" fill="url(#blue)"/>`,
    hat: y => `<path d="M80 ${100 + y} c0-34 22-54 48-54 s48 20 48 54 v14 h-96z" fill="url(#gold)"/><rect x="112" y="${96 + y}" width="32" height="20" fill="${OUT}" stroke="none"/><path d="M100 ${52 + y} l28-24 l28 24" fill="url(#gold)"/>${hi(`M98 ${62 + y} c10-12 50-12 60 0`)}`,
    handR: () => `<circle cx="4" cy="52" r="11" fill="url(#skin)"/><path d="M4 46 v-110" stroke-width="10" stroke="#5a3717"/><path d="M4 46 v-110" stroke-width="5" stroke="#9b6a3c"/><path d="M-26 -64 l30-18 l30 18 l-10 22 h-40z" fill="url(#steel)"/>`,
    handL: () => `<path d="M-46 -20 h60 v70 c0 20 -14 34 -30 40 c-16-6 -30-20 -30-40z" fill="url(#gold)"/><path d="M-36 -10 h40 v56 c0 14 -10 24 -20 28 c-10-4 -20-14 -20-28z" fill="url(#blue)"/><path d="M-16 -4 l8 20 h-16z M-16 40 l-8-20 h16z" fill="#ffe98a"/>`,
  },
  archer: {
    legs: 'url(#greenDark)', torso: 'url(#green)', cape: null, shoulders: null,
    torsoDetail: y => `<path d="M100 ${156 + y} l56 0 l-14 80 h-28z" fill="url(#greenDark)" opacity=".4"/><path d="M96 ${152 + y} l64 90" stroke="#5a3717" stroke-width="8"/>`,
    hat: y => `<path d="M78 ${96 + y} c10-40 40-52 50-52 s40 12 50 52 l14 4 c-40 12 -88 12 -128 0z" fill="url(#green)"/><path d="M148 ${52 + y} l36-18 l-10 30z" fill="url(#red)"/>`,
    handR: () => `<circle cx="4" cy="52" r="11" fill="url(#skin)"/><path d="M4 50 c40-36 40-100 0-136" fill="none" stroke="#7a4a22" stroke-width="7"/><path d="M4 50 v-136" stroke="#e8e0c8" stroke-width="2"/><path d="M4 -18 h-52" stroke-width="3"/><path d="M-52 -18 l8-5 v10z" fill="url(#steel)"/>`,
    back: y => `<path d="M156 ${150 + y} l26 -60 h12 l-20 66z" fill="url(#brown)"/><path d="M182 ${92 + y} l4-14 M188 ${94 + y} l6-12 M176 ${94 + y} l0-14" stroke="#e8e0c8" stroke-width="3"/>`,
  },
  explorer: {
    legs: 'url(#brown)', torso: 'url(#dirt)', cape: null, shoulders: null, mood: 'grin',
    torsoDetail: y => `<path d="M112 ${152 + y} l32 0 l-4 80 h-24z" fill="#f4e8d0" stroke="none"/><path d="M96 ${166 + y} c20 10 44 10 64 0" stroke="url(#red)" stroke-width="10" fill="none"/>`,
    hat: y => `<path d="M64 ${98 + y} c20-10 108-10 128 0 c-24 14 -104 14 -128 0z" fill="url(#brown)"/><path d="M88 ${98 + y} c0-30 16-46 40-46 s40 16 40 46z" fill="url(#brown)"/><path d="M90 ${92 + y} h76" stroke="url(#gold)" stroke-width="6"/>`,
    handR: () => `<circle cx="4" cy="52" r="11" fill="url(#skin)"/><circle cx="4" cy="20" r="20" fill="none" stroke="#5a3717" stroke-width="8"/><circle cx="4" cy="20" r="16" fill="url(#ice)" opacity=".7"/><path d="M4 40 v14" stroke="#5a3717" stroke-width="8"/>`,
    back: y => `<path d="M76 ${150 + y} h104 v80 h-104z" rx="12" fill="url(#brown)"/><path d="M84 ${160 + y} h88 v18 h-88z" fill="#c9a86a" stroke="none"/>`,
  },
  guide: {
    legs: 'url(#purple)', torso: 'url(#purple)', cape: 'url(#purple)', shoulders: null,
    torsoDetail: y => `<path d="M128 ${156 + y} l6 14 l14 2 l-10 10 l2 14 l-12-6 l-12 6 l2-14 l-10-10 l14-2z" fill="url(#gold)"/>`,
    hat: y => `<path d="M70 ${100 + y} c20-8 96-8 116 0 c-20 12 -96 12 -116 0z" fill="url(#purple)"/><path d="M96 ${100 + y} l32-88 l32 88z" fill="url(#purple)"/><path d="M150 ${70 + y} l6 10 l10 2 l-8 6 l2 10 l-10-6 l-10 6 l2-10 l-8-6 l10-2z" fill="url(#gold)" stroke-width="2"/>`,
    handR: () => `<circle cx="4" cy="52" r="11" fill="url(#skin)"/><path d="M4 46 v-120" stroke-width="10" stroke="#5a3717"/><path d="M4 46 v-120" stroke-width="5" stroke="#9b6a3c"/><circle cx="4" cy="-84" r="16" fill="url(#ice)"/><circle cx="4" cy="-84" r="26" fill="url(#glowPurple)" stroke="none"/>`,
    handL: () => `<circle cx="2" cy="52" r="11" fill="url(#skin)"/><path d="M-30 36 h60 v40 h-60z" fill="#f4e8d0"/><path d="M-22 46 h44 M-22 56 h30 M-22 66 h38" stroke="#7a4a22" stroke-width="2"/><path d="M-4 42 l16 18 l-6 6" stroke="#c23a1c" stroke-width="2" fill="none"/>`,
  },
};

export function unit(type, frame) {
  const c = CLASSES[type];
  const p = frame === undefined ? IDLE : FRAMES[frame];
  return svg(256, 320, body(p, c));
}
export const UNIT_TYPES = Object.keys(CLASSES);
