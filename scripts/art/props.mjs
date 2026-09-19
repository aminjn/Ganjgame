// ساختمان‌ها، محیط، آرتیفکت‌ها، آیکون‌ها
import { svg, shadow, hi, isoBlock, flag, fireAt, tent, tree, rock, OUT } from './lib.mjs';

const fence = () => `<g fill="url(#wood)">
  <path d="M40 104 v-20 h6 v20z M60 94 v-20 h6 v20z M80 84 v-20 h6 v20z M100 74 v-20 h6 v20z M120 64 v-20 h6 v20z"/><path d="M40 92 L126 50" stroke="#8a5a2a" stroke-width="5" fill="none"/>
  <path d="M280 104 v-20 h-6 v20z M260 94 v-20 h-6 v20z M240 84 v-20 h-6 v20z M220 74 v-20 h-6 v20z M200 64 v-20 h-6 v20z"/><path d="M280 92 L194 50" stroke="#8a5a2a" stroke-width="5" fill="none"/></g>`;
const crate = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-18 -8 l18-8 l18 8 v16 l-18 8 l-18-8z" fill="url(#wood)"/><path d="M0 -16 v32 M-18 -8 l18 8 l18-8" fill="none" stroke-width="2"/></g>`;
const barrel = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="#8a5a2a"/><path d="M${x - 10} ${y} v14 c0 3 20 3 20 0 v-14" fill="url(#wood)"/>`;

export const BUILDINGS = {
  camp: () => svg(320, 256, `${isoBlock()}<path d="M160 70 L250 112 L160 156 L70 112z" fill="url(#dirt)" stroke="#8a5a2a"/>${fence()}
    ${tent(160, 104, 96, 58, 'url(#red)', '#7a1d14')}<path d="M160 46 v-16" stroke-width="4"/><path d="M160 30 l18 6 l-18 6z" fill="url(#gold)"/>
    ${tent(228, 130, 48, 34, 'url(#blue)', '#123a70')}${crate(102, 126)}${barrel(62, 130)}${fireAt(160, 138)}${flag(118, 76, 56)}`),
  clan_camp: () => svg(320, 256, `${isoBlock()}<path d="M160 70 L250 112 L160 156 L70 112z" fill="url(#dirt)" stroke="#8a5a2a"/>${fence()}
    ${tent(160, 108, 110, 66, 'url(#blue)', '#123a70')}<path d="M160 42 v-16" stroke-width="4"/><path d="M160 26 l18 6 l-18 6z" fill="url(#gold)"/>
    ${tent(100, 128, 44, 32, 'url(#blue)', '#123a70')}${tent(224, 132, 44, 32, 'url(#blue)', '#123a70')}${fireAt(160, 144, .8)}
    <path d="M132 108 l28-40 l28 40 h-16 v-14 h-24 v14z" fill="url(#gold)" stroke-width="3"/>${flag(118, 76, 56, 'url(#blue)')}${flag(202, 76, 56, 'url(#blue)')}`),
  tomb: () => svg(320, 256, `${isoBlock('url(#stoneDark)')}<circle cx="160" cy="110" r="90" fill="url(#glowPurple)" stroke="none"/>
    <path d="M160 74 L236 112 L160 150 L84 112z" fill="url(#stone)"/>
    <path d="M110 118 l14-70 h72 l14 70 l-50 22z" fill="url(#purple)"/>
    <path d="M124 48 l36-32 l36 32z" fill="url(#purple)"/><path d="M140 118 h40 v-46 c0-20 -40-20 -40 0z" fill="url(#dark)"/>
    <path d="M160 16 l-14-30 l14 8 l14-8z" fill="url(#crystal)"/>
    <path d="M100 96 v-40 M220 96 v-40" stroke-width="10" stroke="#3a2a12"/><path d="M100 56 l0-10 M220 56 l0-10" stroke-width="6" stroke="url(#crystal)"/>
    ${flag(238, 100, 60, 'url(#red)')}<circle cx="160" cy="24" r="26" fill="url(#glowPurple)" stroke="none"/>`),
  treasure: () => svg(320, 256, `${isoBlock('url(#dirt)')}<circle cx="160" cy="104" r="110" fill="url(#glowGold)" stroke="none"/>
    <path d="M160 64 L250 108 L160 152 L70 108z" fill="url(#stone)"/><path d="M160 76 L226 108 L160 140 L94 108z" fill="url(#gold)"/>
    <path d="M96 118 v-50 M224 118 v-50 M130 132 v-52 M190 132 v-52" stroke-width="12" stroke="#a8722a"/><path d="M96 118 v-50 M224 118 v-50 M130 132 v-52 M190 132 v-52" stroke-width="6" stroke="url(#gold)"/>
    <path d="M84 62 l76-36 l76 36 l-76 20z" fill="url(#gold)"/><path d="M104 60 l56-26 l56 26" fill="none" stroke="url(#red)" stroke-width="4"/>
    <path d="M132 130 h56 v-26 c0-14 -56-14 -56 0z" fill="url(#brown)"/><path d="M132 112 h56" stroke-width="3"/><rect x="152" y="108" width="16" height="12" rx="2" fill="url(#gold)"/>
    <circle cx="160" cy="96" r="12" fill="url(#ice)"/><circle cx="160" cy="96" r="24" fill="url(#glowGold)" stroke="none"/>
    <circle cx="112" cy="126" r="6" fill="url(#gold)"/><circle cx="122" cy="132" r="6" fill="url(#gold)"/><circle cx="204" cy="128" r="6" fill="url(#gold)"/>`),
  caravan: () => svg(320, 256, `${shadow(160, 210, 110, 22)}
    <path d="M60 176 l30-60 h140 l30 60z" fill="url(#wood)"/><path d="M76 176 l22-44 h124 l22 44z" fill="#c9a86a" stroke="none"/>
    <path d="M80 116 c40-50 120-50 160 0 z" fill="url(#red)"/><path d="M96 116 c32-36 96-36 128 0" fill="none" stroke="#7a1d14" stroke-width="4"/><path d="M80 116 h160" stroke-width="4"/>
    <circle cx="96" cy="190" r="26" fill="url(#wood)"/><circle cx="96" cy="190" r="10" fill="url(#gold)"/><path d="M96 164 v52 M70 190 h52" stroke-width="4"/>
    <circle cx="224" cy="190" r="26" fill="url(#wood)"/><circle cx="224" cy="190" r="10" fill="url(#gold)"/><path d="M224 164 v52 M198 190 h52" stroke-width="4"/>
    ${flag(250, 110, 60)}`),
  tower: () => svg(160, 200, `${shadow(80, 186, 44, 10)}<path d="M52 176 v-90 h56 v90z" fill="url(#stone)"/><path d="M44 96 h72 v-16 h-72z" fill="url(#stone)"/><path d="M44 80 h12 v-12 h-12z M70 80 h12 v-12 h-12z M96 80 h12 v-12 h-12z" fill="url(#stone)"/>
    <path d="M40 84 l40-44 l40 44z" fill="url(#gold)"/><path d="M68 176 h24 v-30 c0-14 -24-14 -24 0z" fill="url(#dark)"/><path d="M60 120 h10 v14 h-10z M90 120 h10 v14 h-10z" fill="url(#dark)"/>${flag(80, 40, 30)}`),
  tower_clan: () => svg(160, 200, `${shadow(80, 186, 44, 10)}<path d="M52 176 v-90 h56 v90z" fill="url(#stone)"/><path d="M44 96 h72 v-16 h-72z" fill="url(#stone)"/><path d="M44 80 h12 v-12 h-12z M70 80 h12 v-12 h-12z M96 80 h12 v-12 h-12z" fill="url(#stone)"/>
    <path d="M40 84 l40-44 l40 44z" fill="url(#blue)"/><path d="M68 176 h24 v-30 c0-14 -24-14 -24 0z" fill="url(#dark)"/><path d="M60 120 h10 v14 h-10z M90 120 h10 v14 h-10z" fill="url(#dark)"/>${flag(80, 40, 30, 'url(#blue)')}`),
};

export const SCENERY = {
  tree: () => svg(160, 200, tree(80, 186, 1)),
  tree2: () => svg(160, 200, `<g transform="translate(80 186)">${shadow(0, 4, 30, 9)}<path d="M-7 0 h14 v-26 h-14z" fill="url(#wood)"/><path d="M-44 -30 l44 -70 l44 70z" fill="url(#green)"/><path d="M-36 -64 l36 -56 l36 56z" fill="url(#green)"/><path d="M-26 -94 l26 -44 l26 44z" fill="url(#green)"/>${hi('M-20 -80 l20 -30', .6)}</g>`),
  dead_tree: () => svg(160, 200, `<g transform="translate(80 186)">${shadow(0, 4, 30, 9)}<path d="M-8 0 h16 l-4-70 l26-40 l-8-4 l-20 32 l-2-60 h-10 l2 50 l-24-30 l-8 6 l30 44z" fill="url(#brown)"/></g>`),
  bush: () => svg(160, 120, `<g transform="translate(80 106)">${shadow(0, 4, 44, 10)}<circle cx="-24" cy="-26" r="24" fill="url(#green)"/><circle cx="24" cy="-26" r="24" fill="url(#green)"/><circle cx="0" cy="-40" r="28" fill="url(#green)"/><circle cx="0" cy="-16" r="22" fill="url(#green)"/>${hi('M-16 -56 q16 -10 30 -2', .6)}<circle cx="-16" cy="-18" r="5" fill="url(#red)"/><circle cx="18" cy="-30" r="5" fill="url(#red)"/></g>`),
  rock: () => svg(160, 120, rock(80, 100, 1)),
  big_rock: () => svg(200, 200, `${rock(100, 176, 1.9)}`),
  grass: () => svg(120, 100, `<g transform="translate(60 92)"><path d="M-30 0 c-4-30 6-50 10-56 c4 14 4 36 0 56z M-8 0 c-2-34 8-56 14-62 c6 16 4 44 -2 62z M16 0 c0-28 10-44 16-50 c2 16 -2 36 -8 50z M34 0 c-2-20 8-34 12-38 c2 12 -2 26 -6 38z" fill="url(#green)" stroke-width="3"/></g>`),
  flower: () => svg(120, 120, `<g transform="translate(60 110)"><path d="M0 0 v-56 M-20 0 v-40 M22 0 v-44" stroke="#4fa83a" stroke-width="5"/><g stroke-width="2">${[[0, -60, 'url(#red)'], [-20, -44, 'url(#gold)'], [22, -48, 'url(#purple)']].map(([x, y, f]) => `<circle cx="${x - 9}" cy="${y}" r="7" fill="${f}"/><circle cx="${x + 9}" cy="${y}" r="7" fill="${f}"/><circle cx="${x}" cy="${y - 9}" r="7" fill="${f}"/><circle cx="${x}" cy="${y + 9}" r="7" fill="${f}"/><circle cx="${x}" cy="${y}" r="6" fill="#ffe98a"/>`).join('')}</g></g>`),
  mushroom: () => svg(120, 120, `<g transform="translate(60 110)">${shadow(0, 2, 30, 7)}<path d="M-10 0 h20 v-34 h-20z" fill="#f4e8d0"/><path d="M-40 -30 c0-30 80-30 80 0 c-20 8 -60 8 -80 0z" fill="url(#red)"/><circle cx="-16" cy="-44" r="5" fill="#fff" stroke="none"/><circle cx="12" cy="-48" r="6" fill="#fff" stroke="none"/><circle cx="26" cy="-38" r="4" fill="#fff" stroke="none"/><path d="M30 0 h14 v-20 h-14z" fill="#f4e8d0"/><path d="M20 -18 c0-18 34-18 34 0z" fill="url(#gold)"/></g>`),
  bones: () => svg(140, 100, `<g transform="translate(70 90)"><path d="M-50 -10 l60 -30" stroke="url(#bone)" stroke-width="10"/><circle cx="-50" cy="-10" r="7" fill="url(#bone)"/><circle cx="10" cy="-40" r="7" fill="url(#bone)"/><circle cx="34" cy="-22" r="22" fill="url(#bone)"/><circle cx="26" cy="-26" r="5" fill="${OUT}" stroke="none"/><circle cx="42" cy="-26" r="5" fill="${OUT}" stroke="none"/><path d="M26 -8 h16" stroke-width="3"/></g>`),
  ruin: () => svg(200, 180, `<g transform="translate(100 166)">${shadow(0, 4, 80, 16)}<path d="M-80 0 v-60 h20 v60z M-40 0 v-90 h24 v90z M20 0 v-44 h22 v44z M60 0 v-70 h20 v70z" fill="url(#stone)"/><path d="M-84 -60 h28 v-10 h-28z M-44 -90 h32 v-10 h-32z M56 -70 h28 v-10 h-28z" fill="url(#stone)"/><path d="M-60 -20 l14 -6 M-30 -50 l10 8 M66 -30 l8 -10" stroke="#5a5348" stroke-width="2"/></g>`),
  sign: () => svg(120, 140, `<g transform="translate(60 130)"><path d="M-4 0 h8 v-80 h-8z" fill="url(#wood)"/><path d="M-40 -100 h70 l14 14 l-14 14 h-70z" fill="url(#wood)"/><path d="M-30 -86 h40" stroke="#3a2712" stroke-width="3"/></g>`),
  pond: () => svg(200, 140, `<g transform="translate(100 110)"><ellipse cx="0" cy="0" rx="90" ry="44" fill="url(#dirt)"/><ellipse cx="0" cy="-4" rx="76" ry="34" fill="url(#water)"/>${hi('M-40 -14 q20 -10 44 -4', .6)}<ellipse cx="30" cy="4" rx="12" ry="6" fill="url(#green)" stroke-width="2"/><ellipse cx="-34" cy="8" rx="10" ry="5" fill="url(#green)" stroke-width="2"/></g>`),
  fire: () => svg(120, 120, fireAt(60, 100, 1)),
  crystal: () => svg(140, 160, `<g transform="translate(70 150)">${shadow(0, 2, 44, 10)}<circle cx="0" cy="-50" r="70" fill="url(#glowPurple)" stroke="none"/><path d="M-30 0 l-10 -60 l24 -30 l16 90z" fill="url(#crystal)"/><path d="M-4 0 l4 -120 l30 40 l-6 80z" fill="url(#crystal)"/><path d="M26 0 l10 -50 l20 -10 l-6 60z" fill="url(#crystal)"/>${hi('M0 -110 l-10 40', .8)}</g>`),
  statue: () => svg(140, 200, `<g transform="translate(70 186)">${shadow(0, 4, 50, 12)}<path d="M-44 0 h88 v-24 h-88z" fill="url(#stone)"/><path d="M-30 -24 h60 v-20 h-60z" fill="url(#stoneDark)"/><path d="M-16 -44 h32 l-2 -60 h-28z" fill="url(#stone)"/><circle cx="0" cy="-124" r="20" fill="url(#stone)"/><path d="M-16 -100 l-24 30 M16 -100 l24 30" stroke="url(#stone)" stroke-width="12"/><path d="M40 -70 v-60" stroke="url(#stone)" stroke-width="8"/></g>`),
};

export const ARTIFACTS = {
  crown: () => svg(128, 128, `<circle cx="64" cy="64" r="56" fill="url(#glowGold)" stroke="none"/><path d="M24 92 l-8-50 l20 18 l28-32 l28 32 l20-18 l-8 50z" fill="url(#gold)"/><path d="M24 92 h80 v14 h-80z" fill="url(#goldDark)"/><circle cx="64" cy="70" r="8" fill="url(#red)"/><circle cx="40" cy="78" r="6" fill="url(#blue)"/><circle cx="88" cy="78" r="6" fill="url(#blue)"/>`),
  crystal: () => svg(128, 128, `<circle cx="64" cy="64" r="56" fill="url(#glowPurple)" stroke="none"/><path d="M64 12 l34 30 l-34 74 l-34-74z" fill="url(#ice)"/><path d="M30 42 h68 M64 12 l-10 30 l10 74" fill="none" stroke-width="2"/>${hi('M40 38 l16 -20', .8)}`),
  medal: () => svg(128, 128, `<path d="M44 12 h16 l6 36 h-28z M84 12 h-16 l-6 36 h28z" fill="url(#red)"/><circle cx="64" cy="80" r="36" fill="url(#gold)"/><circle cx="64" cy="80" r="26" fill="url(#goldDark)"/><path d="M64 60 l6 14 l16 2 l-12 10 l4 16 l-14-8 l-14 8 l4-16 l-12-10 l16-2z" fill="url(#gold)" stroke-width="2"/>`),
  goblet: () => svg(128, 128, `<circle cx="64" cy="64" r="56" fill="url(#glowGold)" stroke="none"/><path d="M28 20 h72 c0 40 -16 56 -36 56 s-36-16 -36-56z" fill="url(#gold)"/><path d="M58 76 h12 v22 h-12z" fill="url(#goldDark)"/><path d="M40 98 h48 v12 h-48z" fill="url(#gold)"/><circle cx="64" cy="44" r="8" fill="url(#red)"/>`),
  mask: () => svg(128, 128, `<path d="M64 14 c30 0 40 20 40 46 c0 34 -20 54 -40 54 s-40-20 -40-54 c0-26 10-46 40-46z" fill="url(#gold)"/><path d="M40 60 c6-10 18-10 24 0z M64 60 c6-10 18-10 24 0z" fill="url(#dark)"/><path d="M50 92 q14 8 28 0" fill="none" stroke-width="3"/><path d="M24 44 l-14-20 M104 44 l14-20" stroke="url(#gold)" stroke-width="8"/>`),
  dagger: () => svg(128, 128, `<path d="M64 8 l14 70 h-28z" fill="url(#steel)"/><path d="M64 8 v70" stroke="#fff" stroke-width="2"/><path d="M40 78 h48 v10 h-48z" fill="url(#gold)"/><path d="M58 88 h12 v26 h-12z" fill="url(#brown)"/><circle cx="64" cy="118" r="7" fill="url(#red)"/>`),
  coin: () => svg(128, 128, `<circle cx="64" cy="66" r="50" fill="url(#goldDark)"/><circle cx="64" cy="60" r="48" fill="url(#gold)"/><circle cx="64" cy="60" r="34" fill="none" stroke="#b8780e" stroke-width="3"/><path d="M64 34 l8 18 l20 2 l-14 14 l4 20 l-18-10 l-18 10 l4-20 l-14-14 l20-2z" fill="url(#goldDark)" stroke-width="2"/>`),
  necklace: () => svg(128, 128, `<path d="M20 20 c0 60 88 60 88 0" fill="none" stroke="url(#gold)" stroke-width="8"/><path d="M20 20 c0 60 88 60 88 0" fill="none" stroke="#b8780e" stroke-width="2" stroke-dasharray="4 6"/><path d="M64 66 l18 20 l-18 32 l-18-32z" fill="url(#ice)"/><path d="M46 86 h36" stroke-width="2"/>`),
  orb: () => svg(128, 128, `<path d="M28 116 h72 l-10-20 h-52z" fill="url(#dark)"/><circle cx="64" cy="60" r="44" fill="url(#purple)"/><circle cx="64" cy="60" r="44" fill="url(#glowPurple)" stroke="none"/><path d="M40 50 c10-24 40-24 48 0" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="4"/><circle cx="64" cy="64" r="12" fill="url(#ice)"/>`),
  scroll: () => svg(128, 128, `<path d="M28 28 h72 v72 h-72z" fill="#f4e8d0"/><path d="M20 20 h88 v16 h-88z M20 92 h88 v16 h-88z" rx="8" fill="url(#wood)"/><path d="M40 50 h48 M40 62 h36 M40 74 h44" stroke="#7a4a22" stroke-width="3"/><circle cx="84" cy="70" r="8" fill="url(#red)"/>`),
};

export const ICONS = {
  coin: () => svg(64, 64, `<circle cx="32" cy="34" r="26" fill="url(#goldDark)"/><circle cx="32" cy="30" r="25" fill="url(#gold)"/><circle cx="32" cy="30" r="17" fill="none" stroke="#b8780e" stroke-width="2"/><text x="32" y="38" text-anchor="middle" font-size="22" font-weight="900" fill="#7a4d08" font-family="sans-serif" stroke="none">$</text>`, 2),
  toman: () => svg(64, 64, `<rect x="6" y="18" width="52" height="32" rx="6" fill="#1f6b2a"/><rect x="4" y="14" width="52" height="32" rx="6" fill="url(#green)"/><circle cx="30" cy="30" r="10" fill="#dff7c9" stroke="#2f8f2b" stroke-width="2"/><text x="30" y="36" text-anchor="middle" font-size="15" font-weight="900" fill="#2f8f2b" font-family="sans-serif" stroke="none">T</text>`, 2),
  energy: () => svg(64, 64, `<path d="M36 4 L14 36 h16 l-4 24 l24-34 h-16z" fill="url(#gold)"/>`, 2),
  artifact: () => svg(64, 64, `<path d="M32 6 l22 18 l-22 34 l-22-34z" fill="url(#purple)"/><path d="M10 24 h44 M32 6 l-6 18 l6 34" fill="none" stroke-width="2"/>`, 2),
  level: () => svg(64, 64, `<path d="M32 6 l8 17 l18.6 2.4 l-13.6 13 l3.6 18.6 L32 48 l-16.6 9 l3.6-18.6 l-13.6-13 L24 23z" fill="url(#gold)"/>`, 2),
  pool: () => svg(64, 64, `<path d="M10 24 h44 l-4 26 h-36z" fill="url(#blue)"/><ellipse cx="32" cy="24" rx="24" ry="8" fill="url(#gold)"/><circle cx="22" cy="22" r="4" fill="#fff3b0" stroke="none"/><circle cx="36" cy="20" r="4" fill="#fff3b0" stroke="none"/>`, 2),
  treasure: () => svg(64, 64, `<rect x="8" y="28" width="48" height="26" rx="4" fill="url(#wood)"/><path d="M8 28 a24 16 0 0 1 48 0z" fill="url(#gold)"/><rect x="26" y="24" width="12" height="14" rx="2" fill="#f2b52c"/>`, 2),
  share: () => svg(64, 64, `<path d="M22 6 h8 l4 16 l-8 4z M42 6 h-8 l-4 16 l8 4z" fill="url(#red)"/><circle cx="32" cy="40" r="18" fill="url(#green)"/><path d="M24 40 l6 6 l10-12" fill="none" stroke="#fff" stroke-width="5"/>`, 2),
  season: () => svg(64, 64, `<rect x="12" y="6" width="6" height="54" rx="2" fill="url(#wood)"/><path d="M18 10 h34 l-8 10 l8 10 h-34z" fill="url(#red)"/>`, 2),
  luck: () => svg(64, 64, `<circle cx="22" cy="22" r="12" fill="url(#green)"/><circle cx="42" cy="22" r="12" fill="url(#green)"/><circle cx="22" cy="42" r="12" fill="url(#green)"/><circle cx="42" cy="42" r="12" fill="url(#green)"/><path d="M32 32 l6 24" stroke="#2a6b21" stroke-width="4"/>`, 2),
  army: () => svg(64, 64, `<circle cx="22" cy="20" r="10" fill="url(#skin)"/><circle cx="42" cy="20" r="10" fill="url(#skin)"/><path d="M6 54 c0-12 8-18 16-18 s16 6 16 18z M26 54 c0-12 8-18 16-18 s16 6 16 18z" fill="url(#blue)"/>`, 2),
  home: () => svg(64, 64, `<path d="M8 32 L32 10 l24 22" fill="none" stroke="url(#red)" stroke-width="8"/><path d="M16 30 v26 h32 v-26" fill="url(#gold)"/><rect x="26" y="38" width="12" height="18" fill="#5a3717"/>`, 2),
};
