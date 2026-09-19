// هفت موجود زمین‌ها (۲۵۶×۲۸۸)
import { svg, shadow, hi, OUT } from './lib.mjs';

const eyes = (cx, cy, dx, r = 7, color = '#fff', pupil = OUT) => `<circle cx="${cx - dx}" cy="${cy}" r="${r}" fill="${color}"/><circle cx="${cx + dx}" cy="${cy}" r="${r}" fill="${color}"/><circle cx="${cx - dx + 2}" cy="${cy + 1}" r="${r * .45}" fill="${pupil}" stroke="none"/><circle cx="${cx + dx + 2}" cy="${cy + 1}" r="${r * .45}" fill="${pupil}" stroke="none"/>`;
const angryBrows = (cx, cy, dx) => `<path d="M${cx - dx - 12} ${cy - 16} l22 8 M${cx + dx + 12} ${cy - 16} l-22 8" stroke-width="5"/>`;
const teeth = (cx, cy, n = 4, w = 8) => Array.from({ length: n }, (_, i) => `<path d="M${cx - (n * w) / 2 + i * w} ${cy} l${w / 2} 12 l${w / 2} -12z" fill="#fff" stroke-width="2"/>`).join('');

export const MONSTERS = {
  // شیر دشت
  plain: () => svg(256, 288, `${shadow(128, 266, 80, 16)}
    <ellipse cx="128" cy="200" rx="70" ry="52" fill="url(#gold)"/>
    <path d="M70 232 l-4 36 h22 l4-32z M170 232 l4 36 h22 l-4-32z M96 236 l-2 32 h20 l0-30z M148 236 l0 32 h20 l-2-30z" fill="url(#goldDark)"/>
    <path d="M196 190 c30-10 40 20 22 40" fill="none" stroke-width="8" stroke="#a8722a"/>
    <circle cx="128" cy="130" r="66" fill="url(#brown)"/>
    <circle cx="128" cy="134" r="46" fill="url(#gold)"/>
    <path d="M96 100 c-20 -30 40 -50 32 -10 M160 100 c20 -30 -40 -50 -32 -10" fill="url(#brown)"/>
    ${eyes(128, 130, 18, 8)} ${angryBrows(128, 130, 18)}
    <ellipse cx="128" cy="154" rx="14" ry="8" fill="${OUT}" stroke="none"/> ${teeth(128, 162, 4, 8)}`),
  // غول سنگی کوهستان
  mountain: () => svg(256, 288, `${shadow(128, 268, 84, 16)}
    <path d="M60 250 l10-90 l30-30 h72 l30 30 l10 90z" fill="url(#stone)"/>
    <path d="M40 240 l-10-60 l30-20 l16 80z M216 240 l10-60 l-30-20 l-16 80z" fill="url(#stoneDark)"/>
    <path d="M92 130 c0-40 72-40 72 0 v30 h-72z" fill="url(#stone)"/>
    <path d="M100 106 l-10-30 l24 14 M156 106 l10-30 l-24 14" fill="url(#stoneDark)"/>
    ${eyes(128, 128, 20, 9, '#ffcf3a', '#7a4d08')} ${angryBrows(128, 128, 20)}
    <path d="M108 154 h40" stroke-width="6"/>
    <path d="M70 190 l20 10 M170 200 l-16 12 M110 220 l30-6" stroke="#5a5348" stroke-width="3"/>
    <circle cx="150" cy="212" r="10" fill="url(#ice)"/><circle cx="96" cy="236" r="7" fill="url(#ice)"/>`),
  // زامبی مرداب
  marsh: () => svg(256, 288, `${shadow(128, 266, 72, 14)}
    <path d="M96 230 l-8 40 h26 l4-40z M136 230 l4 40 h26 l-8-40z" fill="url(#greenDark)"/>
    <path d="M90 150 c14-12 62-12 76 0 l8 86 c-30 10 -62 10 -92 0z" fill="url(#green)"/>
    <path d="M100 160 l14 30 l-8 40 M156 158 l-14 26 l10 44" stroke="#2a6b21" stroke-width="3" fill="none"/>
    <path d="M60 176 c-20 4 -30 30 -20 50 l22-4 c-6-14 -4-28 6-38z" fill="url(#green)"/>
    <path d="M196 176 c20 4 30 30 20 50 l-22-4 c6-14 4-28 -6-38z" fill="url(#green)"/>
    <ellipse cx="128" cy="104" rx="46" ry="44" fill="url(#green)"/>
    <path d="M86 90 c10-40 74-40 84 0 c-10-10 -74-10 -84 0z" fill="url(#greenDark)"/>
    ${eyes(128, 112, 16, 8, '#ffe98a', '#c23a1c')}
    <path d="M110 138 q18 14 36 0" fill="#3d1a1a"/> ${teeth(128, 136, 3, 10)}
    <path d="M60 246 c20 -10 40 4 60 -4 s40 12 66 0" fill="none" stroke="#4fa83a" stroke-width="8"/>`),
  // شیطان بال‌دار سرزمین خطر
  danger: () => svg(256, 288, `${shadow(128, 268, 74, 14)}
    <path d="M100 150 c-40 -30 -80 -20 -90 20 c30 -10 50 0 70 20z M156 150 c40 -30 80 -20 90 20 c-30 -10 -50 0 -70 20z" fill="url(#dark)"/>
    <path d="M96 236 l-6 36 h24 l4-36z M136 236 l4 36 h24 l-6-36z" fill="#7a1d14"/>
    <path d="M94 150 c14-12 54-12 68 0 l10 90 c-30 10 -58 10 -88 0z" fill="url(#red)"/>
    <path d="M118 160 l20 0 l-4 70 h-12z" fill="#7a1d14" opacity=".6" stroke="none"/>
    <path d="M176 200 c30 20 40 50 30 70 l-12-4 c4-18 -6-40 -26-54z" fill="url(#red)"/>
    <ellipse cx="128" cy="104" rx="44" ry="42" fill="url(#red)"/>
    <path d="M90 78 l-14-44 l34 30z M166 78 l14-44 l-34 30z" fill="url(#dark)"/>
    ${eyes(128, 108, 16, 8, '#ffe98a', '#a8261f')} ${angryBrows(128, 108, 16)}
    <path d="M108 134 q20 14 40 0" fill="#3d1a1a"/> ${teeth(128, 132, 4, 8)}`),
  // آتش‌فران جهنمی
  hell: () => svg(256, 288, `${shadow(128, 268, 84, 16)}
    <ellipse cx="128" cy="270" rx="70" ry="14" fill="url(#glow)" stroke="none"/>
    <path d="M60 250 l14-90 l26-24 h56 l26 24 l14 90z" fill="url(#dark)"/>
    <path d="M78 246 l10-70 l14 40 l14-50 l12 60 l12-56 l12 50 l14-40 l12 66z" fill="url(#lava)" stroke="#9a1c10"/>
    <path d="M40 236 l-10-56 l28-14 l16 76z M216 236 l10-56 l-28-14 l-16 76z" fill="url(#dark)"/>
    <path d="M52 190 l10 30 M204 190 l-10 30" stroke="#ff6a2a" stroke-width="4"/>
    <path d="M90 136 c0-44 76-44 76 0 v20 h-76z" fill="url(#dark)"/>
    <path d="M96 92 l-18-46 l30 30 M160 92 l18-46 l-30 30" fill="url(#lava)" stroke="#9a1c10"/>
    ${eyes(128, 132, 20, 9, '#ffd166', '#9a1c10')} ${angryBrows(128, 132, 20)}
    <path d="M104 160 h48" stroke="#ff6a2a" stroke-width="6"/>
    <path d="M112 70 c-8-20 6-34 12-40 c6 6 20 20 10 40z" fill="url(#fire)" stroke="#c23a1c"/>`),
  // نگهبان مقبره (زره طلایی-سیاه)
  tomb: () => svg(256, 288, `${shadow(128, 268, 66, 14)}
    <path d="M100 232 l-6 40 h26 l4-40z M132 232 l4 40 h26 l-6-40z" fill="url(#dark)"/>
    <path d="M94 148 c14-12 54-12 68 0 l10 90 c-30 10 -58 10 -88 0z" fill="url(#dark)"/>
    <path d="M104 156 h48 l-4 24 h-40z M110 190 h36 l-2 24 h-32z" fill="url(#gold)"/>
    <ellipse cx="90" cy="156" rx="22" ry="16" fill="url(#gold)"/><ellipse cx="166" cy="156" rx="22" ry="16" fill="url(#gold)"/>
    <path d="M82 96 c0-40 92-40 92 0 v30 c-20 10 -72 10 -92 0z" fill="url(#gold)"/>
    <path d="M100 112 h56 v20 h-56z" fill="${OUT}" stroke="none"/>
    ${eyes(128, 122, 16, 6, '#c69bff', '#4c2a8f')}
    <path d="M120 56 l8-30 l8 30z" fill="url(#purple)"/>
    <path d="M184 168 v-120" stroke-width="10" stroke="#3a2a12"/><path d="M184 168 v-120" stroke-width="5" stroke="url(#gold)"/>
    <path d="M166 62 l18-30 l18 30 l-18 8z" fill="url(#purple)"/>
    <circle cx="128" cy="130" r="80" fill="url(#glowPurple)" stroke="none"/>`),
  // نگهبان گنج (غول بلورین طلایی-آبی)
  treasure: () => svg(256, 288, `${shadow(128, 272, 90, 16)}
    <circle cx="128" cy="150" r="110" fill="url(#glowGold)" stroke="none"/>
    <path d="M56 252 l14-96 l26-26 h64 l26 26 l14 96z" fill="url(#gold)"/>
    <path d="M96 150 l64 0 l-8 92 h-48z" fill="url(#ice)"/>
    <path d="M118 160 l10-14 l10 14 l-10 30z M104 200 l8-12 l8 12 l-8 22z M144 200 l8-12 l8 12 l-8 22z" fill="url(#crystal)" stroke-width="2"/>
    <path d="M36 240 l-8-60 l30-18 l18 78z M220 240 l8-60 l-30-18 l-18 78z" fill="url(#gold)"/>
    <path d="M22 182 l-10-30 l24 10z M234 182 l10-30 l-24 10z" fill="url(#ice)"/>
    <path d="M88 128 c0-48 80-48 80 0 v28 h-80z" fill="url(#gold)"/>
    <path d="M100 70 l-6-40 l24 26 M156 70 l6-40 l-24 26 M128 62 l0-40" fill="url(#ice)" stroke-width="3"/>
    ${eyes(128, 126, 20, 9, '#8fd8ff', '#1b4f96')} ${angryBrows(128, 126, 20)}
    <path d="M108 156 h40" stroke="#1b4f96" stroke-width="6"/>`),
};
