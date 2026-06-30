import { getCurrentLevel, LEVEL_PROGRESSION } from '../config/levels.js';
import { KEYS } from './controls.js';
import * as constants from '../config/constants.js';

// Level-select screen UI. Mixed into GameEngine.prototype; all methods run with
// `this` bound to the engine instance, so they read/write engine state directly.
export const LevelSelectMixin = {
  showLevelSelect() {
    this.inLevelSelect = true;
    this.levelSelectElement.style.display = 'flex';
    this.homeElement.style.display = 'none';
    this.hudElement.style.display = 'none'; // Hide HUD during level select
    this.roadElement.style.display = 'none'; // Hide road to prevent grey box
    this.levelSelectCooldown = 500; // 500ms cooldown before accepting input
    this.updateLevelSelectUI();
    this.updateLevelPreview(this.selectedLevelIndex); // Show preview for selected level
    this.updateLevelSelectCredits();
  },

  // Refresh the credits balance shown on the level-select footer.
  updateLevelSelectCredits() {
    const el = document.getElementById('level-select-credits-value');
    if (el && this.progression) {
      el.textContent = this.progression.credits.toLocaleString('en-US');
    }
  },

  hideLevelSelect() {
    this.inLevelSelect = false;
    this.levelSelectElement.style.display = 'none';
    this.hudElement.style.display = 'block'; // Show HUD when leaving level select
    this.roadElement.style.display = 'block'; // Show road when leaving level select
    // Ensure any main menu overlay (logo) is hidden during gameplay
    const mainMenuEl = document.getElementById('main-menu');
    if (mainMenuEl) {
      mainMenuEl.style.display = 'none';
    }
  },

  updateLevelSelectUI() {
    const levelOptions = document.querySelectorAll('.level-option');
    levelOptions.forEach((option, index) => {
      if (index === this.selectedLevelIndex) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
    this.updateDensitySelectUI();
    this.updateLevelPreview(this.selectedLevelIndex); // Update preview when selection changes
  },

  updateDensitySelectUI() {
    const selectedKey = constants.normalizeTrafficDensityKey(this.selectedDensityKey);
    const densityOptions = document.querySelectorAll('.density-option');
    densityOptions.forEach((option) => {
      const optionKey = constants.normalizeTrafficDensityKey(option.dataset.density);
      option.classList.toggle('selected', optionKey === selectedKey);
    });
  },

  updateLevelPreview(levelIndex) {
    // Get the level configuration
    const level = getCurrentLevel(levelIndex);

    // Update the cloud/sky background to match the selected level
    if (level.sky && level.sky.length > 0) {
      const skyImage = level.sky[0]; // Use first sky variant
      this.cloudElement.style.background = `url('${skyImage}') no-repeat center center`;
      this.cloudElement.style.backgroundSize = 'cover';
    }

    // Apply level colors to create atmosphere
    const gameElement = document.getElementById('game');
    if (gameElement && level.colors) {
      // Preserve base gradient while layering a subtle level-tinted overlay
      const grassColor = level.colors.GRASS[0];
      // Use multiple backgrounds to keep the base gradient visible
      gameElement.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${grassColor}26 100%), linear-gradient(135deg, #667eea 0%, #764ba2 100%)`;
      gameElement.style.backgroundBlendMode = 'normal';
      gameElement.style.backgroundSize = 'cover';
    }
  },

  handleLevelSelectInput() {
    if (!this.inLevelSelect || this.levelSelectCooldown > 0) return;

    if (KEYS.ArrowLeft || KEYS.KeyA) {
      this.selectedLevelIndex = Math.max(0, this.selectedLevelIndex - 1);
      this.updateLevelSelectUI();
      this.levelSelectCooldown = 150;
      return;
    }

    if (KEYS.ArrowRight || KEYS.KeyD) {
      this.selectedLevelIndex = Math.min(LEVEL_PROGRESSION.length - 1, this.selectedLevelIndex + 1);
      this.updateLevelSelectUI();
      this.levelSelectCooldown = 150;
      return;
    }

    if (KEYS.ArrowUp || KEYS.KeyW) {
      this.changeDensitySelection(-1);
      return;
    }

    if (KEYS.ArrowDown || KEYS.KeyS) {
      this.changeDensitySelection(1);
      return;
    }

    if (KEYS.KeyG) {
      this.levelSelectCooldown = 300;
      this.showGarage?.();
      return;
    }

    if (KEYS.Insert || KEYS.KeyC) {
      this.selectLevel(this.selectedLevelIndex);
    }
  },

  changeDensitySelection(delta) {
    const order = constants.TRAFFIC_DENSITY_ORDER;
    const current = constants.normalizeTrafficDensityKey(this.selectedDensityKey);
    const currentIndex = Math.max(0, order.indexOf(current));
    const nextIndex = (currentIndex + delta + order.length) % order.length;
    this.selectDensity(order[nextIndex]);
    this.levelSelectCooldown = 150;
  },

  selectDensity(key) {
    if (typeof this._setTrafficDensity === 'function') {
      this._setTrafficDensity(key);
    } else {
      this.selectedDensityKey = constants.normalizeTrafficDensityKey(key);
      this.selectedDensityPreset = constants.getTrafficDensityPreset(this.selectedDensityKey);
    }
    this.updateDensitySelectUI();
  },

  selectLevel(levelIndex) {
    console.log(`Level ${levelIndex} selected`);
    this.changeLevel(levelIndex);
    this.hideLevelSelect();
    this.startGame();
  },
};
