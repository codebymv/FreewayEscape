import * as constants from '../config/constants.js';
import { getAssetsForLevel } from '../config/assets.js';
import { getCurrentLevel, LEVEL_PROGRESSION } from '../config/levels.js';
import { genMap } from './mapGenerator.js';

// Level / map lifecycle: switching levels, advancing sectors, building the road
// from generated map data, and starting a run. Mixed into GameEngine.prototype;
// every method runs with `this` bound to the engine instance.
export const LevelManagerMixin = {
  // Pick a random time-of-day sky variant for the current level, never repeating the one
  // showing now (so the sky always visibly changes between sectors). Uses Math.random on
  // purpose — the seeded engine RNG is shared with traffic, and sky is cosmetic.
  _pickRandomSkyIndex() {
    const count = this.currentAssets?.IMAGE?.SKY?.length || 1;
    if (count <= 1) return 0;
    const offset = 1 + Math.floor(Math.random() * (count - 1));
    return ((this.currentSkyIndex || 0) + offset) % count;
  },

  changeLevel(newLevelIndex) {
    console.log(`Changing to level ${newLevelIndex}`);
    
    this.currentLevelIndex = newLevelIndex;
    this.currentAssets = getAssetsForLevel(newLevelIndex);
    this.finishCrossed = false; // Reset finish gate for new level
    
    // DON'T hide cars - let them continue rendering naturally across level changes
    // The rendering system will handle them frame-by-frame
    
    // Clear coastal-only overlays if switching away from coastal
    if (this.currentLevelIndex !== 1 && Array.isArray(this.lines) && this.lines.length) {
      for (let i = 0; i < this.lines.length; i++) {
        const line = this.lines[i];
        if (!line || !line.elements) continue;
        if (line.elements[6]) {
          line.elements[6].style.display = 'none';
          line.elements[6].style.background = 'transparent';
        }
        if (line.elements[7]) {
          line.elements[7].style.display = 'none';
          line.elements[7].style.background = 'transparent';
        }
      }
    }
    
    // Random time-of-day each sector for variety (never the same variant twice running).
    this.currentSkyIndex = this._pickRandomSkyIndex();
    const sky = this.currentAssets.IMAGE.SKY[this.currentSkyIndex];
    this.cloudElement.style.backgroundImage = `url(${sky})`;
    this.cloudElement.style.imageRendering = sky.endsWith('.svg') ? 'auto' : 'pixelated';
    // Prevent immediate extra cycle from finish flag
    this.shouldUpdateSkyNextGame = false;
    
    // Regenerate map with new level
    this.map = genMap(newLevelIndex);
    this.buildRoadFromMap(); // Rebuild road geometry; _suppressFinishLine called inside for Arcade
    
    // Minimap track change removed
    
    // Update level display
    this.updateLevelDisplay();
    
    // Reset and restart stopwatch for the new level run
    this.stopwatch.reset();
    this.stopwatch.start();
    
    console.log(`Level changed to: ${this.getCurrentLevelName()}`);
  },

  nextLevel() {
    const nextIndex = (this.currentLevelIndex + 1) % LEVEL_PROGRESSION.length;
    this.levelsCompleted++;
    this.changeLevel(nextIndex);
    
    // Sector change: retire visible traffic, then let TrafficWorld repopulate from the horizon.
    if (this.aiEnabled && this.trafficWorld) {
      this.trafficWorld.clearForSector({
        simTimeMs: this.simTimeMs,
        playerDistance: this.totalDistance || 0,
      });
      this.cars = this.trafficWorld.cars;
      this._hideAllTrafficElements();
    }
  },

  getCurrentLevelName() {
    const level = getCurrentLevel(this.currentLevelIndex);
    return level.name;
  },

  updateLevelDisplay() {
    if (this.levelElement) {
      this.levelElement.textContent = `Level ${this.currentLevelIndex + 1}`;
    }
  },

  // Check if player completed level (could be based on laps, score, etc.)
  checkLevelCompletion() {
    // Lap counter removed; no HUD update needed
    
    // Progress to next level once per level when finish is crossed
    if (this.finishCrossed) {
      console.log('Level completed! Advancing to next level.');
      this.nextLevel();
      this.pos = 0; // Reset position for new level
      this.scoreVal += 5000; // Bonus for completing level
      this.finishCrossed = false; // Prevent duplicate advancement
    }
  },

  // Level Select Methods
  // Level-select screen UI (showLevelSelect / hideLevelSelect / updateLevelSelectUI /
  // updateLevelPreview / handleLevelSelectInput / selectLevel) lives in levelSelect.js
  // and is mixed into the prototype below the class definition.

  /**
   * Build Road system from the generated map data
   * This ensures the Road system matches the actual track being used
   */
  buildRoadFromMap() {
    this.road.reset();
    
    if (!this.map || !this.map.length) {
      console.warn('No map data available, falling back to sample track');
      this.road.buildSampleTrack();
      return;
    }
    
    console.log(`Building road from map: ${this.map.trackName} (${this.map.length} sections)`);
    
    // Convert map sections to road segments
    for (let i = 0; i < this.map.length; i++) {
      const section = this.map[i];
      
      const segmentLength = section.to - section.from;
      
      // Create segment definition based on section type
      const segmentDef = {
        type: section.type,
        curve: section.curve || (() => 0),
        height: section.height || (() => 0)
      };
      
      // Add special properties
      const options = {};
      if (section.special) {
        options.special = section.special;
      }
      if (section.type === 'finish') {
        options.isFinishLine = true;
      }
      
      this.road.addSegment(segmentDef, segmentLength, options);
    }
    
    console.log(`Road built: ${this.road.segments.length} segments, total length: ${this.road.length}`);
    console.log(`Map track length: ${this.map.trackLength}, Road length: ${this.road.length}`);
    
    // Verify lengths match (allow small differences due to finish/checkpoint segments)
    if (Math.abs(this.road.length - this.map.trackLength) > 400) {
      console.warn('Length mismatch between map and road:', {
        mapLength: this.map.trackLength,
        roadLength: this.road.length,
        difference: Math.abs(this.road.length - this.map.trackLength)
      });
    }

    // Sync map.trackLength so _getTrackWrapLength fallback uses road.length when available
    this.map.trackLength = this.road.length;

    // Apply intelligent checkpoints to the road
    if (this.map.checkpoints && this.map.checkpoints.length) {
      this.road.setCheckpoints(this.map.checkpoints);
      console.log(`Applied ${this.map.checkpoints.length} intelligent checkpoints`);
    }
    // Arcade: suppress finish line after every build (prevents random restarts)
    if (typeof this._suppressFinishLine === 'function') this._suppressFinishLine();
  },

  startGame() {
    console.log('Starting game...');
    // Rebuild the effective run config so any garage purchases apply to this run.
    this._applyRunTuning?.();
    this.inGame = true;
    document.body.classList.add('in-game');
    this._initRunRng();
    this.simTimeMs = 0;
    this.crashRecoveryUntil = 0;
    this.trafficGraceUntil = this.simTimeMs + (constants.TRAFFIC_GRACE_MS || 2000);
    this.postCrashRespawnGraceUntil = 0;
    this.recoveryVisualActive = false;
    this.heroElement?.classList.remove('hero-recovery');
    this.roadElement?.classList.remove('recovery-active');
    this.lastTrafficRespawnAt = -Infinity;
    this.speed = 0;
    this.steerVelocity = 0;
    this.pos = 0;
    this.totalDistance = 0;
    this.lastDistanceDelta = 0;
    this.scoreVal = 0;
    this.mapIndex = 0;
    this.sectionProg = 0;
    
    // Reset near-miss combo system
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.passedCars.clear();
    this.carIdCounter = 0; // Fresh IDs per run
    
    // Reset progressive difficulty
    this.difficultyTimer = 0;
    this.difficultyMultiplier = 1.0;

    // Reset road pickups + shield for the new run
    this._resetPickups?.();
    // Reset drift state
    this._resetDrift?.();
    // Clear any lingering stage-transition overlay
    this._endStageTransition?.();
    
    // Build road first so initCars has valid road.length (R5)
    this.buildRoadFromMap();
    this.stopwatch.reset();
    this.stopwatch.start();

    // Update track length from new road system
    this.trackLength = this.road.length;
    if (this.road.length > 0) {
      this._collisionPosFrameStart = ((this.pos % this.road.length) + this.road.length) % this.road.length;
    }

    // Initialize AI cars ONLY on first game start, not on level transitions (after road built)
    console.log(`startGame: carsInitialized=${this.carsInitialized}, aiEnabled=${this.aiEnabled}`);
    if (this.aiEnabled && !this.carsInitialized) {
      console.log('startGame: Initializing cars for first time');
      this.initCars();
      this.carsInitialized = true;
    } else {
      console.log('startGame: Skipping car initialization (already initialized)');
      if (this.aiEnabled && Array.isArray(this.cars)) {
        for (const car of this.cars) {
          car.passed = false;
          car.trafficWideCleared = false;
          car._trafficCrashApplied = false;
        }
      }
    }

    console.log(`Game started with new road system: ${this.road.segments.length} segments, length: ${this.road.length}`);
    
    // Show game UI
    this.roadElement.style.opacity = 1;
    this.hudElement.style.display = "block";
    this.homeElement.style.display = "none";
    this.textElement.classList.remove("blink");
    
    // Show music controls and start driving music
    document.getElementById('music-controls').style.display = 'flex';
    if (this.audio) {
      console.log('Starting music transition: fading out menu music...');
      // Start engine sound
      this.audio.startEngine();
      // Fade out menu music and then start driving music
      this.audio.fadeOutAndStop(1500).then(() => {
        console.log('Menu music fade out complete, starting driving music...');
        this.audio.playDrivingMusic(); // Start driving music after fade
      });
    }
  },
};
