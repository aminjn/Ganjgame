// پالت به سبک Clash of Clans: سبز اشباع و تمیز، آب فیروزه‌ای، شن روشن، سنگ روشن؛ همچنان کم‌جزئیات تا با نیروها رقابت نکند.
import { Color } from 'three';
import type { Terrain } from '../rules/constants';

export const GROUND: Record<Terrain, Color> = {
  safe:     new Color('#a9d452'),
  plain:    new Color('#8ec946'),
  mountain: new Color('#a39c8c'),
  marsh:    new Color('#5c7a3a'),
  danger:   new Color('#b0553f'),
  hell:     new Color('#7a3328'),
  tomb:     new Color('#8a6f96'),
  treasure: new Color('#d9b45a'),
  valley:   new Color('#3e3836'),
};
export const GRASS_DARK = new Color('#7fbf3a');   // لکه‌های چمن تیره‌تر (الگوی کاشیِ نرم)
export const MARSH_FLOOR = new Color('#4f6b30');
export const SAND = new Color('#e9d68f');
export const DIRT = new Color('#d5b371');
export const SNOW = new Color('#f2f0ea');
export const WATER = new Color('#4d7a3e');
export const ROCK_TINT = new Color('#c4bcb1');
export const HELL_ROCK_TINT = new Color('#7a5f5a');
export const DANGER_LEAF_TINT = new Color('#c48a5a');
export const MARSH_LEAF_TINT = new Color('#8fa06a');

export const PLAYER_COLOR = new Color('#ffd54a');
export const CLAN_COLOR = new Color('#4fd6ff');
export const SELECT_COLOR = new Color('#ffffff');
export const TOMB_GLOW = new Color('#b06cff');
export const TREASURE_GLOW = new Color('#ffcf3a');
export const PATH_COLOR = new Color('#fff1b0');
