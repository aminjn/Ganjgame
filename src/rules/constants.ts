// اعداد پایه‌ی بازی — همه از «سند اول» (بازی گنج — منطق کامل و چک‌لیست قوانین، نسخه‌ی نهایی ۱۳ سپتامبر ۲۰۲۶).
// این مقادیر پیش‌فرض کدند؛ پنل ادمین می‌تواند در زمان اجرا آن‌ها را بازنویسی کند (settings.ts).

export const MAP_SIZE = 1000;
export const CENTER = 500;

export type Terrain =
  | 'safe' | 'plain' | 'mountain' | 'marsh' | 'danger' | 'hell' | 'tomb' | 'treasure' | 'valley';

export interface TerrainRule {
  name: string;
  supply: number;     // تدارکات کوچ (سکه)
  monsters: number;   // قدرت پایه‌ی موجودات
  gate: number;       // حداقل سطح ورود
  needsArtifacts: number;
  passable: boolean;
}

export const TERRAIN: Record<Terrain, TerrainRule> = {
  safe:     { name: 'خانه‌ی امن',        supply: 1,  monsters: 0,   gate: 1,  needsArtifacts: 0, passable: true },
  plain:    { name: 'دشت',              supply: 2,  monsters: 0,   gate: 1,  needsArtifacts: 0, passable: true },
  mountain: { name: 'کوهستان',          supply: 4,  monsters: 120, gate: 1,  needsArtifacts: 0, passable: true },
  marsh:    { name: 'مرداب',            supply: 6,  monsters: 280, gate: 1,  needsArtifacts: 0, passable: true },
  danger:   { name: 'سرزمین خطر',       supply: 8,  monsters: 600, gate: 5,  needsArtifacts: 0, passable: true },
  tomb:     { name: 'مقبره‌ی آرتیفکت',   supply: 8,  monsters: 520, gate: 7,  needsArtifacts: 0, passable: true },
  treasure: { name: 'خانه‌ی گنج اصلی',   supply: 10, monsters: 900, gate: 10, needsArtifacts: 3, passable: true },
  hell:     { name: 'سرزمین جهنمی',     supply: 20, monsters: 600, gate: 10, needsArtifacts: 3, passable: true },
  valley:   { name: 'دره',              supply: 0,  monsters: 0,   gate: 99, needsArtifacts: 0, passable: false },
};

export const SUPPLY_MIN = 1;
export const SUPPLY_MAX = 20;

// قدرت موجودات با نزدیک شدن به مرکز: پایه × (۱ + بیشترِ(۰، ۴۲۰ − فاصله) ÷ ۵۶۰)
export const MONSTER_SCALE_START = 420;
export const MONSTER_SCALE_DIV = 560;

// سرزمین جهنمی: فقط در شعاع (چبیشف) ۲۵ خانه‌ی دور مرکز، ۱٫۱ برابر خطر در لبه تا ۲٫۵ برابر در مرکز، خطی.
export const HELL_RADIUS = 25;
export const HELL_SHARE = 0.47;
export const HELL_MIN_MULT = 1.1;
export const HELL_MAX_MULT = 2.5;

export const VALLEY_MAX_LEN = 30;
export const VALLEY_MIN_LEN = 8;
export const VALLEY_FREE_RADIUS = 30; // تا شعاع ۳۰ خانه‌ی دور مرکز دره نیست
export const VALLEY_BLOCK_CHANCE = 0.75;

export type UnitType = 'explorer' | 'soldier' | 'guide' | 'archer' | 'guard';
export const UNIT_ORDER: UnitType[] = ['explorer', 'guide', 'soldier', 'archer', 'guard']; // ترتیب نگاهبان در تساوی قیمت

export interface UnitRule {
  name: string;
  price: number;
  power: number;
  luck: number;
  bonusTerrains: Terrain[]; // ×۱٫۵
  speed: boolean;
}

export const UNITS: Record<UnitType, UnitRule> = {
  explorer: { name: 'کاوشگر', price: 1, power: 1, luck: 0.6, bonusTerrains: [], speed: false },
  soldier:  { name: 'سرباز',  price: 1, power: 2, luck: 0,   bonusTerrains: [], speed: false },
  guide:    { name: 'راهبلد', price: 1, power: 1, luck: 0,   bonusTerrains: [], speed: true },
  archer:   { name: 'کمانگیر', price: 3, power: 5, luck: 0,  bonusTerrains: ['mountain', 'marsh'], speed: false },
  guard:    { name: 'نگهبان', price: 5, power: 9, luck: 0,   bonusTerrains: ['danger', 'hell', 'tomb', 'treasure'], speed: false },
};
export const TERRAIN_BONUS = 1.5;

export const ENERGY_MAX = 100;
export const ENERGY_PER_MOVE = 12;
export const ENERGY_PER_FREE_TRAVEL_MAX = 40;
export const ENERGY_REGEN_PER_SEC = 0.9;
export const REST_COST_PER_ENERGY = 0.2;
export const ENERGY_WEIGHT_MIN = 0.5;
export const GUIDES_FOR_HALF_TIME = 2000;

export const MOVE_SECONDS = 45;
export const LONG_MOVE_MAX = 20;
export const LONG_MOVE_STEP_FACTOR = 0.1; // ضریب ۱ + ۰٫۱ به‌ازای هر خانه‌ی مسیر
export const MIN_FREE_UNITS_TO_CAPTURE = 2;

export const LOSS_FLOOR = 0.05;
export const LOSS_BASE = 0.5;
export const LOSS_EXPONENT = 0.43;
export const LOSS_RAND_MIN = 1.0;
export const LOSS_RAND_MAX = 1.2;

export const XP_CAPTURE_BASE = 6;
export const XP_MONSTER_DIV = 12;
export const XP_TOMB = 300;
export const XP_TREASURE = 1500;
export const XP_LEVEL2 = 120;
export const XP_GROWTH = 1.5;

export const LOOT_BASE_CHANCE = 0.10;
export const LOOT_LUCK_DIV = 900;
export const LOOT_MAX_CHANCE = 0.5;
export const LOOT_ITEMS: { name: string; value: number }[] = [
  { name: 'سکه‌ی زنگ‌زده', value: 10 }, { name: 'خنجر شکسته', value: 18 }, { name: 'دستبند مسی', value: 25 },
  { name: 'گردنبند استخوانی', value: 35 }, { name: 'سپر چوبی', value: 45 }, { name: 'انگشتر نقره', value: 60 },
  { name: 'طلسم مرداب', value: 75 }, { name: 'شمشیر کهن', value: 90 }, { name: 'گوی یشم', value: 110 },
  { name: 'تاج مسین', value: 130 }, { name: 'کلاه‌خود طلایی', value: 150 }, { name: 'نقشه‌ی پاره', value: 175 },
  { name: 'جام زمرد', value: 200 }, { name: 'صندوقچه‌ی عاج', value: 225 }, { name: 'الماس سرزمین خطر', value: 250 },
];

export const TOMBS_TOTAL = 10;
export const TOMBS_VISIBLE = 4;
export const TOMB_MIN_DIST = 220;
export const TOMB_MAX_DIST = 320;
export const TOMB_SPACING = 40;
export const TOMB_NAMES = [
  'مقبره‌ی کوروش‌بانو', 'مقبره‌ی آرش', 'مقبره‌ی رستم', 'مقبره‌ی سیمرغ', 'مقبره‌ی زال',
  'مقبره‌ی گردآفرید', 'مقبره‌ی کاوه', 'مقبره‌ی فریدون', 'مقبره‌ی سیاوش', 'مقبره‌ی جمشید',
];

export const CAMP_MIN_DIST = 430;
export const CAMP_RANDOM_TRIES = 2000;

export const COIN_TOMAN = 1000;
export const BUY_COINS_MAX = 1_000_000;
export const WITHDRAW_MIN_TOMAN = 100_000;
export const ARTIFACT_SHARE = 0.03;
export const TREASURE_SHARE = 0.40;
export const TREASURE_FLOOR_TOMAN = 200_000_000;
export const PARTICIPATION_SHARE = 0.10;
export const OFFER_MIN_TOMAN = 1000;
export const SEASON_CLOSE_HOURS = 24;

export const CLAN_CREATE_COST = 50;
export const CLAN_MAX_MEMBERS = 100;
export const CLAN_DEPOSIT_UNIT = 500;
export const CLAN_SOLDIER_BUY = 100;
export const ELECTION_PERIOD_DAYS = 7;

export const SEASON_MAX_PLAYERS = 10_000;
export const SUPPORT_MAX_OPEN = 3;

export const DEFAULT_SPEED_FACTOR = 1;
export const DEFAULT_DIFFICULTY = 1;
export const DEFAULT_START_COINS = 0;

// کلیدهای ذخیره‌سازی مشترک بین بازی و پنل ادمین (بند ۱۸ سند اول)
export const KEY_STATE = 'ganj-final-v1';
export const KEY_ADMIN = 'ganj-admin-v1';
export const KEY_ADMIN_CMD = 'ganj-admin-cmd-v1';
export const KEY_SUPPORT = 'ganj-support-v1';
export const KEY_SEASON = 'ganj-season-v1';
export const KEY_LOCK = 'ganj-final-lock-v1';
