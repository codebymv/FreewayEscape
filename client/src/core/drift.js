import * as constants from '../config/constants.js';

// Drift scoring: hold a hard turn at speed to build a drift — accumulates pending points
// at a growing multiplier, streams tire smoke, and BANKS the points (+ combo + credits)
// on a clean exit. A crash mid-drift busts it (pending points lost). Mixed into
// GameEngine.prototype; every method runs with `this` bound to the engine instance.

const DRIFT = {
  minSpeedRatio: 0.55,   // of baseMaxSpeed before a drift can start
  steerThreshold: 0.55,  // fraction of MAX_STEER_VELOCITY that counts as "hard" steering
  minBankTime: 0.55,     // seconds of drift before it's worth banking
  showAfter: 0.18,       // seconds before the meter/smoke appear (ignores micro-twitches)
  rampPerSecond: 0.9,    // multiplier growth per second held
  maxMultiplier: 4,
  scoreRate: 28,         // base points/sec (scaled by speed ratio × multiplier)
  creditDivisor: 22,     // banked drift points → credits
  smokeIntervalMs: 70,
};

export const DriftMixin = {
  _initDrift() {
    this.driftActive = false;
    this.driftTime = 0;
    this.driftScore = 0;
    this.driftMultiplier = 1;
    this.driftDir = 0;
    this.driftBusted = false;
    this.bestDrift = 0;
    this._lastDriftSmokeAt = 0;
    this._driftMeterEl = null;
  },

  // Reset for a fresh run (discard any in-progress drift, zero the best).
  _resetDrift() {
    this.driftActive = false;
    this.driftTime = 0;
    this.driftScore = 0;
    this.driftMultiplier = 1;
    this.driftBusted = false;
    this.bestDrift = 0;
    this._updateDriftHUD();
  },

  _isDrifting() {
    const maxSpeed = this.baseMaxSpeed || constants.maxSpeed;
    if (this.speed < maxSpeed * DRIFT.minSpeedRatio) return false;
    const maxSteer = Math.max(constants.MAX_STEER_VELOCITY || 1, 0.001);
    const steerFrac = Math.abs(this.steerVelocity || 0) / maxSteer;
    return steerFrac >= DRIFT.steerThreshold;
  },

  _updateDrift(step) {
    if (!this.inGame) {
      if (this.driftActive) this._endDrift(false); // discard, don't bank after game over
      return;
    }
    const recovering = this.simTimeMs < this.crashRecoveryUntil;
    const drifting = !recovering && this._isDrifting();

    if (drifting) {
      if (!this.driftActive) {
        this.driftActive = true;
        this.driftTime = 0;
        this.driftScore = 0;
        this.driftMultiplier = 1;
        this.driftBusted = false;
      }
      this.driftDir = Math.sign(this.steerVelocity || 0) || 1;
      this.driftTime += step;
      this.driftMultiplier = Math.min(DRIFT.maxMultiplier, 1 + this.driftTime * DRIFT.rampPerSecond);
      const speedRatio = (this.speed || 0) / (this.baseMaxSpeed || constants.maxSpeed);
      this.driftScore += DRIFT.scoreRate * speedRatio * this.driftMultiplier * step;
      this._emitDriftSmoke();
      this._updateDriftHUD();
    } else if (this.driftActive) {
      this._endDrift(true);
    }
  },

  // bank=true: bank if eligible; bank=false: discard. Either way the drift ends.
  _endDrift(bank) {
    if (!this.driftActive) return;
    const time = this.driftTime;
    const pending = Math.floor(this.driftScore);
    const busted = this.driftBusted;

    this.driftActive = false;
    this.driftTime = 0;
    this.driftScore = 0;
    this.driftMultiplier = 1;
    this.driftBusted = false;
    this._updateDriftHUD();

    if (!bank || busted || time < DRIFT.minBankTime || pending <= 0) return;

    if (time > this.bestDrift) this.bestDrift = time;

    // Bank into score + combo + credits, then juice it.
    const comboMult = this.getComboMultiplier?.() || 1;
    const banked = pending * comboMult;
    this.scoreVal += banked;
    this.combo = (this.combo || 0) + 1;
    this.comboTimer = constants.COMBO_WINDOW;
    this.comboMultiplier = this.getComboMultiplier?.() || comboMult;
    this.updateComboDisplay?.();

    const credits = Math.floor(banked / DRIFT.creditDivisor);
    if (credits > 0) this.progression?.award?.(credits);

    const x = this._heroBounds ? (this._heroBounds.left + this._heroBounds.right) / 2 : constants.halfWidth;
    const y = this._heroBounds ? this._heroBounds.top - 30 : constants.height * 0.58;
    this.spawnScoreText?.(banked, `DRIFT${credits > 0 ? ` ◆${credits}` : ''}`, x, y, comboMult);
    this._flashScreen?.('rgba(255,180,40,0.14)', 320);
    this._burstParticles?.(x, y, { count: 10, colors: ['#FFB347', '#FFD700', '#ffffff'], spread: 80, size: 5, life: 480 });
    this.audio?.playComboTone?.(Math.min(8, 2 + Math.floor(time)));
  },

  // Crash mid-drift: mark busted so the pending points are lost (not banked).
  _bustDrift() {
    if (this.driftActive) {
      this.driftBusted = true;
      this._endDrift(false);
    }
  },

  _emitDriftSmoke() {
    if (!this._burstParticles || !this._heroBounds) return;
    if (this.driftTime < DRIFT.showAfter) return;
    if (this.simTimeMs - (this._lastDriftSmokeAt || 0) < DRIFT.smokeIntervalMs) return;
    this._lastDriftSmokeAt = this.simTimeMs;
    const hb = this._heroBounds;
    const cx = (hb.left + hb.right) / 2 - this.driftDir * hb.width * 0.26;
    const cy = hb.bottom - hb.height * 0.12;
    this._burstParticles(cx, cy, {
      count: 2,
      colors: ['rgba(225,225,230,0.85)', 'rgba(195,195,205,0.75)'],
      spread: 26, rise: -2, size: 7, kind: 'smoke', life: 520,
    });
  },

  _updateDriftHUD() {
    const el = this._driftMeterEl || (this._driftMeterEl = document.getElementById('drift-meter'));
    if (!el) return;
    if (this.driftActive && this.driftTime >= DRIFT.showAfter) {
      el.style.display = 'block';
      el.innerHTML = `DRIFT <span class="drift-mult">×${this.driftMultiplier.toFixed(1)}</span> <span class="drift-pts">${Math.floor(this.driftScore)}</span>`;
      el.classList.toggle('drift-hot', this.driftMultiplier >= 3);
    } else {
      el.style.display = 'none';
      el.classList.remove('drift-hot');
    }
  },
};
