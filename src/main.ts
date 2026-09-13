import { Game } from './ui/app';
const game = new Game();
game.boot().catch(err => { console.error(err); document.body.insertAdjacentHTML('beforeend', `<div class="modal"><div class="box"><h2>خطا</h2><pre style="direction:ltr;white-space:pre-wrap">${String(err?.stack || err)}</pre></div></div>`); });
(window as any).ganj = game;
