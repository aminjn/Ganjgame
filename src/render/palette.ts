// پالت زمین — اشباع ولی طبیعی، کم‌کنتراست (سند اول، هدف بصری)
import { Color } from 'three';
import type { Terrain } from '../rules/constants';

export const GROUND: Record<Terrain, Color> = {
  safe:     new Color('#a6cf68'),  // چمن روشن و آرام
  plain:    new Color('#7cc353'),  // سبز تازه‌ی چمن
  mountain: new Color('#a49a8e'),  // سنگ خاکستری‌قهوه‌ای غبارگرفته
  marsh:    new Color('#5b7a52'),  // سبز تیره‌ی کم‌اشباع (کناره)
  danger:   new Color('#7c5346'),  // قرمز‌قهوه‌ای مات
  hell:     new Color('#5e3d36'),
  tomb:     new Color('#8a7f97'),
  treasure: new Color('#d9bf72'),
  valley:   new Color('#45414a'),
};
export const MARSH_FLOOR = new Color('#46603f');
export const DIRT = new Color('#cfa66a');   // خاکی گرم (لکه‌های میان چمن)
export const SNOW = new Color('#e9e6dc');   // قله‌ی روشن
export const WATER = new Color('#3e7a6e');
export const ROCK_TINT = new Color('#b9b0a6');
export const HELL_ROCK_TINT = new Color('#6e5550');
export const DANGER_LEAF_TINT = new Color('#c48a5a');
export const MARSH_LEAF_TINT = new Color('#8fa06a');

// تعاملی‌ها روشن‌تر و پرکنتراست‌تر از زمین
export const PLAYER_COLOR = new Color('#ffd54a');
export const CLAN_COLOR = new Color('#4fd6ff');
export const SELECT_COLOR = new Color('#ffffff');
export const TOMB_GLOW = new Color('#b06cff');
export const TREASURE_GLOW = new Color('#ffcf3a');
export const PATH_COLOR = new Color('#fff1b0');
