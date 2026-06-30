import { ASSETS, getAssetsForLevel } from '../config/assets.js';
import { getCurrentLevel } from '../config/levels.js';
import { Line } from '../classes/Line.js';
import { Car } from '../classes/Car.js';
import { Audio } from '../classes/Audio.js';
import { Road } from '../classes/Road.js';
import { Stopwatch } from '../classes/Stopwatch.js';
import { KEYS, initControls } from './controls.js';
import { updateDrivingPhysics } from './drivingPhysics.js';
import { TrafficWorld } from './trafficWorld.js';
import * as constants from '../config/constants.js';
import { timestamp, accelerate, isCollide, getRand, randomProperty, drawQuad, sleep } from '../utils/helpers.js';
import { genMap, debugTrackLayout } from './mapGenerator.js';
import { seedFromString, createRng, terrainUndulation } from './mathUtils.js';
import { LevelSelectMixin } from './levelSelect.js';
import { ScoringMixin } from './scoring.js';
import { TrafficMixin } from './trafficController.js';
import { RoadRenderMixin } from './roadRender.js';
import { LevelManagerMixin } from './levelManager.js';
import { HudMixin } from './hud.js';
import { SetupMixin } from './setup.js';
import { SimulationMixin } from './simulation.js';
import { DriveDebugMixin } from './driveDebug.js';
import { JuiceMixin } from './juice.js';
import { GarageMixin } from './garage.js';
import { Progression } from './progression.js';
import { PickupsMixin } from './pickups.js';
import { DriftMixin } from './drift.js';
import { StageTransitionMixin } from './stageTransition.js';

class GameEngine {
  constructor() {
    this.gameElement = document.getElementById('game');
    this.homeElement = document.getElementById("home");
    this.roadElement = document.getElementById("road");
    this.hudElement = document.getElementById("hud");
    this.cloudElement = document.getElementById("cloud");
    this.textElement = document.getElementById("text");
    this.scoreElement = document.getElementById("score");
    // TIME HUD removed
    this.timeElement = null;
    this.tachoElement = document.getElementById("tacho");
    this.lapElement = document.getElementById("lap");
    this.levelElement = document.getElementById("level");
    this.heroElement = document.getElementById("hero");
    this.levelSelectElement = document.getElementById("level-select");

    // Initialize level system
    this.currentLevelIndex = 0;
    this.levelsCompleted = 0;
    this.currentAssets = ASSETS; // Start with default assets
    this.selectedLevelIndex = 0; // For level select screen
    this.inLevelSelect = false;
    this.levelSelectCooldown = 0; // Prevent immediate key processing

    this.lines = [];
    this.manualAssets = new Set();
    this.cars = [];
    // Toggle to enable/disable AI logic and honking
    this.aiEnabled = true; // ENABLED for near-miss scoring system
    this.carsInitialized = false; // Track if cars have been spawned for this game session
    const query = new URLSearchParams(window.location.search);
    this.selectedDensityKey = constants.normalizeTrafficDensityKey(query.get('density'));
    this.selectedDensityPreset = constants.getTrafficDensityPreset(this.selectedDensityKey);
    this.debugDrive = query.has('debugDrive') || localStorage.getItem('freewayDebugDrive') === '1';
    this.debugCollision = this.debugDrive || query.has('debugCollision') || localStorage.getItem('freewayDebugCollision') === '1';
    this.collisionDebugEvents = [];
    this.collisionDebugFrame = 0;
    if (this.debugCollision || this.debugDrive) {
      window.freewayDebug = window.freewayDebug || {};
      window.freewayDebug.game = this;
      window.freewayDebug.collision = {
        events: this.collisionDebugEvents,
        dump: () => this.collisionDebugEvents.slice(-30),
        clear: () => {
          this.collisionDebugEvents.length = 0;
          console.info('[collision-debug] cleared');
        },
      };
      if (this.debugDrive) {
        window.freewayDebug.drive = {
          snapshot: () => this._buildDriveDebugSnapshot?.() || null,
        };
      }
      console.info('[collision-debug] enabled. Use freewayDebug.collision.dump() for the latest events.');
      if (this.debugDrive) console.info('[drive-debug] enabled. Use freewayDebug.drive.snapshot() for live overlay state.');
    }
    
    // Near-Miss Scoring System
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.carIdCounter = 0; // Unique ID generator for cars
    this.passedCars = new Set(); // Track which cars we've already scored (permanent until reset)
    
    // New segment-based road system
    this.road = new Road();
    this.stopwatch = new Stopwatch();
    
    // Legacy properties (will be gradually replaced)
    this.trackLength = 0;
    this.pos = 0;
    this.lastValidPos = 0;
    this.playerX = 0;
    this.speed = 0;
    this.steerVelocity = 0;
    this.currentLap = 0; // Track completed laps
    this.totalDistance = 0; // Track total distance traveled
    this.lastDistanceDelta = 0;
    this.scoreVal = 0;
    this.inGame = false;
    this.mapIndex = 0;
    this.sectionProg = 0;
    this.boostTimer = 0;
    this.isBoosting = false;
    this.boostCooldownTimer = 0;
    this.lastDrivingInput = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      boost: false,
    };
    this.countDown = constants.totalTime;
    this.start = timestamp();

    // Sky cycling
    this.currentSkyIndex = 0;
    this.shouldUpdateSkyNextGame = false;
    this.isFirstGame = true;
    this.hasCompletedFirstLap = false;
    this.finishCrossed = false; // Gate finish progression per level

    this.highscores = [];
    
    // Load high score from localStorage (using 'freewayHighScore' key for FlashCore compatibility)
    this.highScore = parseInt(localStorage.getItem('freewayHighScore')) || 0;
    
    // Meta-progression: persistent credits, upgrades, and paint (localStorage-backed).
    this.progression = new Progression();
    this.inGarage = false;

    // Road pickups (collectibles)
    this._initPickups();

    // Drift scoring
    this._initDrift();

    // Stage transition sequence
    this._initStageTransition();

    // Progressive difficulty system
    this.difficultyMultiplier = 1.0; // Starts at 1.0, increases over time
    this.difficultyTimer = 0; // Tracks time for difficulty scaling
    this.baseMaxSpeed = constants.maxSpeed; // Overwritten by _applyRunTuning() with upgrades applied
    
    // Screen shake system
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // Crash recovery: invulnerability window so player can steer away
    this.crashRecoveryUntil = 0;
    // Traffic grace: no traffic for 1.5s after start or checkpoint (sector change)
    this.trafficGraceUntil = 0;
    this.postCrashRespawnGraceUntil = 0;
    this.recoveryVisualActive = false;
    this.simTimeMs = 0;
    this.lastTrafficRespawnAt = -Infinity;
    this.runSeed = 0;
    this._rng = createRng(0);
    this._initRunRng();
    this.trafficWorld = new TrafficWorld({
      random: () => this._random(),
      vehicles: ASSETS.IMAGE.VEHICLES,
      lanes: Object.values(constants.LANE),
      config: this._getTrafficWorldConfig(),
    });
    this.trafficCarElements = new Map();
    this.trafficProjectionRows = [];
    
    // Initialize map with current level
    this.map = genMap(this.currentLevelIndex);
    
    console.log('Generated map with', this.map.length, 'sections for level', this.currentLevelIndex);
    
    // Minimap removed

    // Get DOM elements
    this.gameElement = document.getElementById('game');
    this.roadElement = document.getElementById('road');
    this.cloudElement = document.getElementById('cloud');
    this.heroElement = document.getElementById('hero');
    this.hudElement = document.getElementById('hud');
    this.homeElement = document.getElementById('home');
    this.textElement = document.getElementById('text');
    // TIME HUD removed
    this.timeElement = null;
    this.scoreElement = document.getElementById('score');
    this.lapElement = document.getElementById('lap');
    this.highScoreElement = document.getElementById('highscore-value');
    
    // Display initial high score
    if (this.highScoreElement) {
      this.highScoreElement.innerText = this.highScore.toString().padStart(6, '0');
    }
    this.tachoElement = document.getElementById('tacho');
    this.highscoreElement = document.getElementById('highscore');
    this.boostBar = document.getElementById('boostBar');
    this.boostText = document.getElementById('boostText');

    // Cache hot-path HUD/feedback elements so per-frame updates don't re-query the DOM.
    // best-lap is created dynamically, so it stays lazily looked up where used.
    this.boostTextOverlayEl = document.getElementById('boostTextOverlay');
    this.comboDisplayEl = document.getElementById('combo-display');
    this.recoveryIndicatorEl = document.getElementById('recovery-indicator');
    this.crashOverlayEl = document.getElementById('crash-overlay');
    this.crashTextEl = document.getElementById('crash-text');

    // Initialize controls
    initControls();
    this._initDriveDebug?.();

    // Build the effective run config (top speed / boost / start time) + apply paint.
    this._applyRunTuning();

    // Initialize game
    this.init();
  }

  // (moved to setup.js — mixed into the prototype below the class)

  _seedFromString(value) {
    return seedFromString(value);
  }

  _initRunRng() {
    let seedValue = Date.now();
    try {
      const seedParam = new URLSearchParams(window.location.search).get('seed');
      if (seedParam != null && seedParam !== '') {
        const parsed = Number(seedParam);
        seedValue = Number.isFinite(parsed) ? parsed : seedFromString(seedParam);
      }
    } catch (e) {
      seedValue = Date.now();
    }

    this.runSeed = (seedValue >>> 0) || 0x9e3779b9;
    this._rng = createRng(this.runSeed);
    console.log(`[RunRNG] seed=${this.runSeed}`);
  }

  _random() {
    return this._rng.random();
  }

  _randomInt(max) {
    return this._rng.randomInt(max);
  }

  _pickRandom(items) {
    return this._rng.pick(items);
  }

  // Traffic methods [A] — moved to trafficController.js (mixed into the prototype below).
  // (moved to setup.js — mixed into the prototype below the class)

  init() {
    this.setupGameElements();
    this.initAudio();
    // Only initialize AI cars when enabled
    if (this.aiEnabled) {
      console.log('init: Spawning initial cars');
      this.initCars();
      this.carsInitialized = true; // Mark cars as initialized
      console.log(`init: carsInitialized set to ${this.carsInitialized}`);
    } else {
      this.cars = [];
    }
    this.initRoad();
    this._initJuiceFx(); // after initRoad so the speed-lines overlay survives the road clear
    this.initHighscore();
    this.initLevelSelect(); // Initialize level select handlers
    this.reset();
    this.startGameLoop();
  }

  // (moved to setup.js — mixed into the prototype below the class)

  // (moved to hud.js — mixed into the prototype below the class)

  pause() {
    if (!this.isPaused && this.inGame) {
      this.isPaused = true;
      this.pauseStartTime = timestamp();
      // Duck music volume instead of suspending context
      if (this.audio) {
        this.audio.pauseWithVolumeduck();
      }
      
      // Prevent asset cleanup while paused by clearing timers
      // Only target manual assets we created
      this.manualAssets.forEach(element => {
        if (element._cleanupTimer) {
          clearTimeout(element._cleanupTimer);
          element._cleanupTimer = null;
        }
      });
    }
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      // Add the paused time to total paused time
      this.totalPausedTime += timestamp() - this.pauseStartTime;
      // Restore music volume
      if (this.audio) {
        this.audio.resumeFromVolumeDuck();
      }
      
      // Restart asset cleanup timers when resuming
      // Only target manual assets we created
      this.manualAssets.forEach(element => {
        if (!element._cleanupTimer) {
          element._cleanupTimer = setTimeout(() => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
            this.manualAssets.delete(element);
          }, 100); // Slightly longer delay after resume
        }
      });
    }
  }

  startGameLoop() {
    this.lastTime = timestamp();
    // Remove frame rate limiting to use native vsync for smoother rendering
    // this.targetFrameRate = 1000 / 25;

    this.loop();
  }

  loop() {
    requestAnimationFrame(this.loop.bind(this));

    this.audio?.keepAlive();

    let now = timestamp();
    let delta = now - this.lastTime;
    this.lastTime = now;

    // Use vsync-based timing instead of artificial frame limiting
    // Cap delta to prevent large jumps during lag
    const cappedDelta = Math.min(delta, 1000 / 15); // Max 15 FPS minimum
    this.update(cappedDelta / 1000);
    
    // Update screen shake
    if (this.shakeDuration > 0) {
      this.shakeDuration -= cappedDelta;
      if (this.shakeDuration <= 0) {
        // Reset shake
        this.gameElement.style.transform = 'translate(0, 0)';
        this.shakeIntensity = 0;
      } else {
        // Apply shake
        const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
        const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
        this.gameElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
    }
  }
  
  // (moved to hud.js — mixed into the prototype below the class)

  update(step) {
    // Validate step parameter
    if (isNaN(step) || step === undefined || step === null || step < 0) {
      console.warn('Invalid step value:', step, 'skipping frame');
      return;
    }

    // Skip update if game is paused
    if (this.isPaused) {
      return;
    }
    
    // Minimap rendering removed

    // Update cooldown timer
    if (this.levelSelectCooldown > 0) {
      this.levelSelectCooldown -= step * 1000; // Convert to milliseconds
    }

    // Handle level select input
    this.handleLevelSelectInput();
    
    // Handle coin insert (only when not in game and not in level select)
    if (!this.inGame && !this.inLevelSelect && this.levelSelectCooldown <= 0) {
      if (KEYS.Insert || KEYS.KeyC) {
        console.log('Coin inserted - showing level select...'); // Debug log
        this.showLevelSelect();
        return;
      }
    }

    // Handle keyboard input
    if (this.inGame) {
      this.simTimeMs += step * 1000;
      const input = {
        accelerate: KEYS.ArrowUp || KEYS.KeyW,
        brake: KEYS.ArrowDown || KEYS.KeyS,
        left: KEYS.ArrowLeft || KEYS.KeyA,
        right: KEYS.ArrowRight || KEYS.KeyD,
        boost: KEYS.Space,
      };
      this.lastDrivingInput = input;

      if (input.right) {
        this.heroElement.style.backgroundPosition = "-220px 0";
      } else if (input.left) {
        this.heroElement.style.backgroundPosition = "0 0";
      } else {
        this.heroElement.style.backgroundPosition = "-110px 0";
      }

      const physics = updateDrivingPhysics(
        {
          speed: this.speed,
          playerX: this.playerX,
          steerVelocity: this.steerVelocity,
          isBoosting: this.isBoosting,
          boostTimer: this.boostTimer,
          boostCooldownTimer: this.boostCooldownTimer,
        },
        input,
        this.cfg || constants,
        step
      );

      this.speed = physics.speed;
      this.playerX = physics.playerX;
      this.steerVelocity = physics.steerVelocity;
      this.isBoosting = physics.isBoosting;
      this.boostTimer = physics.boostTimer;
      this.boostCooldownTimer = physics.boostCooldownTimer;
      this.lastDistanceDelta = physics.distanceDelta;
      if (physics.boostStarted) {
        this.audio?.play('boost');
        this.audio?.playWhoosh?.();
        this._boostPunch?.();
      }
      this.heroElement.classList.toggle('hero-boosting', this.isBoosting);
      this.heroElement.classList.toggle('hero-braking', input.brake && this.speed > 8);

      if (!Number.isFinite(this.speed)) {
        console.warn('Invalid speed detected, resetting to 0');
        this.speed = 0;
        this.lastDistanceDelta = 0;
      }

      // Update boost UI
      this.updateBoostUI();
    }

    // Update position (only when in game) — matches original: pos += speed (units per frame)
    if (this.inGame) {
      const Lc = this._getTrackWrapLength();
      this._collisionPosFrameStart = ((this.pos % Lc) + Lc) % Lc;
      this.lastValidPos = this.pos; // Save for finish-line crossing detection
      this.pos += this.lastDistanceDelta;
      const trackLength = this._getTrackWrapLength();
      if (isNaN(trackLength) || trackLength <= 0) {
        const fallbackLength = constants.mapLength;
        while (this.pos >= fallbackLength) this.pos -= fallbackLength;
        while (this.pos < 0) this.pos += fallbackLength;
      } else {
        while (this.pos >= trackLength) this.pos -= trackLength;
        while (this.pos < 0) this.pos += trackLength;
      }
    }

    // Only perform game calculations when in game
    if (this.inGame) {
      // Clamp playerX before traffic checks so collision matches visual boundaries (R2)
      const roadBoundaryLeft = -0.95;
      const roadBoundaryRight = 0.95;
      this.playerX = this.playerX.clamp(roadBoundaryLeft, roadBoundaryRight);

      // Ensure pos is valid
      if (isNaN(this.pos) || this.pos === undefined || this.pos === null) {
        if (this.lastValidPos != null && !isNaN(this.lastValidPos)) {
          this.pos = this.lastValidPos;
        } else {
          this.pos = 0;
          this.lastValidPos = 0;
        }
      } else {
        this.lastValidPos = this.pos;
      }

      const startPos = (Math.floor(this.pos / constants.segL) % constants.N + constants.N) % constants.N;
      const endPos = (startPos + constants.drawDistance) % constants.N;

      if (isNaN(startPos) || isNaN(endPos)) {
        console.warn('Invalid startPos or endPos:', { pos: this.pos, startPos, endPos });
        return;
      }

      // Update game state (checkpoints, respawn, etc.) — pos already advanced above
      this.updateGameState(step, startPos, endPos);

      // Update sky if needed
      this.updateSky();

      // Draw first so traffic collision uses the same projected bounds players see.
      this.drawRoad(startPos, endPos, step);
      if (this.inGame && this.aiEnabled) {
        this._trafficWorldHits();
      }
      this._collectPickupsVisual?.(); // pixel-accurate pickup collection (after projection)
      this._updateDriveDebugOverlay?.();
      this.updateUI(startPos, step);
      this._updateSpeedFx?.(step);
      this._updateDrift?.(step);
    }
    this._updateStageTransition?.(step);

    this._updateRecoveryVisuals();
    if (!this.inGame) {
      this._clearSpeedFx?.();
      this._updateDriveDebugOverlay?.();
    }
  }

  // (moved to hud.js — mixed into the prototype below the class)

  // Scoring / combo system (getComboMultiplier, spawnScoreText, updateComboSystem,
  // updateComboDisplay, onCollision, _scoreNearMiss) lives in scoring.js and is
  // mixed into the prototype below the class definition.

  // (moved to simulation.js — mixed into the prototype below the class)

  // (moved to hud.js — mixed into the prototype below the class)

  drawRoad(startPos, endPos, step) {
    // Safety check: ensure lines array is initialized and startPos is valid
    if (!this.lines || this.lines.length === 0 || startPos >= this.lines.length || startPos < 0 || !this.lines[startPos]) {
      console.warn('drawRoad called with invalid state:', {
        linesLength: this.lines?.length || 0,
        startPos,
        endPos,
        lineAtStartPos: this.lines?.[startPos]
      });
      return;
    }
    
    // Track which cars need to be drawn this frame
    for (let car of this.cars) {
      // Track visibility: reset marker; set when actually drawn later
      car.wasDrawnThisFrame = false;
      // Don't clear background here - we'll hide invisible cars after drawing
    }
    
    let maxy = constants.height;
    // Eye height stays constant; the near row's elevation is the reference the projection
    // measures other rows against (and amplifies by HEIGHT_PROJECTION_GAIN so grades read).
    // Reference elevation = the road height at the near row, computed CONTINUOUSLY from the
    // player's position (not read off a discrete ring row that steps at each segment boundary).
    // With HEIGHT_PROJECTION_GAIN, any step here is multiplied into a big vertical jerk of the
    // near road and the cars on it — so this must vary smoothly with pos. Matches the near
    // row's own line.y formula (segment height + undulation at pos + near-plane) so the road
    // directly under the camera stays put.
    const roadLen = this.road.length || 0;
    const camElevation = roadLen > 0
      ? (this.road.getHeight(((this.pos + 270) % roadLen + roadLen) % roadLen)
          + terrainUndulation(((this.pos + 270) % roadLen + roadLen) % roadLen, roadLen, constants.TERRAIN_UNDULATION))
      : (this.lines[startPos]?.y || 0);
    // Sub-segment camera offset: startPos only advances at whole-segment boundaries, so on
    // its own the projection freezes within a segment and jumps each crossing (choppy
    // scenery). Adding pos-within-segment makes camera depth continuous → the road and all
    // sprites scroll as smoothly as the player drives.
    const subSeg = ((this.pos % constants.segL) + constants.segL) % constants.segL;
    let x = 0;
    let dx = 0;
    const spriteFrameId = (this.spriteFrameId = (this.spriteFrameId || 0) + 1);
    this.trafficProjectionRows = [];
    let previousDrawableLine = null;
    const hideRoadRow = (line) => {
      if (!line?.elements) return;
      for (let i = 0; i < 8; i++) {
        const element = line.elements[i];
        if (!element) continue;
        element.style.display = 'none';
        element.style.background = 'transparent';
        element.style.backgroundImage = 'none';
      }
    };

    // Render at most one finish banner per frame
    let finishRenderedThisFrame = false;
    // Render at most one checkpoint banner per frame
    let checkpointRenderedThisFrame = false;

    // Calculate hero car scale based on perspective (simulate closest line to camera)
    const heroZ = 270; // Similar to closest line z position
    const camZ = startPos * constants.segL;
    const heroScale = constants.camD / (heroZ - camZ + startPos * constants.segL);
    const heroW = heroScale * constants.roadW * constants.halfWidth;
    const heroCarWidth = (ASSETS.IMAGE.HERO.width * heroW) / 220;
    
    // Update hero car scale to match perspective
    const baseHeroWidth = 110; // Original sprite width
    const perspectiveScale = heroCarWidth / baseHeroWidth;
    const heroSizeAdjustment = 0.470; // Smaller hero for more readable dodge gaps
    const baseScale = Math.max(0.5, perspectiveScale * heroSizeAdjustment);
    const maxSteer = Math.max(constants.MAX_STEER_VELOCITY || 1, 0.001);
    const steerLean = Math.max(-1, Math.min(1, (this.steerVelocity || 0) / maxSteer));
    const input = this.lastDrivingInput || {};
    const brakeDip = input.brake && this.speed > 8 ? Math.min(5, this.speed / 16) : 0;
    const boostStretch = this.isBoosting ? 1.055 : 1;
    const boostSquash = this.isBoosting ? 0.975 : 1;
    const speedVibration = this.speed > 72
      ? Math.sin(this.simTimeMs * 0.055) * Math.min(2, (this.speed - 72) / 22)
      : 0;
    const leanDegrees = steerLean * 4.5;
    const skewDegrees = -steerLean * 2.5;
    this.heroElement.style.transform =
      `translate(${speedVibration.toFixed(2)}px, ${brakeDip.toFixed(2)}px) ` +
      `rotate(${leanDegrees.toFixed(2)}deg) skewX(${skewDegrees.toFixed(2)}deg) ` +
      `scale(${(baseScale * boostStretch).toFixed(4)}, ${(baseScale * boostSquash).toFixed(4)})`;

    // Cache the hero hitbox (road-relative) from the same scale math, so collision
    // reads pure game state instead of getBoundingClientRect() — no forced reflow,
    // and crashes don't shift with the steering lean (rotate/skew intentionally ignored).
    const hbSx = baseScale * boostStretch;
    const hbSy = baseScale * boostSquash;
    const hbW = ASSETS.IMAGE.HERO.width * hbSx;
    const hbH = ASSETS.IMAGE.HERO.height * hbSy;
    const hbCx = constants.halfWidth + speedVibration;
    const hbCy = (constants.height - 80) + ASSETS.IMAGE.HERO.height / 2 + brakeDip;
    this._heroBounds = {
      left: hbCx - hbW / 2,
      top: hbCy - hbH / 2,
      right: hbCx + hbW / 2,
      bottom: hbCy + hbH / 2,
      width: hbW,
      height: hbH,
    };

    for (let n = startPos; n < startPos + constants.N; n++) {
      let l = this.lines[n % constants.N];
      if (!l) {
        console.warn('Line is undefined at index:', n % constants.N);
        continue;
      }
      l.beginSpriteFrame?.(spriteFrameId);
      let level = constants.N * 2 - n;

      // Sample curve/height at the camera's track position plus this row's depth ahead,
      // i.e. the SAME depth the projection uses below ((n - startPos)*segL + 270). This is
      // continuous both within a frame (no ring-wrap seam) and across segment crossings
      // (no startPos-dependent term that lurches when startPos wraps every N segments).
      const lineWorldZ = this.pos + (n - startPos) * constants.segL + 270;
      this.applyMapToLine(l, lineWorldZ, n);

      // update view
      l.project(
        this.playerX * constants.roadW - x,
        constants.H,
        startPos * constants.segL + subSeg - (n >= constants.N ? constants.N * constants.segL : 0),
        camElevation,
        constants.HEIGHT_PROJECTION_GAIN
      );
      x += dx;
      dx += l.curve;

      const p = previousDrawableLine || this.lines[(n - 1) % constants.N] || l;

      // Scenery sprites can extend far above/away from the projected road strip,
      // so draw them before asphalt-row culling. Otherwise far buildings/hills on
      // rows that share the same projected Y get hidden on alternating frames.
      // maxy here is the nearest hill crest (highest road point drawn so far), so any
      // sprite on this row is clipped/hidden at that line — no scenery showing through hills.
      l.spriteClipY = maxy;
      this._drawScenery(l, n, level, lineWorldZ);

      // update road - cull segments that are not drawable this frame. A small overdraw
      // buffer keeps borderline rows (those projecting to nearly the same Y as the current
      // crest) drawn instead of flipping in/out frame-to-frame — which flickers at speed and
      // makes cars sampling those rows judder. The kept rows sit behind nearer rows by
      // z-index, so there's no visual cost.
      if (l.Y >= maxy + 2) {
        hideRoadRow(l);
        l.clearSprites();
        continue;
      }

      // Cull only when the whole projected road strip is off-screen. Centerline-only
      // culling can drop the asphalt under traffic for a frame on hard bends.
      const screenMargin = constants.width * 0.35;
      const pX = p?.X ?? l.X;
      const pW = p?.W || l.W;
      const leftEdge = Math.min(l.X - l.W * 1.25, pX - pW * 1.25);
      const rightEdge = Math.max(l.X + l.W * 1.25, pX + pW * 1.25);
      if (rightEdge < -screenMargin || leftEdge > constants.width + screenMargin) {
        hideRoadRow(l);
        l.clearSprites();
        continue;
      }

      maxy = Math.min(maxy, l.Y); // occlusion line only rises; overdrawn rows never push it down
      previousDrawableLine = l;
      this._rememberTrafficProjectionRow(l, n - startPos);

      if (l.special) {
        const isFinishSprite = !!(l.special && l.special.src && l.special.src.includes('finish'));
        if (isFinishSprite) {
          if (!finishRenderedThisFrame) {
            // Draw finish banner into a dedicated element to prevent per-line clearing flicker
            l.drawSprite(level + 1000, this.finishBannerEl, l.special, l.special.offset || 0);
            finishRenderedThisFrame = true;
          }
        } else {
          // Non-finish specials can stay on default sprite layer
          l.drawSprite(level + 600, 8, l.special, l.special.offset || 0);
        }
      }

      // Render checkpoint banner near intelligent/timed positions
      if (!checkpointRenderedThisFrame && this.road && Array.isArray(this.road.checkpointPositions) && this.road.checkpointPositions.length > 0) {
        const roadLen = this.road.length || 0;
        if (roadLen > 0) {
          const normalizedZ = ((lineWorldZ % roadLen) + roadLen) % roadLen;
          // Road lines are ~segL apart, so a ±30 window catches a line only ~30% of frames —
          // the banner blinked in/out on approach. A half-segment window guarantees a line
          // always owns the checkpoint, so the gate stays solid (it's drawn on the nearest
          // qualifying line; the final near-approach is masked by the stage-transition wipe).
          const tolerance = constants.segL * 0.5;
          for (let i = 0; i < this.road.checkpointPositions.length; i++) {
            const cp = this.road.checkpointPositions[i];
            const directDistance = Math.abs(normalizedZ - cp);
            const wrapDistance = roadLen - directDistance;
            const distance = Math.min(directDistance, wrapDistance);
            if (distance <= tolerance) {
              const sprite = this.currentAssets.IMAGE.CHECKPOINT || ASSETS.IMAGE.FINISH;
              const isUsingFinishSprite = !!(sprite && sprite.src && sprite.src.includes('finish'));

              // Always draw checkpoint banner into checkpointBannerEl
              // Even if it uses finish.png as a fallback, do NOT use finishBannerEl
              if (!(isUsingFinishSprite && finishRenderedThisFrame)) {
                l.drawSprite(level + 950, this.checkpointBannerEl, sprite, sprite.offset || 0);
                if (isUsingFinishSprite) {
                  finishRenderedThisFrame = true; // Block finish banner duplicate this frame
                }
              }
              checkpointRenderedThisFrame = true;
              break;
            }
          }
        }
      }

      // Traffic cars are rendered by _renderTrafficCars() (TrafficWorld path), called
      // once at the end of this method — no per-line car drawing needed here.
      
      let even = ((n / 2) | 0) % 2;
      let grass = this.currentAssets.COLOR.GRASS[even * 1];
      let grassLeft = this.currentAssets.COLOR.GRASS_LEFT ? this.currentAssets.COLOR.GRASS_LEFT[even * 1] : grass;
      let rumble = this.currentAssets.COLOR.RUMBLE[even * 1];
      let tar = this.currentAssets.COLOR.TAR[even * 1];

      this._drawTerrainZones(l, p, level, even, grass, grassLeft);

      this._drawRoadSurface(l, p, level, even, rumble, tar);
      l.clearSprites();
    }

    // Hide finish banner element if it wasn't rendered this frame
    if (!finishRenderedThisFrame && this.finishBannerEl) {
      this.finishBannerEl.style.display = 'none';
    }
    // Hide checkpoint banner element if it wasn't rendered this frame
    if (!checkpointRenderedThisFrame && this.checkpointBannerEl) {
      this.checkpointBannerEl.style.display = 'none';
    }
    
    this._renderTrafficCars(startPos);
    this._renderPickups();
  }


  // Level Management Methods
  // Level / map lifecycle (changeLevel, nextLevel, getCurrentLevelName,
  // updateLevelDisplay, checkLevelCompletion, buildRoadFromMap, startGame)
  // lives in levelManager.js, mixed into the prototype below the class.
}

// Methods split into cohesive modules and mixed into the prototype. Each runs with
// `this` bound to the engine instance, identical to a method defined inline.
Object.assign(GameEngine.prototype, LevelSelectMixin);
Object.assign(GameEngine.prototype, ScoringMixin);
Object.assign(GameEngine.prototype, TrafficMixin);
Object.assign(GameEngine.prototype, RoadRenderMixin);
Object.assign(GameEngine.prototype, LevelManagerMixin);
Object.assign(GameEngine.prototype, HudMixin);
Object.assign(GameEngine.prototype, SetupMixin);
Object.assign(GameEngine.prototype, SimulationMixin);
Object.assign(GameEngine.prototype, DriveDebugMixin);
Object.assign(GameEngine.prototype, JuiceMixin);
Object.assign(GameEngine.prototype, GarageMixin);
Object.assign(GameEngine.prototype, PickupsMixin);
Object.assign(GameEngine.prototype, DriftMixin);
Object.assign(GameEngine.prototype, StageTransitionMixin);

export default GameEngine;
