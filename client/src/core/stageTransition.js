// First-class stage transition: a synthwave wipe that masks the sector environment swap.
// Crossing a checkpoint plays SECTOR CLEAR → a neon panel wipes across (the swap happens
// hidden underneath) → STAGE N — NAME title → wipe out, resume. Mixed into GameEngine.prototype.

const PHASES = { clear: 0.5, cover: 0.42, hold: 0.28, reveal: 0.5 }; // seconds (~1.7s total)
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export const StageTransitionMixin = {
  _initStageTransition() {
    this.stageTransition = null;
    this._stageEls = null;
  },

  isTransitioning() {
    return !!this.stageTransition;
  },

  _ensureStageTransitionDom() {
    if (this._stageEls) return this._stageEls;
    const root = document.createElement('div');
    root.id = 'stage-transition';
    root.innerHTML = `
      <div class="stage-clear">SECTOR CLEAR</div>
      <div class="stage-panel">
        <div class="stage-title"></div>
      </div>
    `;
    (this.gameElement || document.body).appendChild(root);
    this._stageEls = {
      root,
      clear: root.querySelector('.stage-clear'),
      panel: root.querySelector('.stage-panel'),
      title: root.querySelector('.stage-title'),
    };
    return this._stageEls;
  },

  // Begin the wipe. onSwap() runs once, hidden, when the panel fully covers the screen.
  _startStageTransition({ stageNumber, onSwap }) {
    const els = this._ensureStageTransitionDom();
    this.stageTransition = { elapsed: 0, swapped: false, onSwap, stageNumber };
    els.root.style.display = 'block';
    els.clear.style.opacity = '0';
    els.title.style.opacity = '0';
    els.title.textContent = '';
    els.panel.style.transform = 'translateX(100%)';
    this.audio?.playWhoosh?.();
    this._burstParticles?.(this.gameElement ? this.gameElement.clientWidth / 2 : 0, 120,
      { count: 16, colors: ['#00ffea', '#ff00ff', '#ffffff'], spread: 140, size: 5, life: 520 });
  },

  _updateStageTransition(step) {
    const t = this.stageTransition;
    if (!t) return;
    const els = this._stageEls;
    t.elapsed += step;
    const e = t.elapsed;

    const tClear = PHASES.clear;
    const tCover = tClear + PHASES.cover;
    const tHold = tCover + PHASES.hold;
    const tEnd = tHold + PHASES.reveal;

    let panelX; // % : 100 = off right, 0 = covering, -100 = off left
    if (e < tClear) {
      panelX = 100;
      els.clear.style.opacity = String(Math.min(1, e / 0.12));
      els.clear.style.transform = `translate(-50%, -50%) scale(${(1 + Math.min(0.12, e * 0.2)).toFixed(3)})`;
    } else if (e < tCover) {
      const k = easeInOut((e - tClear) / PHASES.cover);
      panelX = 100 - 100 * k;
      els.clear.style.opacity = String(1 - k);
    } else if (e < tHold) {
      panelX = 0;
      els.clear.style.opacity = '0';
      els.title.style.opacity = '1';
    } else if (e < tEnd) {
      const k = easeInOut((e - tHold) / PHASES.reveal);
      panelX = -100 * k;
      els.title.style.opacity = String(1 - k * 0.7);
    } else {
      this._endStageTransition();
      return;
    }
    els.panel.style.transform = `translateX(${panelX}%)`;

    // Fire the (hidden) environment swap the instant the panel fully covers the screen.
    if (!t.swapped && e >= tCover) {
      t.swapped = true;
      t.onSwap?.();
      const name = (this.getCurrentLevelName?.() || '').toUpperCase();
      els.title.innerHTML = `<span class="stage-num">STAGE ${t.stageNumber}</span>${name ? `<span class="stage-name">${name}</span>` : ''}`;
      els.title.style.opacity = '1';
    }
  },

  _endStageTransition() {
    this.stageTransition = null;
    if (this._stageEls) this._stageEls.root.style.display = 'none';
  },
};
