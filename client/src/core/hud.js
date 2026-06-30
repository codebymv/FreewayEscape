import * as constants from '../config/constants.js';
import { KEYS } from './controls.js';
import { accelerate, timestamp } from '../utils/helpers.js';

// HUD updates and visual feedback: sky cycling, screen shake, crash/recovery
// overlays, boost bar, and the main score/timer HUD. Mixed into
// GameEngine.prototype; every method runs with `this` bound to the engine.
export const HudMixin = {
  updateSky() {
    if (this.shouldUpdateSkyNextGame) {
      this.currentSkyIndex = this._pickRandomSkyIndex();
      const sky = this.currentAssets.IMAGE.SKY[this.currentSkyIndex];
      this.cloudElement.style.backgroundImage = `url(${sky})`;
      this.cloudElement.style.imageRendering = sky.endsWith('.svg') ? 'auto' : 'pixelated';
      this.shouldUpdateSkyNextGame = false;
      console.log(`Sky updated to index ${this.currentSkyIndex}: ${this.currentAssets.IMAGE.SKY[this.currentSkyIndex]}`);
    }
  },

  // Trigger screen shake
  screenShake(intensity = 5, duration = 100) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  },

  /**
   * Show crash feedback: overlay, CRASH! text, recovery grace period.
   * Gives player time to steer away without chain crashes.
   */
  _showCrashFeedback() {
    this.crashRecoveryUntil = this.simTimeMs + constants.CRASH_RECOVERY_MS;
    this.postCrashRespawnGraceUntil = Math.max(
      this.postCrashRespawnGraceUntil || 0,
      this.simTimeMs + (constants.CRASH_RESPAWN_GRACE_MS || 1200)
    );

    const overlay = this.crashOverlayEl;
    const text = this.crashTextEl;
    const recovery = this.recoveryIndicatorEl;

    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.animation = 'none';
      overlay.offsetHeight; // reflow
      overlay.style.animation = 'crash-flash 0.4s ease-out forwards';
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 450);
    }
    if (text) {
      text.style.display = 'block';
      text.style.animation = 'none';
      text.offsetHeight;
      text.style.animation = 'crash-text-pop 0.5s ease-out forwards';
      setTimeout(() => {
        if (text) text.style.display = 'none';
      }, 550);
    }
    if (recovery) {
      recovery.style.display = 'block';
    }

    // Debris burst at the hero on impact (road-relative coords from the cached hitbox).
    if (this._heroBounds && typeof this._burstParticles === 'function') {
      const cx = (this._heroBounds.left + this._heroBounds.right) / 2;
      const cy = this._heroBounds.top + this._heroBounds.height * 0.3;
      this._burstParticles(cx, cy, {
        count: 14, colors: ['#FFB347', '#FF6B6B', '#FFD700', '#9aa0a6'],
        spread: 110, rise: 6, size: 6, kind: 'debris', life: 640,
      });
    }

    this._updateRecoveryVisuals();
  },

  _updateRecoveryVisuals() {
    const active = this.inGame && this.simTimeMs < this.crashRecoveryUntil;
    if (active !== this.recoveryVisualActive) {
      this.recoveryVisualActive = active;
      this.heroElement?.classList.toggle('hero-recovery', active);
      this.roadElement?.classList.toggle('recovery-active', active);
    }

    const recovery = this.recoveryIndicatorEl;
    if (!recovery) return;

    if (active) {
      const remaining = Math.max(0, (this.crashRecoveryUntil - this.simTimeMs) / 1000);
      recovery.textContent = `RECOVER ${remaining.toFixed(1)}`;
      recovery.style.display = 'block';
    } else {
      recovery.style.display = 'none';
    }
  },

  updateBoostUI() {
    const boostDuration = this.boostDurationEff ?? constants.boostDuration;
    const boostCooldown = this.boostCooldownEff ?? constants.boostCooldown;
    if (this.isBoosting) {
      this.boostBar.style.width = `${(this.boostTimer / boostDuration) * 100}%`;
      this.boostTextOverlayEl.style.display = "none";
    } else if (this.boostCooldownTimer > 0) {
      this.boostBar.style.width = `${((boostCooldown - this.boostCooldownTimer) / boostCooldown) * 100}%`;
      this.boostTextOverlayEl.style.display = "none";
    } else {
      this.boostBar.style.width = "100%";
      this.boostTextOverlayEl.style.display = "block";
    }
  },

  updateUI(startPos, step) {
    // Handle level select input
    this.handleLevelSelectInput();
    
    if (!this.inGame && !this.inLevelSelect) {
      if (KEYS.Insert || KEYS.KeyC) {
        console.log('Coin inserted - showing level select...'); // Debug log
        this.showLevelSelect();
        return;
      }
      this.speed = accelerate(this.speed, constants.breaking, step);
      this.speed = this.speed.clamp(0, constants.maxSpeed);
    } else if (this.countDown <= 0) {
      this.tachoElement.style.display = "none";
      this.homeElement.style.display = "block";
      this.roadElement.style.opacity = 0.4;
      this.textElement.innerText = "INSERT COIN";
      this.highscores.push(this.lapElement.innerText);
      this.highscores.sort();
      this.updateHighscore();
      this.inGame = false;
      if (!this.hasCompletedFirstLap) {
        this.hasCompletedFirstLap = true;
      }
      this.shouldUpdateSkyNextGame = true;
      
      // Hide music controls and transition back to menu music
      document.getElementById('music-controls').style.display = 'none';
      if (this.audio) {
        console.log('Game ended, transitioning back to menu music...');
        // Stop engine sound
        this.audio.stopEngine();
        this.audio.fadeOutAndStop(1500).then(() => {
          console.log('Driving music fade out complete, starting menu music...');
          this.audio.playMenuMusic(); // Start menu music after fade
        });
      }
    } else {
      // TIME HUD removed; keep countdown internal only
      // if (this.timeElement) this.timeElement.innerText = (this.countDown | 0).pad(3);
      
      // Update score display with high score
      const currentScore = this.scoreVal | 0;
      this.scoreElement.innerText = currentScore.pad(8);
      
      // Check and update high score
      if (currentScore > this.highScore) {
        this.highScore = currentScore;
        localStorage.setItem('freewayHighScore', this.highScore.toString());
        // Update high score display
        if (this.highScoreElement) {
          this.highScoreElement.innerText = this.highScore.toString().padStart(6, '0');
        }
      }
      
      this.tachoElement.innerText = this.speed | 0;
      
      // Use new stopwatch system for accurate lap timing
      if (this.stopwatch && this.stopwatch.isActive()) {
        const stats = this.stopwatch.getStats();
        // Show only time (rename label handled in CSS)
        this.lapElement.innerText = `${stats.formatted.currentLapTime}`;
        
        // Show best lap time if available
        if (stats.bestLapTime !== null) {
          // Lazily cache: best-lap is created dynamically, so keep re-querying until present.
          const bestLapDisplay = (this.bestLapEl ||= document.getElementById('best-lap'));
          if (bestLapDisplay) {
            bestLapDisplay.innerText = `BEST: ${stats.formatted.bestLapTime}`;
          }
        }
      } else {
        // Fallback to old timing system
        let cT = new Date(timestamp() - this.start);
        this.lapElement.innerText = `${cT.getMinutes()}'${cT.getSeconds().pad(2)}"${cT.getMilliseconds().pad(3)}`;
      }
    }

    // Update engine sound based on speed and boost state
    if (this.audio && this.inGame) {
      this.audio.updateEngine(this.speed, this.isBoosting);
    }
    
    this.cloudElement.style.backgroundPosition = `${(this.cloudOffset -= step * 0.05) | 0}px 0`;
  },
};
