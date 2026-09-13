// استخر جایزه و ارزش جایزه‌ها — تقسیم ۸۰/۲۰ (ده آرتیفکت ۳۰٪ + گنج ۴۰٪ + مشارکت ۱۰٪)
import type { Settings } from './settings';

export function artifactValue(pool: number, s: Settings): number { return Math.floor(pool * s.artifactShare); }
export function treasureValue(pool: number, s: Settings): number { return Math.max(s.treasureFloor, Math.floor(pool * s.treasureShare)); }
export function participationValue(pool: number, s: Settings): number { return Math.floor(pool * s.participationShare); }
