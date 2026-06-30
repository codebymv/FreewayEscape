import * as constants from '../config/constants.js';
import { rectFromNormalizedHitbox, rectsOverlap } from './mathUtils.js';

// Road pickups: collectibles that spawn in lanes ahead of the player, ride the same
// world-distance + projection model as traffic, and fire an effect + juice when grabbed.
// Asset-free — rendered as glowing CSS badges. Mixed into GameEngine.prototype; every
// method runs with `this` bound to the engine instance.

// Pickup catalog. `weight` drives spawn frequency; icon/colors are pure CSS.
export const PICKUP_TYPES = [
  { id: 'nitro',   weight: 3, color: '#00ffea', glow: 'rgba(0,255,234,0.9)',  icon: '⚡', label: 'NITRO' },
  { id: 'time',    weight: 3, color: '#7CFF6B', glow: 'rgba(124,255,107,0.9)', icon: '＋', label: '+TIME' },
  { id: 'credits', weight: 3, color: '#FFD700', glow: 'rgba(255,215,0,0.9)',   icon: '◆', label: 'CREDITS' },
  { id: 'shield',  weight: 2, color: '#C46BFF', glow: 'rgba(196,107,255,0.9)', icon: '🛡', label: 'SHIELD' },
];

const PICKUP_CFG = {
  maxActive: 3,
  spawnGapMin: 2600,      // world-distance between pickup spawns
  spawnGapMax: 4600,
  spawnAheadSegments: 6,  // extra segments beyond draw distance so they fade in at the horizon
  despawnBehind: -constants.segL * 3,
  timeBonus: 3,           // seconds (Arcade)
  creditAmount: 150,
};

export const PickupsMixin = {
  _initPickups() {
    this.pickups = [];
    this.pickupElements = new Map(); // id -> element (reused like traffic cars)
    this.pickupNextId = 1;
    this.pickupNextDistance = 0;
    this.shieldCharges = 0;
  },

  // Reset for a fresh run; first pickup appears a bit into the run.
  _resetPickups() {
    if (!this.pickups) this._initPickups();
    this.pickups.length = 0;
    // Drop the element pool so it doesn't grow unbounded across runs.
    if (this.pickupElements) {
      for (const el of this.pickupElements.values()) el.remove();
      this.pickupElements.clear();
    }
    this.pickupNextDistance = (this.totalDistance || 0) + this._pickupSpawnAhead() + 1500;
    this.shieldCharges = 0;
    this._updateShieldHUD();
  },

  _pickupSpawnAhead() {
    return (constants.drawDistance + PICKUP_CFG.spawnAheadSegments) * constants.segL;
  },

  _weightedPickupType() {
    const total = PICKUP_TYPES.reduce((s, t) => s + t.weight, 0);
    let roll = (this._random ? this._random() : Math.random()) * total;
    for (const t of PICKUP_TYPES) {
      roll -= t.weight;
      if (roll <= 0) return t;
    }
    return PICKUP_TYPES[0];
  },

  // Per-frame: spawn ahead, advance relative distance, collect on pass, despawn behind.
  _updatePickups(step) {
    if (!this.inGame) return;
    if (!this.pickups) this._initPickups();
    const playerDistance = this.totalDistance || 0;

    // Spawn while under the active cap and past the next spawn cursor.
    if (this.simTimeMs >= this.trafficGraceUntil &&
        this.pickups.length < PICKUP_CFG.maxActive &&
        playerDistance >= this.pickupNextDistance) {
      this._spawnPickup(playerDistance);
      this.pickupNextDistance = playerDistance + this._pickupSpawnAhead()
        + PICKUP_CFG.spawnGapMin
        + (this._random ? this._random() : Math.random()) * (PICKUP_CFG.spawnGapMax - PICKUP_CFG.spawnGapMin);
    }

    // Advance + despawn. Collection is pixel-accurate (rendered-rect overlap) and runs in
    // _collectPickupsVisual() after the pickups are projected this frame.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.prevRel = Number.isFinite(p.relativeDistance) ? p.relativeDistance : p.worldDistance - playerDistance;
      p.relativeDistance = p.worldDistance - playerDistance;

      if (p.collected || p.relativeDistance < PICKUP_CFG.despawnBehind) {
        this._retirePickup(p);
        this.pickups.splice(i, 1);
      }
    }
  },

  // Pixel-accurate collection: grab a pickup when the hero's rendered hitbox rect overlaps
  // the pickup's rendered badge rect. Runs after _renderPickups (bounds are fresh) and uses
  // the same projection-based hero hitbox as vehicle collisions. Includes the same near-plane
  // lateral fallback as traffic so a pickup driven through at speed can't tunnel uncollected.
  _collectPickupsVisual() {
    if (!this.pickups || !this.inGame || this.pickups.length === 0) return;
    if (this.simTimeMs < this.trafficGraceUntil) return;
    const hero = this._heroBounds;
    if (!hero) return;
    const heroBox = rectFromNormalizedHitbox(hero, constants.HERO_TRAFFIC_HITBOX, 0.46, 0.58);
    const proj0 = this._sampleTrafficProjection ? this._sampleTrafficProjection(0) : null;
    for (const p of this.pickups) {
      if (p.collected) continue;
      let hit = p.lastCollisionBounds && rectsOverlap(heroBox, p.lastCollisionBounds);
      // Near-plane fallback: a pickup crossing the player's plane in-lane is collected even if
      // the per-frame Y projection lagged the fixed hero sprite or it tunneled at high speed.
      if (!hit && proj0) {
        const crossed = p.prevRel > 0 && p.relativeDistance <= 0;
        const inBand = Math.abs(p.relativeDistance) <= constants.segL * 0.5;
        if (crossed || inBand) {
          const laneAxis = this._trafficLaneAxis ? this._trafficLaneAxis(p.lane) : (p.lane / 0.75);
          const cx = proj0.X + laneAxis * proj0.W * 0.5 * 0.56;
          const half = Math.max(12, proj0.W * 0.16) * 0.36;
          hit = (cx - half) < heroBox.right && (cx + half) > heroBox.left;
        }
      }
      if (hit) this._collectPickup(p);
    }
  },

  _spawnPickup(playerDistance) {
    const type = this._weightedPickupType();
    const lanes = Object.values(constants.LANE).filter(Number.isFinite);
    // Prefer a lane without a car near the spawn point so pickups aren't unreachable.
    const worldDistance = playerDistance + this._pickupSpawnAhead();
    const blocked = new Set();
    for (const car of this.cars || []) {
      if (Math.abs((car.worldDistance ?? Infinity) - worldDistance) < constants.segL * 3) blocked.add(car.lane);
    }
    let candidates = lanes.filter((l) => !blocked.has(l));
    if (candidates.length === 0) candidates = lanes;
    const lane = candidates[this._randomInt ? this._randomInt(candidates.length) : 0];

    this.pickups.push({
      id: this.pickupNextId++,
      typeId: type.id,
      lane,
      worldDistance,
      relativeDistance: worldDistance - playerDistance,
      prevRel: worldDistance - playerDistance,
      collected: false,
      spawnTime: this.simTimeMs,
    });
  },

  _retirePickup(p) {
    const el = this.pickupElements?.get(p.id);
    if (el) el.style.display = 'none';
  },

  _hideAllPickupElements() {
    if (!this.pickupElements) return;
    for (const el of this.pickupElements.values()) el.style.display = 'none';
  },

  _ensurePickupElement(p) {
    if (!this.pickupElements) this.pickupElements = new Map();
    let el = this.pickupElements.get(p.id);
    if (!el) {
      const type = PICKUP_TYPES.find((t) => t.id === p.typeId) || PICKUP_TYPES[0];
      el = document.createElement('div');
      el.className = `pickup pickup-${p.typeId}`;
      el.innerHTML = `<span class="pickup-icon">${type.icon}</span>`;
      el.style.setProperty('--pk-color', type.color);
      el.style.setProperty('--pk-glow', type.glow);
      this.roadElement.appendChild(el);
      this.pickupElements.set(p.id, el);
    }
    return el;
  },

  // Project + position every active pickup. Call after _renderTrafficCars (rows are fresh).
  _renderPickups() {
    if (!this.pickups) return;
    if (this.simTimeMs < this.trafficGraceUntil) {
      this._hideAllPickupElements();
      return;
    }
    for (const p of this.pickups) {
      if (p.collected) continue;
      const proj = this._sampleTrafficProjection?.(p.relativeDistance);
      if (!proj || !Number.isFinite(proj.scale) || proj.scale <= 0) {
        const el = this.pickupElements?.get(p.id);
        if (el) el.style.display = 'none';
        p.lastRenderBounds = null; // off-screen: not collectible this frame
        p.lastCollisionBounds = null;
        continue;
      }
      const laneAxis = this._trafficLaneAxis ? this._trafficLaneAxis(p.lane) : (p.lane / 0.75);
      const laneCenterX = proj.X + laneAxis * proj.W * 0.5 * 0.56;
      const size = Math.max(12, proj.W * 0.16);
      const left = laneCenterX - size / 2;
      const top = proj.Y - size * 1.25;
      const el = this._ensurePickupElement(p);
      el.style.display = 'flex';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.fontSize = `${size * 0.55}px`;
      el.style.zIndex = String(Math.round(29000 - Math.max(0, p.relativeDistance / constants.segL) * 120));
      el.style.opacity = String(Math.max(0, Math.min(1, (this.simTimeMs - p.spawnTime) / 500)));
      // Rendered bounds + the collision box used for pixel-accurate collection (matches what's
      // drawn). The badge is circular, so inset the box slightly to track the disc.
      p.lastRenderBounds = { left, top, right: left + size, bottom: top + size, width: size, height: size };
      const inset = size * 0.14;
      p.lastCollisionBounds = { left: left + inset, top: top + inset, right: left + size - inset, bottom: top + size - inset };
    }
  },

  _collectPickup(p) {
    if (p.collected) return;
    p.collected = true;

    const type = PICKUP_TYPES.find((t) => t.id === p.typeId) || PICKUP_TYPES[0];
    this._applyPickupEffect(p.typeId);

    // Juice: spark burst + tone at the pickup's last screen position (or hero fallback).
    const el = this.pickupElements?.get(p.id);
    let x = constants.halfWidth;
    let y = constants.height * 0.5;
    if (el && el.style.display !== 'none') {
      x = parseFloat(el.style.left || '0') + parseFloat(el.style.width || '0') / 2;
      y = parseFloat(el.style.top || '0') + parseFloat(el.style.height || '0') / 2;
    }
    this._burstParticles?.(x, y, { count: 12, colors: [type.color, '#ffffff', type.color], spread: 80, size: 5, life: 480 });
    this.audio?.playComboTone?.(3);
  },

  _applyPickupEffect(typeId) {
    switch (typeId) {
      case 'nitro': {
        // Instant boost: kick into a fresh boost regardless of cooldown.
        this.isBoosting = true;
        this.boostTimer = this.boostDurationEff ?? constants.boostDuration;
        this.boostCooldownTimer = 0;
        this.heroElement?.classList.add('hero-boosting');
        this.audio?.playWhoosh?.();
        this._boostPunch?.();
        this.updateBoostUI?.();
        break;
      }
      case 'time': {
        this._addArcadeTime?.(PICKUP_CFG.timeBonus);
        this.spawnScoreText?.(0, `+${PICKUP_CFG.timeBonus}s`, constants.halfWidth, constants.height * 0.32, 1);
        break;
      }
      case 'credits': {
        this.progression?.award?.(PICKUP_CFG.creditAmount);
        this.spawnScoreText?.(PICKUP_CFG.creditAmount, '◆', constants.halfWidth, constants.height * 0.32, 1);
        break;
      }
      case 'shield': {
        this.shieldCharges = Math.min(1, (this.shieldCharges || 0) + 1);
        this._updateShieldHUD?.();
        break;
      }
    }
  },

  // Consume a shield charge instead of crashing. Returns true if a crash was blocked.
  _consumeShield() {
    if (!this.shieldCharges || this.shieldCharges <= 0) return false;
    this.shieldCharges -= 1;
    this._updateShieldHUD?.();
    this._flashScreen?.('rgba(196,107,255,0.22)', 360);
    this.screenShake?.(6, 140);
    this.audio?.playComboTone?.(4);
    return true;
  },

  _updateShieldHUD() {
    const el = document.getElementById('shield-indicator');
    if (!el) return;
    el.style.display = (this.shieldCharges || 0) > 0 ? 'block' : 'none';
  },
};
