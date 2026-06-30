import {
  UPGRADE_BY_ID,
  PAINT_BY_ID,
  PAINTS,
  upgradeCost,
  computeStatModifiers,
} from '../config/upgrades.js';

const STORAGE_KEY = 'freewayProgress';
const SCHEMA_VERSION = 1;

// Owns the persistent meta-progression save: credits balance, owned upgrade levels,
// unlocked + active paint. Pure logic over localStorage — no DOM. The engine reads
// statModifiers() to tune a run and calls award()/buyUpgrade()/buyPaint() at the
// appropriate moments.
export class Progression {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.data = this._load();
  }

  _defaults() {
    return {
      version: SCHEMA_VERSION,
      credits: 0,
      upgrades: {}, // { [upgradeId]: level }
      paints: ['classic'], // owned paint ids
      activePaint: 'classic',
    };
  }

  _load() {
    const base = this._defaults();
    if (!this.storage) return base;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      // Shallow, defensive merge so older/partial saves don't crash.
      const data = { ...base, ...parsed };
      data.upgrades = { ...(parsed.upgrades || {}) };
      data.paints = Array.isArray(parsed.paints) && parsed.paints.length
        ? [...new Set(['classic', ...parsed.paints])]
        : ['classic'];
      if (!PAINT_BY_ID[data.activePaint] || !data.paints.includes(data.activePaint)) {
        data.activePaint = 'classic';
      }
      data.credits = Math.max(0, parsed.credits | 0);
      return data;
    } catch (e) {
      console.warn('[Progression] failed to load save, starting fresh:', e);
      return base;
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Progression] failed to save:', e);
    }
  }

  // ─── Credits ────────────────────────────────────────────────────────────────
  get credits() {
    return this.data.credits;
  }

  award(amount) {
    const add = Math.max(0, Math.floor(amount || 0));
    this.data.credits += add;
    this.save();
    return add;
  }

  // ─── Upgrades ─────────────────────────────────────────────────────────────────
  getUpgradeLevel(id) {
    return Math.max(0, this.data.upgrades[id] | 0);
  }

  // Cost to buy the next level of an upgrade, or null if maxed.
  nextUpgradeCost(id) {
    const up = UPGRADE_BY_ID[id];
    return up ? upgradeCost(up, this.getUpgradeLevel(id)) : null;
  }

  canAffordUpgrade(id) {
    const cost = this.nextUpgradeCost(id);
    return cost != null && this.data.credits >= cost;
  }

  // Attempts a purchase. Returns true on success.
  buyUpgrade(id) {
    const up = UPGRADE_BY_ID[id];
    if (!up) return false;
    const level = this.getUpgradeLevel(id);
    const cost = upgradeCost(up, level);
    if (cost == null || this.data.credits < cost) return false;
    this.data.credits -= cost;
    this.data.upgrades[id] = level + 1;
    this.save();
    return true;
  }

  // Flat stat deltas from all owned upgrade levels (consumed by the engine's run config).
  statModifiers() {
    return computeStatModifiers(this.data.upgrades);
  }

  // ─── Paints ─────────────────────────────────────────────────────────────────
  ownsPaint(id) {
    return this.data.paints.includes(id);
  }

  buyPaint(id) {
    const paint = PAINT_BY_ID[id];
    if (!paint) return false;
    if (this.ownsPaint(id)) return true; // already owned
    if (this.data.credits < paint.cost) return false;
    this.data.credits -= paint.cost;
    this.data.paints.push(id);
    this.save();
    return true;
  }

  setActivePaint(id) {
    if (!this.ownsPaint(id)) return false;
    this.data.activePaint = id;
    this.save();
    return true;
  }

  get activePaint() {
    return this.data.activePaint;
  }

  activePaintFilter() {
    return (PAINT_BY_ID[this.data.activePaint] || PAINTS[0]).filter;
  }
}

export default Progression;
