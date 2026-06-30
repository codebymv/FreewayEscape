import * as constants from '../config/constants.js';

// Game-feel "juice": speed-streak overlay, boost camera punch, vignette flashes,
// and particle bursts (near-miss sparks, crash debris). All effects are overlay
// elements / CSS animations layered over the existing render — they never touch the
// per-segment road-quad hot path. Mixed into GameEngine.prototype; every method runs
// with `this` bound to the engine instance.
export const JuiceMixin = {
  // Create the overlay elements once. Safe to call repeatedly.
  _initJuiceFx() {
    if (this._juiceReady) return;
    const game = this.gameElement || document.getElementById('game');
    const road = this.roadElement || document.getElementById('road');
    if (!game || !road) return;

    // Radial speed streaks. Lives inside #road (below the hero at z 10000) so the
    // player car stays clean while the periphery streaks at speed.
    const speed = document.createElement('div');
    speed.id = 'speed-lines';
    road.appendChild(speed);
    this.speedLinesEl = speed;

    // Edge vignette flash, reused for boost kick + combo milestones. A #game child so
    // it covers the whole viewport; its center is transparent so the action shows through.
    const flash = document.createElement('div');
    flash.id = 'fx-flash';
    game.appendChild(flash);
    this.fxFlashEl = flash;

    this._speedFxOpacity = 0;       // smoothed streak strength
    this._speedFxBoostClass = false;
    this._lastComboMultiplier = 1;  // for combo-milestone detection
    this._juiceReady = true;
  },

  // Per-frame: ramp speed streaks with velocity, surge during boost. Cheap — only
  // touches opacity + a class toggle, both GPU-composited.
  _updateSpeedFx(step) {
    const el = this.speedLinesEl;
    if (!el) return;
    if (this.combo === 0) this._lastComboMultiplier = 1; // covers every combo-reset path

    const max = this.baseMaxSpeed || constants.maxSpeed || 85;
    const ratio = (this.speed || 0) / max;
    // Streaks fade in from ~60% of top speed, full at top speed, then push past on boost.
    let target = Math.min(1, Math.max(0, (ratio - 0.6) / 0.4));
    if (this.isBoosting) target = Math.min(1.35, target + 0.55);

    // Ease toward target so it doesn't snap on/off.
    const blend = Math.min(1, (step || 0.016) * 9);
    this._speedFxOpacity += (target - this._speedFxOpacity) * blend;

    const o = this._speedFxOpacity;
    // Capped low so the streaks read as a subtle speed cue, not a strobing overlay.
    el.style.opacity = (Math.min(o, 1.35) * 0.26).toFixed(3);

    // Only run the (infinite) zoom animation while the streaks are actually visible —
    // otherwise it churns the compositor every frame for nothing.
    const visible = o > 0.02;
    if (visible !== this._speedFxVisible) {
      this._speedFxVisible = visible;
      el.style.animationPlayState = visible ? 'running' : 'paused';
    }

    const boosting = this.isBoosting && o > 0.05;
    if (boosting !== this._speedFxBoostClass) {
      this._speedFxBoostClass = boosting;
      el.classList.toggle('boosting', boosting);
    }
  },

  _clearSpeedFx() {
    this._speedFxOpacity = 0;
    this._speedFxBoostClass = false;
    this._speedFxVisible = false;
    if (this.speedLinesEl) {
      this.speedLinesEl.style.opacity = '0';
      this.speedLinesEl.style.animationPlayState = 'paused';
      this.speedLinesEl.classList.remove('boosting');
    }
  },

  // Boost kick: a brief scene scale-punch + cyan vignette pulse.
  _boostPunch() {
    const road = this.roadElement;
    if (road) {
      road.classList.remove('road-boost-punch');
      void road.offsetWidth; // restart the animation
      road.classList.add('road-boost-punch');
      setTimeout(() => road && road.classList.remove('road-boost-punch'), 360);
    }
    this._flashScreen('rgba(0,255,255,0.18)', 320);
  },

  // Edge vignette flash. `color` is any CSS color/rgba; `duration` in ms.
  _flashScreen(color, duration = 300) {
    const el = this.fxFlashEl;
    if (!el) return;
    el.style.background = `radial-gradient(ellipse at 50% 56%, transparent 46%, ${color} 100%)`;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `fx-flash ${duration}ms ease-out forwards`;
  },

  // Burst of small particles at a road-relative point. kind: 'spark' | 'debris'.
  // Pause-safe: tracked in manualAssets and cleaned up like score popups.
  _burstParticles(x, y, opts = {}) {
    if (x == null || y == null || !this.roadElement) return;
    const {
      count = 8,
      colors = ['#FFD700', '#FFF1A8', '#FF8C00'],
      spread = 70,
      rise = 26,
      size = 5,
      kind = 'spark',
      life = 520,
    } = opts;

    const rnd = () => (this._random ? this._random() : Math.random());
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = `fx-particle fx-${kind}`;

      const ang = (Math.PI * 2 * i) / count + rnd() * 0.7;
      const dist = spread * (0.45 + rnd() * 0.55);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - rise; // bias the spray upward
      const s = size * (0.7 + rnd() * 0.8);
      const color = colors[i % colors.length];

      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.width = `${s.toFixed(1)}px`;
      p.style.height = `${s.toFixed(1)}px`;
      p.style.background = color;
      p.style.boxShadow = `0 0 ${(s * 1.6).toFixed(1)}px ${color}`;
      p.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      p.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      p.style.animationDuration = `${life}ms`;

      this.roadElement.appendChild(p);
      p._isManualAsset = true;
      this.manualAssets.add(p);
      p._cleanupTimer = setTimeout(() => {
        if (p.parentNode) p.parentNode.removeChild(p);
        this.manualAssets.delete(p);
      }, life + 80);
    }
  },

  // Combo multiplier just stepped up to a new tier — flash + rising tone.
  _onComboMilestone(multiplier) {
    const colorByMult = {
      2: 'rgba(0,255,170,0.16)',
      3: 'rgba(0,200,255,0.18)',
      4: 'rgba(180,90,255,0.20)',
      6: 'rgba(255,120,220,0.22)',
      8: 'rgba(255,60,60,0.24)',
    };
    this._flashScreen(colorByMult[multiplier] || 'rgba(255,255,255,0.16)', 380);
    this.audio?.playComboTone?.(multiplier);
  },
};
