import * as constants from '../config/constants.js';

// Near-miss scoring, combo tracking, and floating score popups. Mixed into
// GameEngine.prototype; every method runs with `this` bound to the engine.
export const ScoringMixin = {
  // Get current combo multiplier based on combo count
  getComboMultiplier() {
    let multiplier = 1;
    for (const [threshold, mult] of Object.entries(constants.COMBO_MULTIPLIERS)) {
      if (this.combo >= parseInt(threshold)) {
        multiplier = mult;
      }
    }
    return multiplier;
  },

  // Spawn floating score text at a specific screen position
  spawnScoreText(points, label, screenX, screenY, multiplier = 1) {
    const scorePopup = document.createElement('div');
    scorePopup.className = 'score-popup';

    const totalPoints = points * multiplier;
    let text = `+${totalPoints}`;
    if (label) text += ` ${label}`;

    scorePopup.innerText = text;
    scorePopup.style.left = screenX + 'px';
    scorePopup.style.top = screenY + 'px';

    // Premium visual feedback based on score tier
    if (label === 'PERFECT!') {
      scorePopup.style.color = '#FFD700';
      scorePopup.style.textShadow = '0 0 15px #FFD700, 0 0 30px #FFD700, 0 0 45px #FF8C00';
      scorePopup.style.fontSize = '28px';
      scorePopup.style.fontWeight = 'bold';
    } else if (label === 'CLOSE!') {
      scorePopup.style.color = '#FF69B4';
      scorePopup.style.textShadow = '0 0 12px #FF69B4, 0 0 24px #FF1493';
      scorePopup.style.fontSize = '24px';
    } else {
      scorePopup.style.color = '#00FFFF';
      scorePopup.style.textShadow = '0 0 8px #00FFFF';
      scorePopup.style.fontSize = '20px';
    }

    // Combo multiplier display
    if (multiplier > 1) {
      scorePopup.innerText += ` ×${multiplier}`;
    }

    this.roadElement.appendChild(scorePopup);

    // Track as manual asset for pause/resume
    scorePopup._isManualAsset = true;
    this.manualAssets.add(scorePopup);

    // Remove after animation completes
    scorePopup._cleanupTimer = setTimeout(() => {
      if (scorePopup.parentNode) {
        scorePopup.parentNode.removeChild(scorePopup);
      }
      this.manualAssets.delete(scorePopup);
    }, 1200);
  },

  // Update combo system
  updateComboSystem(step) {
    // Decay combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= step;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboMultiplier = 1;
      }
    }

    // Update combo multiplier
    this.comboMultiplier = this.getComboMultiplier();

    // Update combo display
    this.updateComboDisplay();
  },

  // Update combo display in HUD
  updateComboDisplay() {
    const comboElement = this.comboDisplayEl;
    if (comboElement) {
      if (this.combo > 0) {
        comboElement.style.display = 'block';
        comboElement.innerHTML = `COMBO: ${this.combo} <span class="multiplier">×${this.comboMultiplier}</span>`;

        // Add pulsing effect when combo is high
        if (this.combo >= 10) {
          comboElement.classList.add('combo-high');
        } else {
          comboElement.classList.remove('combo-high');
        }
      } else {
        comboElement.style.display = 'none';
      }
    }
  },

  // Hook for collision events — overridden by Arcade Run for timer penalty
  onCollision() {
    // Base class: no additional penalty beyond speed drop + combo break
  },

  // Consolidated near-miss scoring (used for PERFECT, CLOSE, NICE tiers)
  _scoreNearMiss(car, carPosFloor, tier, shakeIntensity, shakeDuration) {
    const speedRatio = this.speed / this.baseMaxSpeed;
    const speedBonus = Math.max(1.0, speedRatio * 1.5);
    // Boost multiplier: 2x points while boosting (risk-reward)
    const boostMult = this.isBoosting ? 2 : 1;
    const densityMult = this._getDensityScoreMultiplier?.() || 1;

    const basePoints = constants.NEAR_MISS_POINTS[tier];
    const points = Math.floor(basePoints * speedBonus * boostMult * densityMult);
    let label = constants.NEAR_MISS_LABELS[tier];
    if (this.isBoosting) label += ' ⚡BOOST';
    else if (speedBonus > 1.3) label += ' ⚡';

    this.nearMisses = (this.nearMisses || 0) + 1;
    if (tier === 'PERFECT') this.perfectPasses = (this.perfectPasses || 0) + 1;

    this.combo++;
    this.comboTimer = constants.COMBO_WINDOW;
    this.comboMultiplier = this.getComboMultiplier();
    // Track best combo this run
    if (this.combo > (this.maxCombo || 0)) this.maxCombo = this.combo;

    this.scoreVal += points * this.comboMultiplier;
    this.updateComboDisplay();

    if (shakeIntensity > 0) this.screenShake(shakeIntensity, shakeDuration);

    // Floating score popup — use car position when drawn, else HUD fallback so feedback always shows (R3)
    let screenX, screenY;
    if (car.lastRenderBounds) {
      screenX = car.lastRenderBounds.centerX;
      screenY = car.lastRenderBounds.top - 20;
    }
    if (screenX == null && screenY == null && car.wasDrawnThisFrame && this.lines && this.lines[carPosFloor % constants.N]) {
      const line = this.lines[carPosFloor % constants.N];
      if (line.X != null && line.Y != null) {
        screenX = line.X + line.scale * constants.halfWidth * car.lane;
        screenY = line.Y - 50;
      }
    }
    if (screenX == null || screenY == null) {
      // Fallback: center-top of view (coordinates relative to roadElement)
      const hero = document.getElementById('hero');
      const roadRect = this.roadElement?.getBoundingClientRect();
      if (hero && roadRect) {
        const heroRect = hero.getBoundingClientRect();
        screenX = heroRect.left - roadRect.left + heroRect.width / 2;
        screenY = heroRect.top - roadRect.top - 30;
      } else {
        screenX = constants.halfWidth;
        screenY = constants.height * 0.25;
      }
    }
    this.spawnScoreText(points, label, screenX, screenY, this.comboMultiplier);

    // Spark burst for the higher tiers (color-matched to the popup).
    if (tier === 'PERFECT') {
      this._burstParticles?.(screenX, screenY, {
        count: 12, colors: ['#FFD700', '#FFF1A8', '#FF8C00'], spread: 92, size: 6, life: 560,
      });
    } else if (tier === 'CLOSE') {
      this._burstParticles?.(screenX, screenY, {
        count: 8, colors: ['#FF69B4', '#FF8CD0', '#FF1493'], spread: 72, size: 5, life: 480,
      });
    }

    // Flash + tone when the combo multiplier steps up to a new tier.
    if (this.comboMultiplier > (this._lastComboMultiplier || 1)) {
      this._onComboMilestone?.(this.comboMultiplier);
    }
    this._lastComboMultiplier = this.comboMultiplier;

    // Play tier-specific sound
    const sfxMap = {
      PERFECT: { name: 'success_perfect', pitch: 1.18 },
      CLOSE: { name: 'success_close', pitch: 1.0 },
      NICE: { name: 'success_nice', pitch: 0.86 },
    };
    if (this.inGame) {
      const sfx = sfxMap[tier];
      this.audio.play(sfx.name, sfx.pitch);
    }
  },
};
