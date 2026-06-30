import * as constants from '../config/constants.js';
import { UPGRADES, PAINTS } from '../config/upgrades.js';
import { creditsFromRun } from '../config/upgrades.js';

// Meta-progression engine wiring + the Garage (upgrade/paint shop) screen.
// Mixed into GameEngine.prototype; every method runs with `this` bound to the engine.
//
// Tuning model: gameplay stat constants the player can upgrade (top speed, boost
// duration/recharge, run start time) are read from a per-run `this.cfg` object built
// in _applyRunTuning() rather than straight from the constants module, so purchases
// take effect on the next run without mutating the shared constants.
export const GarageMixin = {
  // Build the effective run config + cached effective values from owned upgrades.
  // Called from the constructor and at the start of every run.
  _applyRunTuning() {
    const mods = this.progression ? this.progression.statModifiers()
      : { maxSpeed: 0, boostSpeed: 0, boostDuration: 0, boostCooldown: 0, startTime: 0 };

    const effMaxSpeed = constants.maxSpeed + mods.maxSpeed;
    const effBoostSpeed = constants.boostSpeed + mods.boostSpeed;
    const effBoostDuration = constants.boostDuration + mods.boostDuration;
    const effBoostCooldown = Math.max(0.5, constants.boostCooldown + mods.boostCooldown);

    // Effective driving config consumed by updateDrivingPhysics (replaces passing `constants`).
    this.cfg = Object.assign({}, constants, {
      maxSpeed: effMaxSpeed,
      boostSpeed: effBoostSpeed,
      boostDuration: effBoostDuration,
      boostCooldown: effBoostCooldown,
    });

    // Cached effective values read elsewhere (boost HUD, near-miss speed bonus, arcade timer).
    this.baseMaxSpeed = effMaxSpeed;
    this.boostDurationEff = effBoostDuration;
    this.boostCooldownEff = effBoostCooldown;
    this.startTimeEff = constants.ARCADE_START_TIME + mods.startTime;

    this._applyHeroPaint();
  },

  // Apply the active paint as a CSS filter on the hero sprite.
  _applyHeroPaint() {
    if (!this.heroElement || !this.progression) return;
    this.heroElement.style.filter = this.progression.activePaintFilter() || 'none';
  },

  // Award credits for a finished run; returns the amount earned (for the results screen).
  _awardRunCredits(score, cleanSectors) {
    if (!this.progression) return 0;
    const earned = creditsFromRun({ score, cleanSectors });
    this.progression.award(earned);
    return earned;
  },

  // ─── Garage screen ───────────────────────────────────────────────────────────
  showGarage() {
    this.inGarage = true;
    this.inLevelSelect = false;
    const el = document.getElementById('garage');
    if (!el) return;
    el.style.display = 'flex';
    const mainMenu = document.getElementById('main-menu');
    if (mainMenu) mainMenu.style.display = 'none';
    if (this.levelSelectElement) this.levelSelectElement.style.display = 'none';
    this._renderGarage();

    // ESC closes the garage back to level select.
    if (!this._garageEscHandler) {
      this._garageEscHandler = (e) => {
        if (e.code === 'Escape' && this.inGarage) {
          e.stopPropagation();
          this.hideGarage();
          this.showLevelSelect?.();
        }
      };
    }
    document.addEventListener('keydown', this._garageEscHandler);
  },

  hideGarage() {
    this.inGarage = false;
    const el = document.getElementById('garage');
    if (el) el.style.display = 'none';
    if (this._garageEscHandler) {
      document.removeEventListener('keydown', this._garageEscHandler);
    }
  },

  _formatCredits(n) {
    return (n | 0).toLocaleString('en-US');
  },

  _renderGarage() {
    const el = document.getElementById('garage');
    if (!el || !this.progression) return;
    const p = this.progression;

    const pips = (level, max) =>
      Array.from({ length: max }, (_, i) =>
        `<span class="pip ${i < level ? 'on' : ''}"></span>`).join('');

    const upgradeRows = UPGRADES.map((u) => {
      const level = p.getUpgradeLevel(u.id);
      const maxed = level >= u.maxLevel;
      const cost = p.nextUpgradeCost(u.id);
      const afford = p.canAffordUpgrade(u.id);
      const btn = maxed
        ? `<span class="garage-maxed">MAX</span>`
        : `<button class="garage-buy" data-buy-upgrade="${u.id}" ${afford ? '' : 'disabled'}>◆ ${this._formatCredits(cost)}</button>`;
      return `
        <div class="garage-row">
          <div class="garage-row-main">
            <div class="garage-row-title">${u.label} <span class="garage-pips">${pips(level, u.maxLevel)}</span></div>
            <div class="garage-row-blurb">${u.blurb}</div>
          </div>
          <div class="garage-row-action">${btn}</div>
        </div>`;
    }).join('');

    const paintSwatches = PAINTS.map((paint) => {
      const owned = p.ownsPaint(paint.id);
      const active = p.activePaint === paint.id;
      const cls = `paint-swatch${active ? ' active' : ''}${owned ? ' owned' : ''}`;
      const label = owned
        ? (active ? 'EQUIPPED' : 'EQUIP')
        : `◆ ${this._formatCredits(paint.cost)}`;
      return `
        <button class="${cls}" data-paint="${paint.id}">
          <span class="paint-chip" style="filter:${paint.filter}"></span>
          <span class="paint-name">${paint.label}</span>
          <span class="paint-cost">${label}</span>
        </button>`;
    }).join('');

    el.innerHTML = `
      <div class="garage-header">
        <h1>GARAGE</h1>
        <div class="garage-credits">◆ ${this._formatCredits(p.credits)}</div>
      </div>
      <div class="garage-upgrades">${upgradeRows}</div>
      <h2 class="garage-subhead">PAINT</h2>
      <div class="garage-paints">${paintSwatches}</div>
      <p class="garage-instruction">Click to buy / equip · <button class="garage-back" data-garage-back>BACK</button> or ESC</p>
    `;

    this._bindGarageHandlers(el);
  },

  _bindGarageHandlers(el) {
    if (this._garageClickHandler) {
      el.removeEventListener('click', this._garageClickHandler);
    }
    this._garageClickHandler = (e) => {
      const upBtn = e.target.closest('[data-buy-upgrade]');
      if (upBtn) {
        if (this.progression.buyUpgrade(upBtn.dataset.buyUpgrade)) {
          this.audio?.play?.('success_nice', 1.1);
          this._renderGarage();
        }
        return;
      }
      const paintBtn = e.target.closest('[data-paint]');
      if (paintBtn) {
        const id = paintBtn.dataset.paint;
        if (this.progression.ownsPaint(id)) {
          this.progression.setActivePaint(id);
        } else {
          this.progression.buyPaint(id);
        }
        this._applyHeroPaint();
        this.audio?.play?.('success_nice', 1.1);
        this._renderGarage();
        return;
      }
      if (e.target.closest('[data-garage-back]')) {
        this.hideGarage();
        this.showLevelSelect?.();
      }
    };
    el.addEventListener('click', this._garageClickHandler);
  },
};
