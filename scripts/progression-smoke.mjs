// Smoke test for the meta-progression money/upgrade math (pure logic, no DOM).
import {
  UPGRADES,
  PAINTS,
  upgradeCost,
  computeStatModifiers,
  creditsFromRun,
} from '../client/src/config/upgrades.js';
import { Progression } from '../client/src/core/progression.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function approx(actual, expected, tol, label) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// In-memory localStorage stand-in.
function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// ── 1. Cost curve is monotonic increasing and null at max ─────────────────────
for (const up of UPGRADES) {
  let prev = -1;
  for (let lvl = 0; lvl < up.maxLevel; lvl++) {
    const cost = upgradeCost(up, lvl);
    assert(Number.isFinite(cost) && cost > 0, `${up.id} cost@${lvl} must be positive`);
    assert(cost > prev, `${up.id} cost must increase (lvl ${lvl})`);
    prev = cost;
  }
  assert(upgradeCost(up, up.maxLevel) === null, `${up.id} cost at max must be null`);
}

// ── 2. Stat modifiers accumulate per level ────────────────────────────────────
const engine = UPGRADES.find((u) => u.id === 'engine');
const m0 = computeStatModifiers({});
assert(m0.maxSpeed === 0 && m0.boostSpeed === 0, 'no upgrades → zero mods');
const m3 = computeStatModifiers({ engine: 3 });
approx(m3.maxSpeed, engine.perLevel.maxSpeed * 3, 1e-9, 'engine maxSpeed mod');
approx(m3.boostSpeed, engine.perLevel.boostSpeed * 3, 1e-9, 'engine boostSpeed mod');
// Levels clamp to maxLevel.
const mOver = computeStatModifiers({ engine: 999 });
approx(mOver.maxSpeed, engine.perLevel.maxSpeed * engine.maxLevel, 1e-9, 'engine mod clamps to max');

// ── 3. Credits formula ────────────────────────────────────────────────────────
assert(creditsFromRun({ score: 0, cleanSectors: 0 }) === 0, 'zero run → zero credits');
assert(creditsFromRun({ score: 12000, cleanSectors: 2 }) === 1000 + 80, 'credit math');

// ── 4. Buy flow: spend, level up, persist, reject when broke ─────────────────
const store = mockStorage();
let prog = new Progression(store);
assert(prog.credits === 0, 'fresh save starts at 0');
assert(!prog.buyUpgrade('engine'), 'cannot buy with no credits');

prog.award(5000);
assert(prog.credits === 5000, 'award adds credits');
const cost0 = prog.nextUpgradeCost('engine');
assert(prog.buyUpgrade('engine'), 'buy engine L1');
assert(prog.getUpgradeLevel('engine') === 1, 'engine now L1');
assert(prog.credits === 5000 - cost0, 'credits deducted by exact cost');

// Persistence: a new instance over the same storage reflects the purchase.
prog.save();
const reloaded = new Progression(store);
assert(reloaded.getUpgradeLevel('engine') === 1, 'purchase persisted across reload');
assert(reloaded.credits === 5000 - cost0, 'credit balance persisted');

// ── 5. Paint: owned free default, buy/equip, reject unaffordable ──────────────
let p2 = new Progression(mockStorage());
assert(p2.ownsPaint('classic'), 'classic owned by default');
assert(p2.activePaint === 'classic', 'classic active by default');
const cyan = PAINTS.find((p) => p.id === 'cyan');
assert(!p2.buyPaint('cyan'), 'cannot buy paint when broke');
p2.award(cyan.cost);
assert(p2.buyPaint('cyan'), 'buy cyan');
assert(p2.ownsPaint('cyan') && p2.credits === 0, 'cyan owned, credits spent');
assert(p2.setActivePaint('cyan'), 'equip cyan');
assert(p2.activePaintFilter() === cyan.filter, 'active filter matches cyan');
assert(!p2.setActivePaint('gold'), 'cannot equip unowned paint');

// ── 6. Corrupt save degrades gracefully ──────────────────────────────────────
const corrupt = mockStorage();
corrupt.setItem('freewayProgress', '{not valid json');
const safe = new Progression(corrupt);
assert(safe.credits === 0 && safe.ownsPaint('classic'), 'corrupt save → clean defaults');

console.log('Progression smoke passed');
