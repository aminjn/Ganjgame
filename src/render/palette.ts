// پالت زمین — اشباع ولی طبیعی، کم‌کنتراست (سند اول، هدف بصری)
import { Color } from 'three';
import type { Terrain } from '../rules/constants';

export const GROUND: Record<Terrain, Color> = {
  safe:     new Color('#9cc46a'),  // چمن روشن‌تر و آرام
  plain:    new Color('#7fbf58'),  // سبز تازه‌ی چمن
  mountain: new Color('#a0958a'),  // سنگ خاکستری‌قهوه‌ای غبارگرفته
  marsh:    new Color('#4d6a46'),  // سبز تیره‌ی کم‌اشباع
  danger:   new Color('#8e4e3e'),  // قرمز‌قهوه‌ای مات
  hell:     new Color('#5c3230'),
  tomb:     new Color('#7d6f86'),
  treasure: new Color('#d3b56a'),
  valley:   new Color('#3a373d'),
};
export const DIRT = new Color('#c8a26b');   // خاکی گرم (لکه‌های میان چمن)
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
