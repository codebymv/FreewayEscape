import * as constants from '../config/constants.js';
import { ASSETS } from '../config/assets.js';
import { Audio } from '../classes/Audio.js';
import { Line } from '../classes/Line.js';
import { debugTrackLayout } from './mapGenerator.js';
import { timestamp } from '../utils/helpers.js';

// One-time DOM/audio setup, road element construction, high-score board, level-select
// wiring, and per-run reset. Mixed into GameEngine.prototype; every method runs with
// `this` bound to the engine instance.
export const SetupMixin = {
  setupGameElements() {
    // Set game and hero element sizes
    this.gameElement.style.width = constants.width + "px";
    this.gameElement.style.height = constants.height + "px";

    this.heroElement.style.top = constants.height - 80 + "px";
    this.heroElement.style.left = constants.halfWidth - ASSETS.IMAGE.HERO.width / 2 + "px";
    this.heroElement.style.background = `url(${ASSETS.IMAGE.HERO.src})`;
    this.heroElement.style.width = `${ASSETS.IMAGE.HERO.width}px`;
    this.heroElement.style.height = `${ASSETS.IMAGE.HERO.height}px`;

    // Set initial sky background
    this.cloudElement.style.backgroundImage = `url(${ASSETS.IMAGE.SKY[this.currentSkyIndex]})`;

    // Set up music controls
    const musicControls = document.getElementById('music-controls');
    const prevSong = document.getElementById('prev-song');
    const nextSong = document.getElementById('next-song');
    const volumeBar = document.getElementById('volume-bar');

    if (prevSong) {
      prevSong.addEventListener('click', () => {
        if (this.audio && this.inGame) {
          this.audio.rewindOrPrevious();
        }
      });
    }

    if (nextSong) {
      nextSong.addEventListener('click', () => {
        if (this.audio && this.inGame) {
          this.audio.nextSong();
        }
      });
    }

    if (volumeBar) {
      volumeBar.addEventListener('input', (e) => {
        if (this.audio) {
          this.audio.setVolume(e.target.value);
        }
      });
    }

    // Initially hide music controls
    if (musicControls) {
      musicControls.style.display = 'none';
    }
  },

  async initAudio() {
    this.audio = new Audio();
    window.gameAudio = this.audio;
    
    // Initialize audio on first user interaction
    const initAudio = async () => {
      await this.audio.initializeAudio();
      // Load all audio files
      await this.audio.loadDrivingPlaylist();
      for (const [key, value] of Object.entries(ASSETS.AUDIO)) {
        await this.audio.loadSound(key, value);
      }
          // Make audio and debug functions available
    window.gameAudio = this.audio;
    window.debugTracks = debugTrackLayout; // Make track debug available
    window.testCoastalHighway = () => {
      console.log('=== TESTING SMOOTH COASTAL HIGHWAY ===');
      const coastalData = debugTrackLayout(1);
      console.log('Coastal Highway Track:', coastalData);
      console.log('Max curve intensity should be around 60-90 (was 200-280)');
      return coastalData;
    };
    window.switchToCoastal = () => {
      console.log('Switching to Coastal Highway...');
      this.changeLevel(1);
      console.log('Level changed to Coastal Highway - should feel much more natural now!');
    };
    // Minimap toggle removed
    console.log('Audio initialized - you can test engine with: gameAudio.testEngine()');
    console.log('Track debugging available:');
    console.log('- debugTracks(1) for coastal highway');
    console.log('- testCoastalHighway() for complete coastal test');
    // Remove the event listeners
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
    };

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });
  },

  initRoad() {
    // CRITICAL: Clear ALL existing road elements EXCEPT hero and cloud
    const hero = document.getElementById('hero');
    const cloud = document.getElementById('cloud');
    
    // Remove all children except hero, cloud, and the speed-lines FX overlay
    const speedLines = document.getElementById('speed-lines');
    Array.from(this.roadElement.children).forEach(child => {
      if (child !== hero && child !== cloud && child !== speedLines) {
        this.roadElement.removeChild(child);
      }
    });
    
    // Also ensure lines array is cleared
    this.lines = [];
    this.manualAssets = new Set();
    
    for (let i = 0; i < constants.N; i++) {
      let line = new Line();
      line.z = i * constants.segL + 270;
      line.curve = 0;
      line.y = 0;
      line.special = null;

      // Increased from 18 to 24 elements to support dedicated scenery slots.
      // Elements 0-5: Road quads
      // Elements 6-7: terrain overlays
      // Elements 8-23: available for sprites (trees, buildings, boats, landmarks)
      for (let j = 0; j < 24; j++) {
        let element = document.createElement("div");
        this.roadElement.appendChild(element);
        line.elements.push(element);
      }

      this.lines.push(line);
    }

    // Create a dedicated DOM element for the finish banner to avoid flicker
    if (!this.finishBannerEl) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      this.finishBannerEl = el;
      this.roadElement.appendChild(el);
    }

    // Create a dedicated DOM element for the checkpoint banner
    if (!this.checkpointBannerEl) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      this.checkpointBannerEl = el;
      this.roadElement.appendChild(el);
    }
  },

  initHighscore() {
    for (let i = 0; i < 12; i++) {
      let element = document.createElement("p");
      this.highscoreElement.appendChild(element);
    }
    this.updateHighscore();
  },

  updateHighscore() {
    let hN = Math.min(12, this.highscores.length);
    for (let i = 0; i < hN; i++) {
      this.highscoreElement.children[i].innerHTML = `${(i + 1).pad(2, "&nbsp;")}. ${
        this.highscores[i]
      }`;
    }
  },

  initLevelSelect() {
    // Add click handlers for level options
    const levelOptions = document.querySelectorAll('.level-option');
    levelOptions.forEach((option, index) => {
      option.addEventListener('click', () => {
        this.selectedLevelIndex = index;
        this.updateLevelSelectUI();
        this.selectLevel(index);
      });
    });

    const densityOptions = document.querySelectorAll('.density-option');
    densityOptions.forEach((option) => {
      option.addEventListener('click', () => {
        this.selectDensity?.(option.dataset.density);
      });
    });

    const garageBtn = document.getElementById('garage-open-btn');
    if (garageBtn) {
      garageBtn.addEventListener('click', () => this.showGarage?.());
    }
  },

  reset() {
    this.inGame = false;
    document.body.classList.remove('in-game');
    this.crashRecoveryUntil = 0;
    this.postCrashRespawnGraceUntil = 0;
    this.recoveryVisualActive = false;
    this.heroElement?.classList.remove('hero-recovery');
    this.roadElement?.classList.remove('recovery-active');

    if (this.isFirstGame) {
      this.isFirstGame = false;
      this.hasCompletedFirstLap = false;
      this.shouldUpdateSkyNextGame = false;
      // Set initial sky background
      this.cloudElement.style.backgroundImage = `url(${ASSETS.IMAGE.SKY[this.currentSkyIndex]})`;
    } else if (this.shouldUpdateSkyNextGame) {
      this.updateSky();
    }

    // Stop engine sound when returning to menu
    if (this.audio) {
      this.audio.stopEngine();
    }

    // Reset game state
    this.start = timestamp();
    this.countDown = this.map[this.map.length - 2].to / 130 + 10;
    this.playerX = 0;
    this.speed = 0;
    this.steerVelocity = 0;
    this.pos = 0;
    this.currentLap = 0; // Reset lap counter
    this.totalDistance = 0; // Reset total distance
    this.lastDistanceDelta = 0;
    this.simTimeMs = 0;
    this.lastTrafficRespawnAt = -Infinity;
    this.postCrashRespawnGraceUntil = 0;
    this.scoreVal = 0;
    this.mapIndex = 0;
    this.sectionProg = 0;
    this.lastDrivingInput = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      boost: false,
    };
    this.isBoosting = false;
    this.boostTimer = 0;
    this.boostCooldownTimer = 0;
    this.lastDrivingInput = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      boost: false,
    };

    if (this.aiEnabled && Array.isArray(this.cars)) {
      for (const car of this.cars) {
        car.passed = false;
        car.trafficWideCleared = false;
        car._trafficCrashApplied = false;
      }
    }

    // Reset UI elements
    this.textElement.innerHTML = "INSERT COIN";
    this.textElement.classList.add("blink");
    this.heroElement.style.backgroundPosition = "-110px 0";
    this.heroElement.classList.remove('hero-boosting', 'hero-braking');
    this.boostBar.style.width = "100%";
    document.getElementById("boostTextOverlay").style.display = "block";
    
    // Hide game UI
    this.roadElement.style.opacity = 0.4;
    this.hudElement.style.display = "none";
    this.homeElement.style.display = "block";
    this.tachoElement.style.display = "block";
  },
};
