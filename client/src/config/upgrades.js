// Meta-progression data: stat upgrades + cosmetic paint jobs. Pure data + pure
// helpers (no DOM, no storage) so it can be unit-tested and reasoned about in isolation.
// Persistence lives in core/progression.js; gameplay wiring reads computeStatModifiers().

// Each upgrade track has discrete levels. `cost(level)` is the price to buy the NEXT
// level from the given current level (0-based). `perLevel` describes the stat delta
// applied per owned level; effects are summed in computeStatModifiers().
export const UPGRADES = [
  {
    id: 'engine',
    label: 'ENGINE',
    blurb: 'Higher top speed (and a faster boost).',
    maxLevel: 5,
    baseCost: 800,
    costMult: 1.7,
    // +4 cruise / +5 boost top speed per level
    perLevel: { maxSpeed: 4, boostSpeed: 5 },
  },
  {
    id: 'turbo',
    label: 'TURBO TANK',
    blurb: 'Boost lasts longer.',
    maxLevel: 5,
    baseCost: 700,
    costMult: 1.7,
    perLevel: { boostDuration: 0.35 },
  },
  {
    id: 'recharge',
    label: 'QUICK CHARGE',
    blurb: 'Boost recharges sooner.',
    maxLevel: 5,
    baseCost: 700,
    costMult: 1.7,
    perLevel: { boostCooldown: -0.4 },
  },
  {
    id: 'fuel',
    label: 'RESERVE TANK',
    blurb: 'More time on the clock each run.',
    maxLevel: 5,
    baseCost: 750,
    costMult: 1.7,
    perLevel: { startTime: 3 },
  },
];

// Cosmetic hero paints. `classic` is owned free; the rest cost a one-time unlock.
// `filter` is applied to #hero (a red base sprite) via CSS filter.
export const PAINTS = [
  { id: 'classic', label: 'CLASSIC', cost: 0, filter: 'none' },
  { id: 'cyan', label: 'CYAN', cost: 600, filter: 'hue-rotate(150deg) saturate(1.15)' },
  { id: 'gold', label: 'GOLD', cost: 900, filter: 'hue-rotate(35deg) saturate(1.5) brightness(1.12)' },
  { id: 'violet', label: 'VIOLET', cost: 1200, filter: 'hue-rotate(255deg) saturate(1.25)' },
  { id: 'mono', label: 'MONO', cost: 1500, filter: 'grayscale(1) brightness(1.18) contrast(1.1)' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export const PAINT_BY_ID = Object.fromEntries(PAINTS.map((p) => [p.id, p]));

// Price to buy the next level given the current owned level. Returns null at max.
export function upgradeCost(upgrade, currentLevel) {
  if (!upgrade || currentLevel >= upgrade.maxLevel) return null;
  return Math.round(upgrade.baseCost * Math.pow(upgrade.costMult, currentLevel));
}

// Sum the per-level deltas across all owned upgrade levels into a flat modifier object.
export function computeStatModifiers(levels = {}) {
  const mods = { maxSpeed: 0, boostSpeed: 0, boostDuration: 0, boostCooldown: 0, startTime: 0 };
  for (const up of UPGRADES) {
    const lvl = Math.max(0, Math.min(up.maxLevel, levels[up.id] | 0));
    for (const [key, delta] of Object.entries(up.perLevel)) {
      mods[key] += delta * lvl;
    }
  }
  return mods;
}

// Credits awarded for a finished run.
export function creditsFromRun({ score = 0, cleanSectors = 0 } = {}) {
  return Math.max(0, Math.floor(score / 12) + cleanSectors * 40);
}
