// تنظیمات قابل ویرایش از پنل ادمین. هر مقدار که در پنل ست نشده باشد، پیش‌فرض کد (constants.ts) را می‌گیرد.
import * as C from './constants';

export interface Settings {
  mapId: number;
  speedFactor: number;      // ضریب سرعت بازی (زمان کوچ، پر شدن انرژی، مهلت پیشنهادها)
  startCoins: number;
  moveSeconds: number;
  difficulty: number;
  electionDays: number;
  supply: Record<C.Terrain, number>;
  monsters: Record<C.Terrain, number>;
  gates: { danger: number; tomb: number; treasure: number };
  treasureArtifacts: number;
  unitPrice: Record<C.UnitType, number>;
  unitPower: Record<C.UnitType, number>;
  explorerLuck: number;
  terrainBonus: number;
  energyPerMove: number;
  energyRegen: number;
  restCost: number;
  guidesForHalf: number;
  longMoveMax: number;
  longMoveStep: number;
  lossFloor: number;
  lossBase: number;
  lossExponent: number;
  xpBase: number;
  xpMonsterDiv: number;
  xpTomb: number;
  xpTreasure: number;
  xpLevel2: number;
  xpGrowth: number;
  lootBase: number;
  lootLuckDiv: number;
  lootMax: number;
  tombsVisible: number;
  tombMinDist: number;
  tombMaxDist: number;
  tombSpacing: number;
  campMinDist: number;
  coinToman: number;
  buyCoinsMax: number;
  withdrawMin: number;
  artifactShare: number;
  treasureShare: number;
  treasureFloor: number;
  participationShare: number;
  offerMin: number;
  seasonCloseHours: number;
  clanCreateCost: number;
  clanMaxMembers: number;
  clanDepositUnit: number;
  clanSoldierBuy: number;
  seasonMaxPlayers: number;
  monsterScaleStart: number;
  monsterScaleDiv: number;
  hellMinMult: number;
  hellMaxMult: number;
  valleyBlock: number | null;   // null = مقدار خود نقشه
  dangerBlob: number | null;    // null = مقدار خود نقشه
}

export function defaultSettings(): Settings {
  const supply = {} as Record<C.Terrain, number>;
  const monsters = {} as Record<C.Terrain, number>;
  for (const k of Object.keys(C.TERRAIN) as C.Terrain[]) { supply[k] = C.TERRAIN[k].supply; monsters[k] = C.TERRAIN[k].monsters; }
  const unitPrice = {} as Record<C.UnitType, number>;
  const unitPower = {} as Record<C.UnitType, number>;
  for (const k of Object.keys(C.UNITS) as C.UnitType[]) { unitPrice[k] = C.UNITS[k].price; unitPower[k] = C.UNITS[k].power; }
  return {
    mapId: 1, speedFactor: C.DEFAULT_SPEED_FACTOR, startCoins: C.DEFAULT_START_COINS, moveSeconds: C.MOVE_SECONDS,
    difficulty: C.DEFAULT_DIFFICULTY, electionDays: C.ELECTION_PERIOD_DAYS,
    supply, monsters, gates: { danger: 5, tomb: 7, treasure: 10 }, treasureArtifacts: 3,
    unitPrice, unitPower, explorerLuck: C.UNITS.explorer.luck, terrainBonus: C.TERRAIN_BONUS,
    energyPerMove: C.ENERGY_PER_MOVE, energyRegen: C.ENERGY_REGEN_PER_SEC, restCost: C.REST_COST_PER_ENERGY,
    guidesForHalf: C.GUIDES_FOR_HALF_TIME, longMoveMax: C.LONG_MOVE_MAX, longMoveStep: C.LONG_MOVE_STEP_FACTOR,
    lossFloor: C.LOSS_FLOOR, lossBase: C.LOSS_BASE, lossExponent: C.LOSS_EXPONENT,
    xpBase: C.XP_CAPTURE_BASE, xpMonsterDiv: C.XP_MONSTER_DIV, xpTomb: C.XP_TOMB, xpTreasure: C.XP_TREASURE,
    xpLevel2: C.XP_LEVEL2, xpGrowth: C.XP_GROWTH,
    lootBase: C.LOOT_BASE_CHANCE, lootLuckDiv: C.LOOT_LUCK_DIV, lootMax: C.LOOT_MAX_CHANCE,
    tombsVisible: C.TOMBS_VISIBLE, tombMinDist: C.TOMB_MIN_DIST, tombMaxDist: C.TOMB_MAX_DIST, tombSpacing: C.TOMB_SPACING,
    campMinDist: C.CAMP_MIN_DIST, coinToman: C.COIN_TOMAN, buyCoinsMax: C.BUY_COINS_MAX, withdrawMin: C.WITHDRAW_MIN_TOMAN,
    artifactShare: C.ARTIFACT_SHARE, treasureShare: C.TREASURE_SHARE, treasureFloor: C.TREASURE_FLOOR_TOMAN,
    participationShare: C.PARTICIPATION_SHARE, offerMin: C.OFFER_MIN_TOMAN, seasonCloseHours: C.SEASON_CLOSE_HOURS,
    clanCreateCost: C.CLAN_CREATE_COST, clanMaxMembers: C.CLAN_MAX_MEMBERS, clanDepositUnit: C.CLAN_DEPOSIT_UNIT,
    clanSoldierBuy: C.CLAN_SOLDIER_BUY, seasonMaxPlayers: C.SEASON_MAX_PLAYERS,
    monsterScaleStart: C.MONSTER_SCALE_START, monsterScaleDiv: C.MONSTER_SCALE_DIV,
    hellMinMult: C.HELL_MIN_MULT, hellMaxMult: C.HELL_MAX_MULT, valleyBlock: null, dangerBlob: null,
  };
}

// توضیح هر فیلد برای پنل ادمین: گروه، برچسب، یکا، بازه‌ی پیشنهادی.
export interface FieldMeta { path: string; group: string; label: string; unit: string; min?: number; max?: number; hardMin?: number; hardMax?: number; integer?: boolean; }

export const FIELDS: FieldMeta[] = [
  { path: 'speedFactor', group: 'فصل', label: 'ضریب سرعت بازی', unit: '×', min: 0.1, max: 20, hardMin: 0.000001 },
  { path: 'startCoins', group: 'فصل', label: 'سکه‌ی آغازین', unit: 'سکه', min: 0, max: 100000, hardMin: 0, integer: true },
  { path: 'moveSeconds', group: 'فصل', label: 'زمان پایه‌ی هر کوچ', unit: 'ثانیه', min: 5, max: 600, hardMin: 0.000001 },
  { path: 'difficulty', group: 'فصل', label: 'ضریب سختی', unit: '×', min: 0.25, max: 4, hardMin: 0.000001 },
  { path: 'electionDays', group: 'فصل', label: 'دوره‌ی رأی‌گیری کلن', unit: 'روز', min: 1, max: 60, hardMin: 0.000001 },
  { path: 'seasonCloseHours', group: 'فصل', label: 'مهلت بستن فصل پس از گنج', unit: 'ساعت', min: 1, max: 168, hardMin: 0 },
  { path: 'seasonMaxPlayers', group: 'فصل', label: 'ظرفیت فصل', unit: 'نفر', min: 1, max: 100000, hardMin: 1, integer: true },
  ...(['safe','plain','mountain','marsh','danger','tomb','treasure','hell'] as C.Terrain[]).map(t => ({ path: `supply.${t}`, group: 'تدارکات کوچ', label: C.TERRAIN[t].name, unit: 'سکه', min: 1, max: 20, hardMin: 0 })),
  ...(['mountain','marsh','danger','tomb','treasure','hell'] as C.Terrain[]).map(t => ({ path: `monsters.${t}`, group: 'قدرت موجودات', label: C.TERRAIN[t].name, unit: 'قدرت', min: 1, max: 5000, hardMin: 0 })),
  { path: 'monsterScaleStart', group: 'قدرت موجودات', label: 'آغاز تشدید نزدیک مرکز', unit: 'خانه', min: 0, max: 500, hardMin: 0, hardMax: 707 },
  { path: 'monsterScaleDiv', group: 'قدرت موجودات', label: 'مقسوم‌علیه تشدید', unit: 'خانه', min: 100, max: 2000, hardMin: 0.000001 },
  { path: 'hellMinMult', group: 'قدرت موجودات', label: 'ضریب جهنمی در لبه', unit: '×', min: 1, max: 3, hardMin: 0 },
  { path: 'hellMaxMult', group: 'قدرت موجودات', label: 'ضریب جهنمی در مرکز', unit: '×', min: 1, max: 5, hardMin: 0 },
  { path: 'gates.danger', group: 'دروازه‌های سطح', label: 'سرزمین خطر', unit: 'سطح', min: 1, max: 30, hardMin: 1, integer: true },
  { path: 'gates.tomb', group: 'دروازه‌های سطح', label: 'مقبره', unit: 'سطح', min: 1, max: 30, hardMin: 1, integer: true },
  { path: 'gates.treasure', group: 'دروازه‌های سطح', label: 'گنج اصلی و جهنمی', unit: 'سطح', min: 1, max: 30, hardMin: 1, integer: true },
  { path: 'treasureArtifacts', group: 'دروازه‌های سطح', label: 'آرتیفکت لازم برای گنج', unit: 'عدد', min: 0, max: 10, hardMin: 0, hardMax: 10, integer: true },
  ...(Object.keys(C.UNITS) as C.UnitType[]).map(u => ({ path: `unitPrice.${u}`, group: 'نیروها', label: `قیمت ${C.UNITS[u].name}`, unit: 'سکه', min: 1, max: 100, hardMin: 0 })),
  ...(Object.keys(C.UNITS) as C.UnitType[]).map(u => ({ path: `unitPower.${u}`, group: 'نیروها', label: `قدرت ${C.UNITS[u].name}`, unit: 'قدرت', min: 1, max: 100, hardMin: 0 })),
  { path: 'explorerLuck', group: 'نیروها', label: 'شانس هر کاوشگر', unit: 'شانس', min: 0, max: 5, hardMin: 0 },
  { path: 'terrainBonus', group: 'نیروها', label: 'برتری زمین', unit: '×', min: 1, max: 3, hardMin: 0 },
  { path: 'guidesForHalf', group: 'نیروها', label: 'راهبلد لازم برای نصف شدن زمان', unit: 'نفر', min: 100, max: 100000, hardMin: 1 },
  { path: 'energyPerMove', group: 'انرژی', label: 'انرژی هر کوچ', unit: 'واحد', min: 1, max: 100, hardMin: 0 },
  { path: 'energyRegen', group: 'انرژی', label: 'پر شدن انرژی', unit: 'واحد/ثانیه', min: 0.01, max: 20, hardMin: 0 },
  { path: 'restCost', group: 'انرژی', label: 'هزینه‌ی استراحت فوری', unit: 'سکه/واحد', min: 0, max: 5, hardMin: 0 },
  { path: 'longMoveMax', group: 'کوچ', label: 'حداکثر کوچ بلند', unit: 'خانه', min: 1, max: 100, hardMin: 1, integer: true },
  { path: 'longMoveStep', group: 'کوچ', label: 'ضریب هر خانه‌ی کوچ بلند', unit: '×', min: 0, max: 1, hardMin: 0 },
  { path: 'lossFloor', group: 'جنگ', label: 'کف تلفات', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'lossBase', group: 'جنگ', label: 'پایه‌ی تلفات', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'lossExponent', group: 'جنگ', label: 'توان تلفات', unit: 'توان', min: 0.1, max: 2, hardMin: 0 },
  { path: 'lootBase', group: 'جنگ', label: 'شانس پایه‌ی شیء', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'lootLuckDiv', group: 'جنگ', label: 'مقسوم‌علیه شانس لشگر', unit: 'شانس', min: 1, max: 100000, hardMin: 0.000001 },
  { path: 'lootMax', group: 'جنگ', label: 'سقف شانس شیء', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'xpBase', group: 'تجربه و سطح', label: 'تجربه‌ی پایه‌ی تصاحب', unit: 'تجربه', min: 0, max: 1000, hardMin: 0 },
  { path: 'xpMonsterDiv', group: 'تجربه و سطح', label: 'مقسوم‌علیه تجربه‌ی موجودات', unit: 'قدرت', min: 1, max: 1000, hardMin: 0.000001 },
  { path: 'xpTomb', group: 'تجربه و سطح', label: 'تجربه‌ی مقبره', unit: 'تجربه', min: 0, max: 100000, hardMin: 0 },
  { path: 'xpTreasure', group: 'تجربه و سطح', label: 'تجربه‌ی گنج اصلی', unit: 'تجربه', min: 0, max: 100000, hardMin: 0 },
  { path: 'xpLevel2', group: 'تجربه و سطح', label: 'تجربه‌ی سطح ۲', unit: 'تجربه', min: 1, max: 100000, hardMin: 0.000001 },
  { path: 'xpGrowth', group: 'تجربه و سطح', label: 'ضریب رشد سطح', unit: '×', min: 1.05, max: 3, hardMin: 1.0000001 },
  { path: 'tombsVisible', group: 'مقبره', label: 'مقبره‌ی نمایان', unit: 'عدد', min: 1, max: 10, hardMin: 1, hardMax: 10, integer: true },
  { path: 'tombMinDist', group: 'مقبره', label: 'کمترین فاصله از مرکز', unit: 'خانه', min: 0, max: 500, hardMin: 0, hardMax: 500 },
  { path: 'tombMaxDist', group: 'مقبره', label: 'بیشترین فاصله از مرکز', unit: 'خانه', min: 0, max: 500, hardMin: 0, hardMax: 500 },
  { path: 'tombSpacing', group: 'مقبره', label: 'فاصله‌ی مقبره‌ها از هم', unit: 'خانه', min: 0, max: 200, hardMin: 0 },
  { path: 'campMinDist', group: 'مقبره', label: 'کمترین فاصله‌ی کمپ اولیه', unit: 'خانه', min: 0, max: 500, hardMin: 0, hardMax: 500 },
  { path: 'coinToman', group: 'اقتصاد', label: 'قیمت هر سکه', unit: 'تومان', min: 1, max: 1000000, hardMin: 1 },
  { path: 'buyCoinsMax', group: 'اقتصاد', label: 'سقف خرید هر بار', unit: 'سکه', min: 1, max: 100000000, hardMin: 1, integer: true },
  { path: 'withdrawMin', group: 'اقتصاد', label: 'حداقل برداشت', unit: 'تومان', min: 0, max: 100000000, hardMin: 0 },
  { path: 'artifactShare', group: 'اقتصاد', label: 'سهم هر آرتیفکت از استخر', unit: 'نسبت', min: 0, max: 0.1, hardMin: 0, hardMax: 1 },
  { path: 'treasureShare', group: 'اقتصاد', label: 'سهم گنج اصلی از استخر', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'treasureFloor', group: 'اقتصاد', label: 'کف گنج اصلی', unit: 'تومان', min: 0, max: 10000000000, hardMin: 0 },
  { path: 'participationShare', group: 'اقتصاد', label: 'سهم جایزه‌ی مشارکت', unit: 'نسبت', min: 0, max: 1, hardMin: 0, hardMax: 1 },
  { path: 'offerMin', group: 'اقتصاد', label: 'حداقل پیشنهاد آرتیفکت', unit: 'تومان', min: 0, max: 100000000, hardMin: 0 },
  { path: 'clanCreateCost', group: 'کلن', label: 'ساخت کلن', unit: 'سکه', min: 0, max: 100000, hardMin: 0 },
  { path: 'clanMaxMembers', group: 'کلن', label: 'سقف اعضا', unit: 'نفر', min: 1, max: 10000, hardMin: 1, integer: true },
  { path: 'clanDepositUnit', group: 'کلن', label: 'واحد واریز به خزانه', unit: 'سکه', min: 1, max: 100000, hardMin: 1 },
  { path: 'clanSoldierBuy', group: 'کلن', label: 'خرید سرباز کلن', unit: 'سکه', min: 1, max: 100000, hardMin: 1 },
];

export function getPath(obj: any, path: string): any { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj: any, path: string, v: any): void {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = v;
}

// اعتبارسنجی سخت: مقادیر مخرب با دلیل رد می‌شوند. برمی‌گرداند null اگر معتبر باشد.
export function validateField(meta: FieldMeta, v: number): string | null {
  if (!Number.isFinite(v)) return 'عدد معتبر نیست';
  if (meta.integer && !Number.isInteger(v)) return 'باید عدد صحیح باشد';
  if (meta.hardMin !== undefined && v < meta.hardMin) {
    if (meta.hardMin === 0) return 'نمی‌تواند منفی باشد (منفی یعنی چاپ پول)';
    if (meta.hardMin > 0 && meta.hardMin < 1) return 'باید بزرگ‌تر از صفر باشد، وگرنه زمان بازی می‌ایستد یا مقسوم‌علیه صفر می‌شود';
    return `کمتر از حد مجاز (${meta.hardMin})`;
  }
  if (meta.hardMax !== undefined && v > meta.hardMax) return `بیشتر از حد مجاز (${meta.hardMax})`;
  return null;
}

// بررسی‌های بین‌فیلدی
export function validateSettings(s: Settings): string[] {
  const errs: string[] = [];
  if (s.tombMaxDist <= s.tombMinDist) errs.push('بیشترین فاصله‌ی مقبره باید از کمترین بزرگ‌تر باشد، وگرنه هیچ مقبره‌ای ساخته نمی‌شود');
  const total = s.treasureShare + 10 * s.artifactShare + s.participationShare;
  if (total > 1 + 1e-9) errs.push(`مجموع جایزه‌ها (${Math.round(total * 100)}٪) نمی‌تواند از ۱۰۰٪ استخر بیشتر شود`);
  if (s.mapId < 1 || s.mapId > 10) errs.push('شناسه‌ی نقشه باید بین ۱ و ۱۰ باشد');
  return errs;
}

// فقط اعدادی که با پیش‌فرض فرق دارند ذخیره می‌شوند (overrides)
export function applyOverrides(overrides: Record<string, number>): Settings {
  const s = defaultSettings();
  for (const [k, v] of Object.entries(overrides)) {
    if (k === 'mapId') { s.mapId = v; continue; }
    if (typeof v === 'number' && Number.isFinite(v)) setPath(s, k, v);
  }
  return s;
}
