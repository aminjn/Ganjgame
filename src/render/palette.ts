// پالت به سبک Clash of Clans: سبز اشباع و تمیز، آب فیروزه‌ای، شن روشن، سنگ روشن؛ همچنان کم‌جزئیات تا با نیروها رقابت نکند.
import { Color } from 'three';
import type { Terrain } from '../rules/constants';

export const GROUND: Record<Terrain, Color> = {
  safe:     new Color('#8ed35c'),
  plain:    new Color('#78c447'),
  mountain: new Color('#b3aa9c'),
  marsh:    new Color('#6cb45a'),
  danger:   new Color('#8d6552'),
  hell:     new Color('#66484a'),
  tomb:     new Color('#9e93ad'),
  treasure: new Color('#e6cb7c'),
  valley:   new Color('#4c4650'),
};
export const GRASS_DARK = new Color('#66b23c');   // لکه‌های چمن تیره‌تر (الگوی کاشیِ نرم)
export const MARSH_FLOOR = new Color('#3f8a70');
export const SAND = new Color('#e7d59a');
export const DIRT = new Color('#d5b371');
export const SNOW = new Color('#f2f0ea');
export const WATER = new Color('#3ec6da');
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
