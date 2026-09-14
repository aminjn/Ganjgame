// پالت به سبک Clash of Clans: سبز اشباع و تمیز، آب فیروزه‌ای، شن روشن، سنگ روشن؛ همچنان کم‌جزئیات تا با نیروها رقابت نکند.
import { Color } from 'three';
import type { Terrain } from '../rules/constants';

export const GROUND: Record<Terrain, Color> = {
  safe:     new Color('#a4c74d'),
  plain:    new Color('#8fbc42'),
  mountain: new Color('#8e8778'),
  marsh:    new Color('#4c8f68'),
  danger:   new Color('#9a4b45'),
  hell:     new Color('#6b302b'),
  tomb:     new Color('#7d6483'),
  treasure: new Color('#c99b4a'),
  valley:   new Color('#4d4749'),
};
export const GRASS_DARK = new Color('#7aa93a');   // لکه‌های چمن تیره‌تر (الگوی کاشیِ نرم)
export const MARSH_FLOOR = new Color('#3d7a5c');
export const SAND = new Color('#e7d59a');
export const DIRT = new Color('#d5b371');
export const SNOW = new Color('#f2f0ea');
export const WATER = new Color('#3aa4a0');
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
