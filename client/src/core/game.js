import GameEngine from './gameEngine.js';
import { Car } from '../classes/Car.js';
import { ASSETS } from '../config/assets.js';
import * as constants from '../config/constants.js';

/**
 * Arcade Run mode — wraps GameEngine with a proper game loop:
 *
 *  - 45-second countdown timer (displayed in HUD)
 *  - Every 30s a checkpoint spawns ahead of the player
 *  - Passing a checkpoint: +15s, environment swap, +1 traffic car, combo reset
 *  - Collision: combo breaks (handled in base class)
 *  - Timer hits 0: game over (score screen, menu music)
 */
class Game extends GameEngine {
  constructor() {
    super();
    this._initArcadeState();
  }

  _initArcadeState() {
    // Countdown timer (seconds remaining in the run) — includes any Reserve Tank upgrade.
    this.arcadeTimer = this.startTimeEff ?? constants.ARCADE_START_TIME;
    // Countdown until next checkpoint spawns
    this.checkpointCountdown = constants.ARCADE_CHECKPOINT_INTERVAL;
    // Whether a checkpoint is currently on the road waiting to be passed
    this.checkpointSpawned = false;
    // Guard: prevent double-triggering a single checkpoint pass
    this.checkpointPassed = false;
    // How many checkpoints have been passed this run (drives traffic escalation)
    this.checkpointsPassed = 0;
    this.sectorsCleared = 0;
    this.crashes = 0;
    this.nearMisses = 0;
    this.perfectPasses = 0;
    this.cleanSectors = 0;
    // Best combo achieved this run (for results screen)
    this.maxCombo = 0;
    this.selectedCourse = this.getCurrentLevelName?.() || 'COURSE';
    this.selectedCourseIndex = this.currentLevelIndex || 0;
    this.selectedDensityKey = constants.normalizeTrafficDensityKey(this.selectedDensityKey);
    this.selectedDensityPreset = constants.getTrafficDensityPreset(this.selectedDensityKey);
    this.scoreMultiplier = this._getDensityScoreMultiplier?.() || this.selectedDensityPreset.scoreMultiplier || 1;
    // Cached DOM element for the arcade timer display
    this.arcadeTimerEl = null;
    this.arcadeTimerValueEl = null;
    this.crashedThisSector = false; // For clean-sector bonus
  }

  // ─── Override startGame ────────────────────────────────────────────────────

  startGame() {
    // Force fresh car spawn every run (base class skips if carsInitialized)
    this.carsInitialized = false;
    // Reset before super so initCars uses correct count (prevents "starts different than ends")
    this.levelsCompleted = 0;

    super.startGame();

    // Reset arcade run state
    this._initArcadeState();

    // Re-spawn cars at proper positions relative to player (pos=0)
    // Base class initCars uses fixed spawn distances (30-62) which are fine for pos=0
    // But we also need to ensure car positions are within draw distance
    this._respawnCarsForNewRun();

    // Grab timer DOM elements (created in index.html)
    this.arcadeTimerEl = document.getElementById('arcade-timer');
    this.arcadeTimerValueEl = document.getElementById('arcade-timer-value');

    // Show the timer
    if (this.arcadeTimerEl) {
      this.arcadeTimerEl.style.display = 'flex';
      this.arcadeTimerEl.className = ''; // clear warning/critical classes
    }

    // Disable finish-line advancement — we drive the loop ourselves
    this.finishCrossed = false;
    this._suppressFinishLine();

    // Hide results screen if still visible from previous run
    const resultsEl = document.getElementById('results-screen');
    if (resultsEl) resultsEl.style.display = 'none';

    // ── Fade-in animation ─────────────────────────────────────────────────────
    if (this.roadElement) {
      this.roadElement.classList.add('game-fade-in');
      // Remove the class after animation completes so it doesn't interfere
      setTimeout(() => {
        if (this.roadElement) this.roadElement.classList.remove('game-fade-in');
      }, 600);
    }
  }

  /**
   * Respawn all cars at staggered distances ahead of the player for a fresh run.
   * Cars are spread across the visible range so traffic appears immediately.
   */
  _respawnCarsForNewRun() {
    if (this.trafficWorld) {
      this._hideAllTrafficElements?.();
      this.trafficWorld.setVehicles(ASSETS.IMAGE.VEHICLES);
      this.trafficWorld.config = { ...this.trafficWorld.config, ...this._getTrafficWorldConfig() };
      this.trafficWorld.reset({
        simTimeMs: this.simTimeMs,
        playerDistance: this.totalDistance || 0,
        targetCount: this._getTrafficTargetCount(),
      });
      this.cars = this.trafficWorld.cars;
      console.log(`[ArcadeRun] TrafficWorld reset with ${this.cars.length} cars`);
      return;
    }

    if (!this.aiEnabled || !Array.isArray(this.cars)) return;

    const vehicles = ASSETS.IMAGE.VEHICLES;
    if (!Array.isArray(vehicles) || vehicles.length === 0) return;

    const N = constants.N;
    const minSep = constants.MIN_TRAFFIC_SEGMENT_SEP || 12;

    // Spawn with min separation — supports up to 10 cars (AI_MAX_CARS)
    const baseOffsets = [22, 22 + minSep, 22 + minSep * 2, 22 + minSep * 3, 22 + minSep * 4, 22 + minSep * 5];
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      let pos;
      for (let attempts = 0; attempts < 20; attempts++) {
        const base = baseOffsets[i % baseOffsets.length] + this._randomInt(5) - 2;
        pos = ((base % N) + N) % N;
        if (this._isSegmentClear(pos, car.id)) break;
      }
      if (pos === undefined) pos = ((baseOffsets[i % baseOffsets.length] % N) + N) % N;
      car.pos = pos;
      car.lane = this._pickLaneForNewCar(pos);
      car.type = this._pickRandom(vehicles);
      car.passed = false;
      car.trafficWideCleared = false;
      car._trafficCrashApplied = false;
      car.wentBehindAt = null;
      car.spawnTime = this.simTimeMs;
    }

    console.log(`[ArcadeRun] Respawned ${this.cars.length} cars for new run at positions: ${this.cars.map(c => Math.floor(c.pos)).join(', ')}`);
  }

  _suppressFinishLine() {
    if (!this.road) return;
    if (Array.isArray(this.road.segments)) {
      for (const seg of this.road.segments) {
        if (seg && seg.isFinishLine) {
          seg.isFinishLine = false;
          seg.special = null;
        }
      }
    }
    this.road.finishLine = null;
    if (this.road.checkpointPositions) {
      this.road.checkpointPositions = [];
    }
  }

  // ─── Override updateGameState ──────────────────────────────────────────────

  updateGameState(step, startPos, endPos) {
    // ── 1. Spawn checkpoint after interval ───────────────────────────────────
    if (!this.checkpointSpawned) {
      this.checkpointCountdown -= step;
      if (this.checkpointCountdown <= 0) {
        this._spawnCheckpoint();
      }
    }

    // ── 2. Base class: physics, near-miss, respawn, road sync (run first so last frame still simulates)
    super.updateGameState(step, startPos, endPos);

    // ── 3. Decrement arcade countdown timer (paused during the stage-transition wipe so
    //        the sector cutscene doesn't cost the player time) ─────────────────────────────
    if (!(this.isTransitioning && this.isTransitioning())) {
      this.arcadeTimer -= step;
      this._updateTimerHUD();
    }

    // ── 4. Game over when timer expires (after physics so death frame is consistent)
    if (this.arcadeTimer <= 0) {
      this.arcadeTimer = 0;
      this._triggerGameOver();
      return; // skip checkpoint pass detection this frame
    }

    // ── 5. Detect checkpoint pass ──────────────────────────────────────────────
    if (this.checkpointSpawned && !this.checkpointPassed) {
      const cp = this.road.checkpointPositions;
      if (cp && cp.length > 0) {
        const targetIndex = cp.length - 1;
        const hit = this.road.checkCheckpoint(this.pos, 100);
        if (hit && typeof hit.index === 'number' && hit.index === targetIndex) {
          this.checkpointPassed = true;
          this._onCheckpointPassed();
        }
      }
    }
  }

  // ─── Checkpoint helpers ────────────────────────────────────────────────────

  _spawnCheckpoint() {
    const ahead = Math.max(500, (this.speed || 0) * 10 + 800);
    const spawnAbs = (this.totalDistance || 0) + ahead;
    const norm = ((spawnAbs % this.road.length) + this.road.length) % this.road.length;
    const existing = Array.isArray(this.road.checkpointPositions)
      ? this.road.checkpointPositions.slice()
      : [];
    existing.push(norm);
    if (typeof this.road.setCheckpoints === 'function') {
      this.road.setCheckpoints(existing);
    } else {
      this.road.checkpointPositions = existing;
    }
    this.checkpointSpawned = true;
    this.finishCrossed = false;
    console.log('[ArcadeRun] Checkpoint spawned at', Math.round(norm));
  }

  _awardCircuitScore(basePoints, label) {
    const multiplier = this._getDensityScoreMultiplier?.() || 1;
    const points = Math.floor(basePoints * multiplier);
    this.scoreVal += points;
    if (this.inGame && typeof this.spawnScoreText === 'function') {
      const labelText = multiplier === 1 ? label : `${label} x${multiplier}`;
      this.spawnScoreText(points, labelText, constants.halfWidth, constants.height * 0.28, 1);
    }
    return points;
  }

  _onCheckpointPassed() {
    this.checkpointsPassed++;
    this.sectorsCleared++;
    console.log(`[ArcadeRun] Checkpoint #${this.checkpointsPassed} passed!`);

    // Immediate, responsive feedback (timer + score) — the environment swap is deferred to
    // the middle of the stage-transition wipe so the road rebuild is hidden, not a hard cut.
    this.arcadeTimer += constants.ARCADE_CHECKPOINT_BONUS;
    this._flashTimerExtend();
    this._awardCircuitScore(3000, 'CHECKPOINT');
    if (!this.crashedThisSector) {
      this.cleanSectors++;
      this._awardCircuitScore(constants.CLEAN_SECTOR_BONUS, 'CLEAN SECTOR');
    }

    if (typeof this._startStageTransition === 'function') {
      this._startStageTransition({
        stageNumber: (this.sectorsCleared || 0) + 1,
        onSwap: () => this._performSectorSwap(),
      });
    } else {
      this._performSectorSwap();
    }
  }

  // The environment swap — invoked hidden, mid-wipe, by the stage transition (or directly
  // as a fallback if the transition mixin is unavailable).
  _performSectorSwap() {
    // No traffic for TRAFFIC_GRACE_MS after the sector change (like game start)
    this.trafficGraceUntil = this.simTimeMs + (constants.TRAFFIC_GRACE_MS || 2000);

    this.nextLevel();
    this.pos = 0;
    this.lastValidPos = 0;
    this._collisionPosFrameStart = 0;
    this.lastDistanceDelta = 0;
    this.finishCrossed = false;

    this._escalateTraffic();
    this.crashedThisSector = false;

    // Reset combo — fresh start for the new sector
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    if (typeof this.updateComboDisplay === 'function') {
      this.updateComboDisplay();
    }

    // Queue next checkpoint
    this.checkpointSpawned = false;
    this.checkpointPassed = false;
    this.checkpointCountdown = constants.ARCADE_CHECKPOINT_INTERVAL;
    if (this.road && typeof this.road.setCheckpoints === 'function') {
      this.road.setCheckpoints([]);
    } else if (this.road) {
      this.road.checkpointPositions = [];
    }
  }

  _escalateTraffic() {
    if (this.trafficWorld) {
      this.trafficWorld.config = { ...this.trafficWorld.config, ...this._getTrafficWorldConfig() };
      const targetCount = this._getTrafficTargetCount();
      this.trafficWorld.setTargetCount(targetCount);
      this.cars = this.trafficWorld.cars;
      console.log(`[ArcadeRun] Traffic target escalated to ${targetCount} cars`);
      return;
    }

    if (!this.aiEnabled || !Array.isArray(this.cars)) return;
    const vehicles = ASSETS.IMAGE.VEHICLES;
    if (!Array.isArray(vehicles) || vehicles.length === 0) return;

    const currentCount = this.cars.length;
    const targetCount = this._getTrafficTargetCount();
    if (targetCount <= currentCount) return;

    const toAdd = targetCount - currentCount;
    const N = constants.N;
    const minSep = constants.MIN_TRAFFIC_SEGMENT_SEP || 12;

    for (let i = 0; i < toAdd; i++) {
      let pos;
      for (let attempts = 0; attempts < 30; attempts++) {
        const tryPos = (this._randomInt(20) + 42) % N;
        if (this._isSegmentClear(tryPos)) { pos = tryPos; break; }
      }
      // Fallback: try staggered positions with min separation (robust for N=50)
      if (pos === undefined) {
        for (let k = 0; k < 8; k++) {
          const tryPos = (42 + k * minSep + i * 2) % N;
          if (this._isSegmentClear(tryPos)) { pos = tryPos; break; }
        }
      }
      if (pos === undefined) pos = (42 + i * minSep) % N;
      const lane = this._pickLaneForNewCar(pos);
      const type = this._pickRandom(vehicles);
      const newCar = new Car(pos, type, lane, this.simTimeMs);
      newCar.id = this.carIdCounter++;
      newCar.passed = false;
      newCar.trafficWideCleared = false;
      newCar._trafficCrashApplied = false;
      this.cars.push(newCar);
    }
    console.log(`[ArcadeRun] Traffic escalated to ${this.cars.length} cars (target: ${targetCount})`);
  }

  // ─── Collision penalty ─────────────────────────────────────────────────────

  onCollision() {
    this.crashedThisSector = true; // Blocks clean-sector bonus
    this.crashes = (this.crashes || 0) + 1;
    // Crash costs time — makes collisions genuinely threatening
    this.arcadeTimer -= constants.CRASH_TIME_PENALTY;
    if (this.arcadeTimer < 0) this.arcadeTimer = 0;
    this._updateTimerHUD();
    // Flash timer red to signal the loss
    if (this.arcadeTimerEl) {
      this.arcadeTimerEl.classList.add('timer-critical');
      setTimeout(() => {
        if (this.arcadeTimerEl) this.arcadeTimerEl.classList.remove('timer-critical');
      }, 300);
    }
  }

  // ─── Timer HUD helpers ─────────────────────────────────────────────────────

  _updateTimerHUD() {
    if (!this.arcadeTimerEl || !this.arcadeTimerValueEl) return;
    const secs = Math.ceil(this.arcadeTimer);
    this.arcadeTimerValueEl.textContent = secs;

    // Update warning classes
    this.arcadeTimerEl.classList.remove('timer-warning', 'timer-critical');
    if (secs <= 5) {
      this.arcadeTimerEl.classList.add('timer-critical');
    } else if (secs <= 15) {
      this.arcadeTimerEl.classList.add('timer-warning');
    }
  }

  // Add seconds to the run clock (time pickup). Flashes the timer like a checkpoint extend.
  _addArcadeTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.arcadeTimer += seconds;
    this._updateTimerHUD();
    this._flashTimerExtend();
  }

  _flashTimerExtend() {
    if (!this.arcadeTimerEl) return;
    this.arcadeTimerEl.classList.remove('timer-warning', 'timer-critical', 'timer-extend');
    // Force reflow to restart animation
    void this.arcadeTimerEl.offsetWidth;
    this.arcadeTimerEl.classList.add('timer-extend');
    setTimeout(() => {
      if (this.arcadeTimerEl) {
        this.arcadeTimerEl.classList.remove('timer-extend');
      }
    }, 500);
  }

  // ─── Game over ─────────────────────────────────────────────────────────────

  _triggerGameOver() {
    if (!this.inGame) return; // already ended
    this.inGame = false;
    document.body.classList.remove('in-game');

    // Hide timer & combo
    if (this.arcadeTimerEl) this.arcadeTimerEl.style.display = 'none';
    const comboEl = document.getElementById('combo-display');
    if (comboEl) comboEl.style.display = 'none';

    // Final score
    const finalScore = this.scoreVal | 0;
    // Award meta-progression credits for this run (before building the results screen).
    const earnedCredits = this._awardRunCredits?.(finalScore, this.cleanSectors || 0) || 0;
    const isNewHighScore = finalScore > this.highScore;
    if (isNewHighScore) {
      this.highScore = finalScore;
      localStorage.setItem('freewayHighScore', this.highScore.toString());
      if (this.highScoreElement) {
        this.highScoreElement.innerText = this.highScore.toString().padStart(6, '0');
      }
    }

    // Push to highscores list
    this.highscores.push(finalScore.toString().padStart(8, '0'));
    this.highscores.sort((a, b) => parseInt(b) - parseInt(a));
    this.updateHighscore();

    // Hide HUD
    this.tachoElement.style.display = 'none';
    this.hudElement.style.display = 'none';
    this.roadElement.style.opacity = 0.4;
    document.getElementById('music-controls').style.display = 'none';

    // ── Show results screen ──────────────────────────────────────────────────
    const grade = this._calcGrade(finalScore);
    const resultsEl = document.getElementById('results-screen');
    if (resultsEl) {
      // Populate stats
      const gradeEl = document.getElementById('results-grade');
      gradeEl.textContent = grade;
      gradeEl.className = `grade-${grade}`;
      if (isNewHighScore) gradeEl.textContent += ' ★';

      document.getElementById('result-score').textContent = finalScore.toString().padStart(8, '0');
      document.getElementById('result-sectors').textContent = (this.sectorsCleared || 0).toString();
      const densityEl = document.getElementById('result-density');
      if (densityEl) densityEl.textContent = this.selectedDensityPreset?.label || 'STANDARD';
      const multiplierEl = document.getElementById('result-multiplier');
      if (multiplierEl) multiplierEl.textContent = `${this.scoreMultiplier || 1}x`;
      const crashesEl = document.getElementById('result-crashes');
      if (crashesEl) crashesEl.textContent = (this.crashes || 0).toString();
      document.getElementById('result-combo').textContent = (this.maxCombo || 0).toString();
      const driftEl = document.getElementById('result-drift');
      if (driftEl) driftEl.textContent = `${(this.bestDrift || 0).toFixed(1)}s`;
      document.getElementById('result-highscore').textContent = this.highScore.toString().padStart(8, '0');

      // Meta-progression: credits earned this run + new balance.
      const earnedEl = document.getElementById('result-earned');
      if (earnedEl) earnedEl.textContent = `◆ ${earnedCredits.toLocaleString('en-US')}`;
      const balanceEl = document.getElementById('result-credits');
      if (balanceEl && this.progression) {
        balanceEl.textContent = `◆ ${this.progression.credits.toLocaleString('en-US')}`;
      }

      resultsEl.style.display = 'flex';

      // Listen for dismiss
      this._resultsHandler = (e) => {
        if (e.code === 'KeyC' || e.code === 'Insert' || e.code === 'Enter') {
          resultsEl.style.display = 'none';
          document.removeEventListener('keydown', this._resultsHandler);
          // Now show the normal INSERT COIN / home screen
          this.homeElement.style.display = 'block';
          this.textElement.classList.add('blink');
          this.textElement.innerText = 'INSERT COIN';
        }
      };
      document.addEventListener('keydown', this._resultsHandler);
    } else {
      // Fallback if no results element
      this.homeElement.style.display = 'block';
      this.textElement.classList.add('blink');
      this.textElement.innerText = 'INSERT COIN';
    }

    // Music transition
    if (this.audio) {
      this.audio.stopEngine();
      this.audio.fadeOutAndStop(1500).then(() => {
        this.audio.playMenuMusic();
      });
    }

    console.log(`[ArcadeRun] Game over! Score: ${finalScore}, Grade: ${grade}, Sectors: ${this.sectorsCleared || 0}, Density: ${this.selectedDensityPreset?.label || 'STANDARD'}, Best combo: ${this.maxCombo || 0}`);
  }

  _calcGrade(score) {
    if (score >= 50000) return 'S';
    if (score >= 30000) return 'A';
    if (score >= 15000) return 'B';
    if (score >= 5000)  return 'C';
    return 'D';
  }

  // ─── Override checkLevelCompletion ────────────────────────────────────────
  // We drive level transitions ourselves — suppress the base class finish logic.

  checkLevelCompletion() {
    // Intentionally empty: Arcade Run handles all progression in _onCheckpointPassed
    // and game-over in _triggerGameOver. The base class finish-line logic is disabled.
  }
}

export default Game;
