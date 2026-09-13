// سطح ۲ با ۱۲۰ تجربه و نیاز هر سطح ۱٫۵ برابر سطح قبل (گرد به بالا).
// اندازه‌گیری‌شده: سطح ۵ = ۹۷۵ · سطح ۷ = ۲٬۴۹۵ · سطح ۱۰ = ۸٬۹۹۳ · سطح ۱۲ = ۲۰٬۵۳۶.

export function xpNeedForLevel(level: number, xpLevel2 = 120, growth = 1.5): number {
  if (level <= 1) return 0;
  let need = xpLevel2;
  for (let l = 3; l <= level; l++) need = Math.ceil(need * growth);
  return need;
}

export function cumulativeXp(level: number, xpLevel2 = 120, growth = 1.5): number {
  let sum = 0;
  for (let l = 2; l <= level; l++) sum += xpNeedForLevel(l, xpLevel2, growth);
  return sum;
}

export function levelForXp(xp: number, xpLevel2 = 120, growth = 1.5): number {
  let level = 1;
  while (level < 60 && xp >= cumulativeXp(level + 1, xpLevel2, growth)) level++;
  return level;
}

export function xpProgress(xp: number, xpLevel2 = 120, growth = 1.5): { level: number; into: number; need: number } {
  const level = levelForXp(xp, xpLevel2, growth);
  const base = cumulativeXp(level, xpLevel2, growth);
  const need = xpNeedForLevel(level + 1, xpLevel2, growth);
  return { level, into: xp - base, need };
}
