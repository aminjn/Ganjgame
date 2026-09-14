// آیکون‌های SVG منابع و نیروها به سبک CoC: حجیم، گرادیانی، با خط دور تیره.
const defs = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <defs>
    <linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="0.55" stop-color="#f2b52c"/><stop offset="1" stop-color="#c98a12"/></linearGradient>
    <linearGradient id="g-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9df07a"/><stop offset="0.6" stop-color="#57c34a"/><stop offset="1" stop-color="#2f8f2b"/></linearGradient>
    <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd8ff"/><stop offset="0.6" stop-color="#3fa9f5"/><stop offset="1" stop-color="#1d6fb8"/></linearGradient>
    <linearGradient id="g-purple" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6b8ff"/><stop offset="0.6" stop-color="#9b6cf0"/><stop offset="1" stop-color="#5f3aa8"/></linearGradient>
    <linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8f"/><stop offset="0.6" stop-color="#e5453d"/><stop offset="1" stop-color="#a3261f"/></linearGradient>
    <linearGradient id="g-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c78a4e"/><stop offset="1" stop-color="#7a4a22"/></linearGradient>
    <linearGradient id="g-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8eef5"/><stop offset="0.6" stop-color="#9fb0c4"/><stop offset="1" stop-color="#5b6b80"/></linearGradient>
  </defs>
  <!-- سکه -->
  <symbol id="i-coin" viewBox="0 0 32 32"><ellipse cx="16" cy="17" rx="13" ry="12" fill="#8a5c0b"/><circle cx="16" cy="15" r="12.5" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2"/><circle cx="16" cy="15" r="8" fill="none" stroke="#b57a12" stroke-width="1.6"/><text x="16" y="20" text-anchor="middle" font-size="12" font-weight="900" fill="#7a4d08" font-family="sans-serif">$</text><ellipse cx="11" cy="9" rx="3.5" ry="2" fill="#fff6c8" opacity="0.8"/></symbol>
  <!-- تومان (اسکناس) -->
  <symbol id="i-toman" viewBox="0 0 32 32"><rect x="3" y="9" width="26" height="16" rx="3" fill="#1f6b2a"/><rect x="2" y="7" width="26" height="16" rx="3" fill="url(#g-green)" stroke="#164d1c" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#dff7c9" stroke="#2f8f2b" stroke-width="1.5"/><text x="15" y="18" text-anchor="middle" font-size="8" font-weight="900" fill="#2f8f2b" font-family="sans-serif">T</text></symbol>
  <!-- استخر جایزه (دیگ طلا) -->
  <symbol id="i-pool" viewBox="0 0 32 32"><path d="M6 14h20l-2 13H8z" fill="#3b2a12"/><path d="M5 12h22l-2 13H7z" fill="url(#g-blue)" stroke="#123a5e" stroke-width="2"/><ellipse cx="16" cy="12" rx="12" ry="4" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2"/><circle cx="11" cy="11" r="2" fill="#fff3b0"/><circle cx="18" cy="10" r="2" fill="#fff3b0"/><circle cx="22" cy="12" r="1.6" fill="#fff3b0"/></symbol>
  <!-- گنج (صندوق) -->
  <symbol id="i-treasure" viewBox="0 0 32 32"><rect x="4" y="14" width="24" height="13" rx="2" fill="url(#g-wood)" stroke="#3b2a12" stroke-width="2"/><path d="M4 14a12 8 0 0 1 24 0z" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2"/><rect x="13" y="12" width="6" height="7" rx="1" fill="#f2b52c" stroke="#5a3a06" stroke-width="1.5"/><circle cx="16" cy="16" r="1.4" fill="#5a3a06"/></symbol>
  <!-- آرتیفکت (گوهر بنفش) -->
  <symbol id="i-artifact" viewBox="0 0 32 32"><path d="M16 3l11 9-11 17L5 12z" fill="url(#g-purple)" stroke="#3a2170" stroke-width="2" stroke-linejoin="round"/><path d="M5 12h22" stroke="#3a2170" stroke-width="1.5"/><path d="M11 12l5 17 5-17" fill="none" stroke="#3a2170" stroke-width="1.2"/><path d="M9 11l4-6" stroke="#f3e8ff" stroke-width="2" opacity="0.8"/></symbol>
  <!-- جایزه‌ی مشارکت (مدال سبز) -->
  <symbol id="i-share" viewBox="0 0 32 32"><path d="M11 3h4l2 8-4 2zM21 3h-4l-2 8 4 2z" fill="url(#g-red)" stroke="#6e1712" stroke-width="1.5"/><circle cx="16" cy="20" r="9" fill="url(#g-green)" stroke="#1d5a1a" stroke-width="2"/><path d="M12 20l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <!-- سطح (ستاره) -->
  <symbol id="i-level" viewBox="0 0 32 32"><path d="M16 3l4 8.5 9.3 1.2-6.8 6.5 1.8 9.3L16 24l-8.3 4.5 1.8-9.3-6.8-6.5L12 11.5z" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2" stroke-linejoin="round"/></symbol>
  <!-- فصل (پرچم) -->
  <symbol id="i-season" viewBox="0 0 32 32"><rect x="6" y="3" width="3" height="27" rx="1" fill="url(#g-wood)" stroke="#3b2a12" stroke-width="1.5"/><path d="M9 5h17l-4 5 4 5H9z" fill="url(#g-red)" stroke="#6e1712" stroke-width="1.8" stroke-linejoin="round"/></symbol>
  <!-- انرژی -->
  <symbol id="i-energy" viewBox="0 0 32 32"><path d="M18 2L7 18h8l-2 12 12-17h-8z" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2" stroke-linejoin="round"/></symbol>
  <!-- شانس (شبدر) -->
  <symbol id="i-luck" viewBox="0 0 32 32"><circle cx="11" cy="11" r="6" fill="url(#g-green)" stroke="#1d5a1a" stroke-width="1.8"/><circle cx="21" cy="11" r="6" fill="url(#g-green)" stroke="#1d5a1a" stroke-width="1.8"/><circle cx="11" cy="21" r="6" fill="url(#g-green)" stroke="#1d5a1a" stroke-width="1.8"/><circle cx="21" cy="21" r="6" fill="url(#g-green)" stroke="#1d5a1a" stroke-width="1.8"/><path d="M16 16l3 12" stroke="#1d5a1a" stroke-width="2"/></symbol>
  <!-- نیروها -->
  <symbol id="i-soldier" viewBox="0 0 32 32"><path d="M8 24l12-12 3 3-12 12z" fill="url(#g-steel)" stroke="#2a3340" stroke-width="1.8"/><path d="M19 9l4 4" stroke="#2a3340" stroke-width="3" stroke-linecap="round"/><path d="M5 27l4-4 2 2-4 4z" fill="url(#g-wood)" stroke="#3b2a12" stroke-width="1.5"/></symbol>
  <symbol id="i-guard" viewBox="0 0 32 32"><path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="url(#g-blue)" stroke="#123a5e" stroke-width="2" stroke-linejoin="round"/><path d="M16 7v18M8 14h16" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/></symbol>
  <symbol id="i-archer" viewBox="0 0 32 32"><path d="M9 4c10 3 10 21 0 24" fill="none" stroke="url(#g-wood)" stroke-width="3.5" stroke-linecap="round"/><path d="M9 4v24" stroke="#e8eef5" stroke-width="1.5"/><path d="M9 16h18" stroke="#2a3340" stroke-width="2.2" stroke-linecap="round"/><path d="M27 16l-5-3v6z" fill="url(#g-steel)" stroke="#2a3340" stroke-width="1.2"/></symbol>
  <symbol id="i-explorer" viewBox="0 0 32 32"><circle cx="13" cy="13" r="8" fill="none" stroke="#2a3340" stroke-width="3"/><circle cx="13" cy="13" r="8" fill="url(#g-blue)" opacity="0.5"/><path d="M19 19l8 8" stroke="url(#g-wood)" stroke-width="4" stroke-linecap="round"/><path d="M19 19l8 8" stroke="#3b2a12" stroke-width="1.2"/></symbol>
  <symbol id="i-guide" viewBox="0 0 32 32"><path d="M16 4l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="1.8" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.5" fill="#fff3b0" stroke="#5a3a06" stroke-width="1"/></symbol>
  <symbol id="i-army" viewBox="0 0 32 32"><circle cx="11" cy="10" r="5" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="1.8"/><circle cx="21" cy="10" r="5" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="1.8"/><path d="M3 27c0-6 4-9 8-9s8 3 8 9zM13 27c0-6 4-9 8-9s8 3 8 9z" fill="url(#g-blue)" stroke="#123a5e" stroke-width="1.8"/></symbol>
  <symbol id="i-home" viewBox="0 0 32 32"><path d="M4 16L16 5l12 11" fill="none" stroke="#6e1712" stroke-width="4" stroke-linejoin="round"/><path d="M4 16L16 5l12 11" fill="none" stroke="url(#g-red)" stroke-width="2"/><path d="M8 15v13h16V15" fill="url(#g-gold)" stroke="#5a3a06" stroke-width="2"/><rect x="13" y="19" width="6" height="9" fill="#5a3a06"/></symbol>
</svg>`;

export function injectIcons() { if (!document.getElementById('ganj-icons')) { const d = document.createElement('div'); d.id = 'ganj-icons'; d.innerHTML = defs; document.body.prepend(d); } }
export function ico(name: string, cls = ''): string { return `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
export const UNIT_ICON: Record<string, string> = { soldier: 'soldier', guard: 'guard', archer: 'archer', explorer: 'explorer', guide: 'guide' };
