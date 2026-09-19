// تولید همه‌ی اسپرایت‌های وکتوری بازی → public/assets/sprites + manifest.json
import sharp from 'sharp';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { unit, UNIT_TYPES } from './art/units.mjs';
import { MONSTERS } from './art/monsters.mjs';
import { BUILDINGS, SCENERY, ARTIFACTS, ICONS } from './art/props.mjs';

const root = 'public/assets/sprites';
for (const d of ['units', 'monsters', 'buildings', 'scenery', 'artifacts', 'icons', 'frames', 'tiles', 'markers', 'ground']) rmSync(`${root}/${d}`, { recursive: true, force: true });
for (const d of ['units', 'monsters', 'buildings', 'scenery', 'artifacts', 'icons']) mkdirSync(`${root}/${d}`, { recursive: true });
const manifest = { units: {}, monsters: {}, buildings: {}, scenery: {}, artifacts: {}, icons: {} };
const png = (svgText, file) => sharp(Buffer.from(svgText)).png().toFile(file);
const H = { units: { idle: 1.15, walk: 1.15 }, monsters: { plain: 1.1, mountain: 1.4, marsh: 1.15, danger: 1.3, hell: 1.45, tomb: 1.35, treasure: 1.7 },
  buildings: { camp: 2.9, clan_camp: 2.9, tomb: 2.6, treasure: 2.7, caravan: 1.4, tower: 0.95, tower_clan: 0.95 },
  scenery: { tree: 1.2, tree2: 1.25, dead_tree: 1.1, bush: 0.6, rock: 0.55, big_rock: 0.95, grass: 0.4, flower: 0.5, mushroom: 0.45, bones: 0.35, ruin: 0.95, sign: 0.65, pond: 0.75, fire: 0.6, crystal: 0.85, statue: 1.05 } };

// نیروها: idle + شیت ۴ فریمی راه‌رفتن
for (const t of UNIT_TYPES) {
  await png(unit(t), `${root}/units/${t}_idle.png`);
  const frames = await Promise.all([0, 1, 2, 3].map(i => sharp(Buffer.from(unit(t, i))).png().toBuffer()));
  await sharp({ create: { width: 512 * 4, height: 640, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, i) => ({ input, left: i * 512, top: 0 }))).png().toFile(`${root}/units/${t}_walk.png`);
  manifest.units[t] = { idle: { file: `units/${t}_idle.png`, w: +(H.units.idle * 0.8).toFixed(2), h: H.units.idle }, walk: { file: `units/${t}_walk.png`, w: +(H.units.walk * 0.8).toFixed(2), h: H.units.walk, frames: 4, cols: 4, fps: 6 } };
  console.log('unit', t);
}
const doSet = async (group, gen, dir) => {
  for (const [name, fn] of Object.entries(gen)) {
    const s = fn(); const file = `${dir}/${name}.png`;
    await png(s, `${root}/${file}`);
    const m = await sharp(`${root}/${file}`).metadata();
    const h = H[group]?.[name] ?? 1; manifest[group][name] = { file, w: +(h * m.width / m.height).toFixed(2), h };
    console.log(group, name);
  }
};
await doSet('monsters', MONSTERS, 'monsters');
await doSet('buildings', BUILDINGS, 'buildings');
await doSet('scenery', SCENERY, 'scenery');
await doSet('artifacts', ARTIFACTS, 'artifacts');
await doSet('icons', ICONS, 'icons');
writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log('manifest written');
