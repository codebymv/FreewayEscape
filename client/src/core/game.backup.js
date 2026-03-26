import { ASSETS, getAssetsForLevel } from '../config/assets.js';
import { getCurrentLevel } from '../config/levels.js';
import { Line } from '../classes/Line.js';
import { Car } from '../classes/Car.js';
import { Audio } from '../classes/Audio.js';
import { Road } from '../classes/Road.js';
import { Stopwatch } from '../classes/Stopwatch.js';
import { KEYS, initControls } from './controls.js';
import * as constants from '../config/constants.js';
import { timestamp, accelerate, isCollide, getRand, randomProperty, drawQuad, sleep } from '../utils/helpers.js';
import { genMap, debugTrackLayout } from './mapGenerator.js';

class Game {
  constructor() {
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
    this.dayCycleIndex = 0; // Global sky/day cycle across levels
    this.selectedLevelIndex = 0; // For level select screen
    this.inLevelSelect = false;
    this.levelSelectCooldown = 0; // Prevent immediate key processing

    this.lines = [];
    this.manualAssets = new Set();
    this.cars = [];
    // Toggle to enable/disable AI logic and honking
    this.aiEnabled = true; // ENABLED for near-miss scoring system
    this.carsInitialized = false; // Track if cars have been spawned for this game session
    
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
    this.currentLap = 0; // Track completed laps
    this.totalDistance = 0; // Track total distance traveled
    this.scoreVal = 0;
    this.inGame = false;
    this.mapIndex = 0;
    this.sectionProg = 0;
    this.boostTimer = 0;
    this.isBoosting = false;
    this.boostCooldownTimer = 0;
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
    
    // Progressive difficulty system
    this.difficultyMultiplier = 1.0; // Starts at 1.0, increases over time
    this.difficultyTimer = 0; // Tracks time for difficulty scaling
    this.baseMaxSpeed = constants.maxSpeed; // Store original max speed
    
    // Screen shake system
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // Crash recovery: invulnerability window so player can steer away
    this.crashRecoveryUntil = 0;
    // Traffic grace: no traffic for 1.5s after start or checkpoint (sector change)
    this.trafficGraceUntil = 0;
    
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

    // Initialize controls
    initControls();
    
    // Initialize game
    this.init();
  }

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
  }

  async initAudio() {
    this.audio = new Audio();
    
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
  }

  initCars() {
    const vehicles = ASSETS.IMAGE.VEHICLES;
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      console.warn('initCars: No vehicles available');
      return;
    }
    const getRandomVehicle = () => vehicles[Math.floor(Math.random() * vehicles.length)];

    // Helper function to get a random lane (explicit array to ensure valid values)
    const getRandomLane = () => {
      const lanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
      return lanes[Math.floor(Math.random() * lanes.length)];
    };

    // Calculate number of cars based on level progression
    // Base count + additional cars per level completed
    const carCount = Math.min(
      constants.AI_BASE_COUNT + (this.levelsCompleted * constants.AI_CARS_PER_LEVEL),
      constants.AI_MAX_CARS
    );
    
    console.log(`Spawning ${carCount} AI cars for difficulty level ${this.levelsCompleted}`);
    console.log('Player pos:', this.pos, 'segL:', constants.segL, 'N:', constants.N);
    console.log('Track length:', this.road ? this.road.length : 'no road yet');
    
    // Remove old car elements from DOM before clearing (prevents memory leak)
    for (const car of this.cars) {
      if (car.element && car.element.parentNode) {
        car.element.parentNode.removeChild(car.element);
      }
    }
    this.cars = [];
    
    // GRADUATED SPAWNING: Spawn cars with MIN_TRAFFIC_SEGMENT_SEP between them (no "wall" clustering)
    const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
    const minSep = constants.MIN_TRAFFIC_SEGMENT_SEP || 12;
    // Base positions spaced by minSep so we never cluster
    const spawnDistances = [25, 25 + minSep, 25 + minSep * 2, 25 + minSep * 3, 25 + minSep * 4];
    
    for (let i = 0; i < carCount; i++) {
      let pos;
      for (let attempts = 0; attempts < 30; attempts++) {
        const baseDistance = spawnDistances[i % spawnDistances.length];
        const jitter = Math.floor(Math.random() * 5) - 2; // ±2 segments
        pos = ((baseDistance + jitter) % constants.N + constants.N) % constants.N;
        if (this._isSegmentClear(pos)) break;
      }
      // Fallback: use base position even if not perfectly clear (avoid infinite loop)
      if (pos === undefined) pos = (spawnDistances[i % spawnDistances.length] % constants.N + constants.N) % constants.N;
      
      const lane = this._pickLaneForNewCar(pos);
      const newCar = new Car(pos, getRandomVehicle(), lane);
      // Give each car a unique ID
      newCar.id = this.carIdCounter++;
      newCar.passed = false;
      newCar._trafficCrashApplied = false;
      newCar.trafficWideCleared = false;
      this.cars.push(newCar);
    }
    
    // Log car initialization with detailed lane breakdown
    const laneCount = { A: 0, B: 0, C: 0 };
    this.cars.forEach(car => {
      if (car.lane === constants.LANE.A) laneCount.A++;
      else if (car.lane === constants.LANE.B) laneCount.B++;
      else if (car.lane === constants.LANE.C) laneCount.C++;
    });
    console.log(`Cars initialized: ${this.cars.length} cars`);
    console.log(`Lane distribution - A (left): ${laneCount.A}, B (center): ${laneCount.B}, C (right): ${laneCount.C}`);
    console.log(`Lane values: ${this.cars.map(c => c.lane.toFixed(1)).join(', ')}`);
    console.log(`Car positions: ${this.cars.map(c => Math.floor(c.pos)).join(', ')}`);
  }

  initRoad() {
    // CRITICAL: Clear ALL existing road elements EXCEPT hero and cloud
    const hero = document.getElementById('hero');
    const cloud = document.getElementById('cloud');
    
    // Remove all children except hero and cloud
    Array.from(this.roadElement.children).forEach(child => {
      if (child !== hero && child !== cloud) {
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

      // Increased from 8 to 16 elements to support more sprites per line
      // Elements 0-5: Road quads
      // Elements 6-15: Available for sprites (trees, buildings, cars, etc.)
      for (let j = 0; j < 16; j++) {
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
  }

  initHighscore() {
    for (let i = 0; i < 12; i++) {
      let element = document.createElement("p");
      this.highscoreElement.appendChild(element);
    }
    this.updateHighscore();
  }

  updateHighscore() {
    let hN = Math.min(12, this.highscores.length);
    for (let i = 0; i < hN; i++) {
      this.highscoreElement.children[i].innerHTML = `${(i + 1).pad(2, "&nbsp;")}. ${
        this.highscores[i]
      }`;
    }
  }

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
    this.initHighscore();
    this.initLevelSelect(); // Initialize level select handlers
    this.reset();
    this.startGameLoop();
  }

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
  }

  reset() {
    this.inGame = false;
    this.crashRecoveryUntil = 0;

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
    this.pos = 0;
    this.currentLap = 0; // Reset lap counter
    this.totalDistance = 0; // Reset total distance
    this.scoreVal = 0;
    this.mapIndex = 0;
    this.sectionProg = 0;
    this.isBoosting = false;
    this.boostTimer = 0;
    this.boostCooldownTimer = 0;

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
    this.boostBar.style.width = "100%";
    document.getElementById("boostTextOverlay").style.display = "block";
    
    // Hide game UI
    this.roadElement.style.opacity = 0.4;
    this.hudElement.style.display = "none";
    this.homeElement.style.display = "block";
    this.tachoElement.style.display = "block";
  }

  updateSky() {
    if (this.shouldUpdateSkyNextGame) {
      this.currentSkyIndex = (this.currentSkyIndex + 1) % this.currentAssets.IMAGE.SKY.length;
      this.cloudElement.style.backgroundImage = `url(${this.currentAssets.IMAGE.SKY[this.currentSkyIndex]})`;
      this.shouldUpdateSkyNextGame = false;
      console.log(`Sky updated to index ${this.currentSkyIndex}: ${this.currentAssets.IMAGE.SKY[this.currentSkyIndex]}`);
    }
  }

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
  
  // Trigger screen shake
  screenShake(intensity = 5, duration = 100) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  /**
   * Show crash feedback: overlay, CRASH! text, recovery grace period.
   * Gives player time to steer away without chain crashes.
   */
  _showCrashFeedback() {
    this.crashRecoveryUntil = Date.now() + constants.CRASH_RECOVERY_MS;

    const overlay = document.getElementById('crash-overlay');
    const text = document.getElementById('crash-text');
    const recovery = document.getElementById('recovery-indicator');

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
      setTimeout(() => {
        if (recovery) recovery.style.display = 'none';
      }, constants.CRASH_RECOVERY_MS);
    }
  }

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
      // Get current curve for steering assistance
      const currentCurve = this.road.getCurve(this.pos);
      
      // CURVE-BASED STEERING ASSISTANCE - Helps player follow the road naturally
      const curveAssistance = currentCurve * 0.00008 * step * Math.abs(this.speed); // Very subtle assistance
      
      // Apply curve assistance to player position (helps follow road naturally)
      if (Math.abs(currentCurve) > 15) { // Only assist on significant curves
        this.playerX += curveAssistance;
      }
      
      // Steering with much stronger boundary resistance
      const steerAmount = 0.007 * step * Math.abs(this.speed);
      
      if (KEYS.ArrowRight || KEYS.KeyD) {
        this.heroElement.style.backgroundPosition = "-220px 0";
        // Much stronger resistance near tighter boundaries
        let rightResistance = 1.0;
        if (this.playerX > 0.5) rightResistance = 0.2;      // Strong resistance
        if (this.playerX > 0.7) rightResistance = 0.05;     // Very strong resistance
        this.playerX += steerAmount * rightResistance;
      } else if (KEYS.ArrowLeft || KEYS.KeyA) {
        this.heroElement.style.backgroundPosition = "0 0";
        // Much stronger resistance near tighter boundaries
        let leftResistance = 1.0;
        if (this.playerX < -0.5) leftResistance = 0.2;      // Strong resistance
        if (this.playerX < -0.7) leftResistance = 0.05;     // Very strong resistance
        this.playerX -= steerAmount * leftResistance;
      } else {
        this.heroElement.style.backgroundPosition = "-110px 0";
      }

      // Acceleration/Braking
      if (KEYS.ArrowUp || KEYS.KeyW) {
        this.speed = accelerate(this.speed, this.isBoosting ? constants.boostSpeed : constants.accel, step);
      } else if (KEYS.ArrowDown || KEYS.KeyS) {
        this.speed = accelerate(this.speed, constants.breaking, step);
      } else {
        this.speed = accelerate(this.speed, constants.decel, step);
      }

      // Boost
      if (KEYS.Space && !this.isBoosting && this.boostCooldownTimer <= 0) {
        this.isBoosting = true;
        this.boostTimer = constants.boostDuration;
        this.audio?.play('boost');
      }

      // Update boost timer
      if (this.isBoosting) {
        this.boostTimer -= step;
        if (this.boostTimer <= 0) {
          this.isBoosting = false;
          this.boostCooldownTimer = constants.boostCooldown;
        }
      } else if (this.boostCooldownTimer > 0) {
        this.boostCooldownTimer -= step;
      }

      // Ensure speed doesn't go negative and respect max speed
      const currentMaxSpeed = this.isBoosting ? constants.boostSpeed : constants.maxSpeed;
      this.speed = Math.max(0, Math.min(this.speed, currentMaxSpeed));
      
      // Validate speed to prevent NaN propagation
      if (isNaN(this.speed) || this.speed === undefined || this.speed === null) {
        console.warn('Invalid speed detected, resetting to 0');
        this.speed = 0;
      }

      // Update boost UI
      this.updateBoostUI();
    }

    // Update position (only when in game) — matches original: pos += speed (units per frame)
    if (this.inGame) {
      const Lc = this._getTrackWrapLength();
      this._collisionPosFrameStart = ((this.pos % Lc) + Lc) % Lc;
      this.lastValidPos = this.pos; // Save for finish-line crossing detection
      this.pos += this.speed;
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

      // Collision BEFORE draw — check multiple rows to prevent tunneling at high speed
      if (this.inGame && this.aiEnabled) {
        // Frame-start segment (player position before movement) for tunneling prevention
        const frameStartSeg = this._collisionPosFrameStart != null
          ? (Math.floor(this._collisionPosFrameStart / constants.segL) % constants.N + constants.N) % constants.N
          : startPos;
        this._trafficRowHits(startPos, frameStartSeg);
      }
      // Draw road and update UI
      this.drawRoad(startPos, endPos, step);
      this.updateUI(startPos, step);
    }

    // Apply off-road penalty when near boundaries (playerX clamped above when inGame)
    if (this.inGame && (this.playerX < -0.75 || this.playerX > 0.75)) {
      this.speed = Math.max(this.speed * 0.96, constants.maxOffSpeed); // More noticeable slowdown
    }
  }

  updateBoostUI() {
    if (this.isBoosting) {
      this.boostBar.style.width = `${(this.boostTimer / constants.boostDuration) * 100}%`;
      document.getElementById("boostTextOverlay").style.display = "none";
    } else if (this.boostCooldownTimer > 0) {
      this.boostBar.style.width = `${((constants.boostCooldown - this.boostCooldownTimer) / constants.boostCooldown) * 100}%`;
      document.getElementById("boostTextOverlay").style.display = "none";
    } else {
      this.boostBar.style.width = "100%";
      document.getElementById("boostTextOverlay").style.display = "block";
    }
  }

  // Get current combo multiplier based on combo count
  getComboMultiplier() {
    let multiplier = 1;
    for (const [threshold, mult] of Object.entries(constants.COMBO_MULTIPLIERS)) {
      if (this.combo >= parseInt(threshold)) {
        multiplier = mult;
      }
    }
    return multiplier;
  }

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
  }

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
  }

  // Update combo display in HUD
  updateComboDisplay() {
    const comboElement = document.getElementById('combo-display');
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
  }

  // Hook for collision events — overridden by Arcade Run for timer penalty
  onCollision() {
    // Base class: no additional penalty beyond speed drop + combo break
  }

  // Consolidated near-miss scoring (used for PERFECT, CLOSE, NICE tiers)
  _scoreNearMiss(car, carPosFloor, tier, shakeIntensity, shakeDuration) {
    const speedRatio = this.speed / this.baseMaxSpeed;
    const speedBonus = Math.max(1.0, speedRatio * 1.5);
    // Boost multiplier: 2x points while boosting (risk-reward)
    const boostMult = this.isBoosting ? 2 : 1;

    const basePoints = constants.NEAR_MISS_POINTS[tier];
    const points = Math.floor(basePoints * speedBonus * boostMult);
    let label = constants.NEAR_MISS_LABELS[tier];
    if (this.isBoosting) label += ' ⚡BOOST';
    else if (speedBonus > 1.3) label += ' ⚡';

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
    if (car.wasDrawnThisFrame && this.lines && this.lines[carPosFloor % constants.N]) {
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

    // Play tier-specific sound
    const sfxMap = { PERFECT: 'success_perfect', CLOSE: 'success_close', NICE: 'success_nice' };
    if (this.inGame) this.audio.play(sfxMap[tier]);
  }

  applyMapToLine(line, worldZ, lineIndex = 0) {
    // Use new Road system for curve and height calculations
    const normalizedZ = worldZ % this.road.length;
    
    // Cache the last applied values to prevent unnecessary recalculation
    if (line.lastAppliedZ === normalizedZ) {
      return; // No need to recalculate if position hasn't changed
    }
    line.lastAppliedZ = normalizedZ;
    
    // Get curve and height from new Road system
    let newCurve = this.road.getCurve(normalizedZ);
    const newHeight = this.road.getHeight(normalizedZ);
    
    // CURVE DEADZONE - Eliminate micro-jitters from small curves
    const CURVE_DEADZONE = 8; // Ignore curves smaller than this
    if (Math.abs(newCurve) < CURVE_DEADZONE) {
      newCurve = 0;
    }
    
    // PROGRESSIVE CURVE SMOOTHING - Much more aggressive smoothing for stability
    if (line.curve !== undefined) {
      // Use exponential smoothing with different rates based on curve magnitude
      const curveDiff = Math.abs(newCurve - line.curve);
      let smoothingFactor;
      
      if (curveDiff < 10) {
        smoothingFactor = 0.02; // Very slow changes for small differences
      } else if (curveDiff < 30) {
        smoothingFactor = 0.05; // Moderate changes for medium differences
      } else {
        smoothingFactor = 0.15; // Faster changes only for large differences
      }
      
      line.curve = line.curve * (1 - smoothingFactor) + newCurve * smoothingFactor;
    } else {
      line.curve = newCurve;
    }
    
    // CURVE STABILIZATION - Round very small values to zero
    if (Math.abs(line.curve) < 2) {
      line.curve = 0;
    }
    
    // Clamp curve values to prevent excessive values
    line.curve = Math.max(-150, Math.min(150, line.curve));

    // Apply height with smoothing (keep existing smooth height changes)
    if (line.y !== undefined) {
      line.y = line.y * 0.9 + newHeight * 0.1;
    } else {
      line.y = newHeight;
    }

    // Get special objects from Road system
    const special = this.road.getSpecial(normalizedZ);
    // Always set the special for this line; finish rendering is capped to once per frame
    line.special = special || null;
  }

  /**
   * After a crash: move struck car far ahead + reset every other car's flags so traffic
   * doesn't stay in a broken state (wide-cleared / passed pile-up on same row).
   */
  _trafficRecoverAfterCrash(hitCar, anchorSeg) {
    const N = constants.N;
    const anchor = ((anchorSeg % N) + N) % N;
    const vehicles = ASSETS.IMAGE.VEHICLES;
    const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
    // Spawn well ahead with min separation so car fades in at horizon, no wall clustering
    let pos = null;
    for (const ahead of [constants.drawDistance + 25, constants.drawDistance + 35, constants.drawDistance + 18]) {
      const testPos = (anchor + ahead) % N;
      if (this._isSegmentClear(testPos, hitCar.id)) { pos = testPos; break; }
    }
    hitCar.pos = pos != null ? pos : (anchor + constants.drawDistance + 25) % N;
    hitCar.lane = this._pickLaneForNewCar(hitCar.pos);
    hitCar.type = vehicles[Math.floor(Math.random() * vehicles.length)];
    hitCar.passed = false;
    hitCar.trafficWideCleared = false;
    hitCar._trafficCrashApplied = false;
    hitCar.spawnTime = Date.now();

    // Only mark cars in actual collision rows (playerRow ±1) — prevents chain crash without
    // poisoning cars behind us that we never process (which would block respawn forever)
    const playerRow = anchor;
    const collisionRows = new Set([
      playerRow,
      (playerRow + 1) % N,
      (playerRow - 1 + N) % N
    ]);
    for (const c of this.cars) {
      if (c === hitCar) continue;
      const cSeg = ((Math.floor(c.pos) % N) + N) % N;
      if (collisionRows.has(cSeg)) {
        c._trafficCrashApplied = true; // Prevent chain crash next frame
      } else {
        c.passed = false;
        c.trafficWideCleared = false;
        c._trafficCrashApplied = false;
      }
    }
  }

  /**
   * Check if segment has enough clearance from all cars (prevents traffic "wall" clustering).
   * @param {number} segment - Segment index (0..N-1)
   * @param {number} excludeCarId - Optional car ID to exclude (e.g. car being respawned)
   * @returns {boolean}
   */
  _isSegmentClear(segment, excludeCarId = null) {
    const N = constants.N;
    const minSep = constants.MIN_TRAFFIC_SEGMENT_SEP || 12;
    for (const c of this.cars || []) {
      if (excludeCarId != null && c.id === excludeCarId) continue;
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let dist = Math.abs(cPos - segment);
      if (dist > N / 2) dist = N - dist;
      if (dist < minSep) return false;
    }
    return true;
  }

  /**
   * Pick a lane for a new car at targetSegment that avoids roadblocks.
   * Uses same logic as initCars: prefer lanes not occupied nearby, else least-used.
   * @param {number} targetSegment - Segment index (0..N-1) for the new car
   * @returns {number} Lane value (LANE.A, B, or C)
   */
  _pickLaneForNewCar(targetSegment) {
    const N = constants.N;
    const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
    const nearbyRadius = 25;

    const nearbyCars = (this.cars || []).filter((c) => {
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let dist = Math.abs(cPos - targetSegment);
      if (dist > N / 2) dist = N - dist;
      return dist < nearbyRadius;
    });

    const occupiedLanes = new Set(nearbyCars.map((c) => c.lane));
    const available = allLanes.filter((l) => !occupiedLanes.has(l));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    const laneCounts = {};
    allLanes.forEach((l) => (laneCounts[l] = 0));
    nearbyCars.forEach((c) => laneCounts[c.lane]++);
    const minCount = Math.min(...Object.values(laneCounts));
    const leastUsed = allLanes.filter((l) => laneCounts[l] === minCount);
    return leastUsed[Math.floor(Math.random() * leastUsed.length)];
  }

  /**
   * Single source of truth for position wrapping. When road exists, use road.length
   * so outer pos and inner updateGameState stay in sync (avoids startPos vs rowPhys drift).
   */
  _getTrackWrapLength() {
    if (this.road && this.road.length > 0 && !isNaN(this.road.length)) {
      return this.road.length;
    }
    return this.map?.trackLength || constants.mapLength;
  }

  /**
   * Collision / near-miss: only cars on the same draw row as the player (matches what you see).
   * rowSegDraw = startPos passed to drawRoad; rowSegPhysics = segment after position integrate.
   */
  _trafficRowHits(rowSegDraw, rowSegPhysics) {
    if (!this.aiEnabled || !Array.isArray(this.cars) || !this.inGame) return;
    // Recovery grace: no collision during invulnerability so player can steer away
    if (Date.now() < this.crashRecoveryUntil) return;
    // Traffic grace: no traffic for 1.5s after start or checkpoint
    if (Date.now() < this.trafficGraceUntil) return;
    const N = constants.N;
    const T = constants.TRAFFIC;
    const rows = new Set();
    for (const s of [rowSegDraw, rowSegPhysics]) {
      const x = ((Number(s) % N) + N) % N;
      rows.add(x);
      rows.add((x + 1) % N);
      rows.add((x - 1 + N) % N);
    }
    // Direct lane comparison: playerX matches lane values (-0.75, 0, 0.75)
    // Player at lane center should only crash with cars in SAME lane
    let crashDoneThisFrame = false;

    for (const car of this.cars) {
      const carSeg = ((car.pos | 0) % N + N) % N;
      if (!rows.has(carSeg)) continue;
      // Fade-in grace: skip collision/near-miss for recently spawned cars
      if (car.spawnTime && Date.now() - car.spawnTime < (constants.CAR_FADEIN_GRACE_MS ?? 500)) continue;
      // Direct lane distance: playerX (-0.95 to 0.95) vs car.lane (-0.75, 0, 0.75)
      const dist = Math.abs(this.playerX - car.lane);
      const carPosFloor = carSeg;

      if (dist <= T.CRASH) {
        if (crashDoneThisFrame) continue;
        if (!car._trafficCrashApplied) {
          crashDoneThisFrame = true;
          car._trafficCrashApplied = true;
          this.speed = Math.min(constants.hitSpeed, this.speed);
          if (this.inGame && this.audio) this.audio.play("honk");
          this.combo = 0;
          this.comboTimer = 0;
          this.comboMultiplier = 1;
          this.updateComboDisplay();
          this.screenShake(12, 220);
          this._showCrashFeedback();
          this.onCollision();
          this._trafficRecoverAfterCrash(car, rowSegPhysics);
        }
        continue;
      }

      if (car.passed) continue;

      if (dist <= T.PERFECT) {
        car.passed = true;
        car.trafficWideCleared = false;
        this._scoreNearMiss(car, carPosFloor, "PERFECT", 4, 80);
      } else if (dist <= T.CLOSE) {
        car.passed = true;
        car.trafficWideCleared = false;
        this._scoreNearMiss(car, carPosFloor, "CLOSE", 0, 0);
      } else if (dist <= T.NICE) {
        car.passed = true;
        car.trafficWideCleared = false;
        this._scoreNearMiss(car, carPosFloor, "NICE", 0, 0);
      } else {
        car.trafficWideCleared = true;
      }
    }
  }

  _trafficRespawn(playerSeg) {
    if (!this.aiEnabled || !Array.isArray(this.cars) || !this.inGame) return;
    if (Date.now() < this.trafficGraceUntil) return;
    if (constants.DEBUG_DISABLE_RESPAWN) return;
    const N = constants.N;
    const playerSegNorm = ((playerSeg % N) + N) % N;

    // Don't respawn if we already have plenty of cars ahead — reduces snap frequency
    let carsAhead = 0;
    for (const c of this.cars) {
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let d = cPos - playerSegNorm;
      if (d < -N / 2) d += N;
      if (d > N / 2) d -= N;
      if (d > 0) carsAhead++;
    }
    if (carsAhead >= 3) return;

    // Cap 1 respawn per frame to avoid bunching when multiple cars fall behind
    let respawnedThisFrame = 0;
    const RESPAWN_COOLDOWN_MS = 8000; // Mario Kart: same car can't reappear for 8s

    for (const car of this.cars) {
      if (respawnedThisFrame >= 1) break;

      const carPosInt = ((Math.floor(car.pos) % N) + N) % N;
      let distanceFromPlayer = carPosInt - playerSegNorm;
      if (distanceFromPlayer < -N / 2) distanceFromPlayer += N;
      if (distanceFromPlayer > N / 2) distanceFromPlayer -= N;

      // Mario Kart style: car must be fully behind AND gone for RESPAWN_DELAY_MS before reappearing
      // (prevents "same car I just passed" teleport feel)
      // Note: distance calculation handles track wrap-around correctly via normalization above
      const minBehind = -(Math.floor(constants.N / 2) - 1);
      if (distanceFromPlayer <= minBehind) {
        car.wentBehindAt = car.wentBehindAt || Date.now();
      } else {
        // Reset when car is ahead again (intentional: prevents respawn if car wrapped back ahead)
        car.wentBehindAt = null;
      }
      const delayMs = constants.RESPAWN_DELAY_MS ?? 4000;
      const canRespawn =
        distanceFromPlayer <= minBehind &&
        car.wentBehindAt &&
        Date.now() - car.wentBehindAt > delayMs &&
        (!car.spawnTime || Date.now() - car.spawnTime > RESPAWN_COOLDOWN_MS);

      if (canRespawn) {
        const vehicles = ASSETS.IMAGE.VEHICLES;
        if (!Array.isArray(vehicles) || vehicles.length === 0) continue;
        const getRandomVehicle = () => vehicles[Math.floor(Math.random() * vehicles.length)];
        const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
        // Scale respawn distances to track size (N) to prevent wrap-around bugs on mobile
        const minAhead = Math.min(constants.RESPAWN_MIN_AHEAD ?? 38, Math.floor(N * 0.6));
        const maxAhead = Math.min(constants.RESPAWN_MAX_AHEAD ?? 58, Math.floor(N * 0.8));
        const baseOffset = minAhead + Math.floor(Math.random() * Math.max(1, maxAhead - minAhead));
        const respawnDistances = [baseOffset, baseOffset + 6, baseOffset + 12];
        let bestPos = null;
        let bestLane = null;
        let minConflicts = Infinity;

        for (const pickDistance of respawnDistances) {
          const testPos = (playerSegNorm + pickDistance) % N;
          // Validate: testPos should be AHEAD of player (circular distance)
          let aheadDist = testPos - playerSegNorm;
          if (aheadDist < -N / 2) aheadDist += N;
          if (aheadDist > N / 2) aheadDist -= N;
          if (aheadDist < minAhead * 0.5) continue; // Skip if wrapped behind player
          if (!this._isSegmentClear(testPos, car.id)) continue; // Enforce min separation
          const nearbyCars = this.cars.filter((c) => {
            if (c.id === car.id) return false;
            const cPos = (Math.floor(c.pos) % N + N) % N;
            let dist = Math.abs(cPos - testPos);
            if (dist > N / 2) dist = N - dist;
            return dist < 25;
          });

          if (nearbyCars.length < minConflicts) {
            minConflicts = nearbyCars.length;
            bestPos = testPos;
            const th = constants.PLAYER_LANE_THRESHOLD ?? 0.38;
            const playerCurrentLane =
              this.playerX > th ? constants.LANE.C
                : this.playerX < -th ? constants.LANE.A
                  : constants.LANE.B;
            // Count cars in each lane within reasonable distance
            const laneCounts = { [constants.LANE.A]: 0, [constants.LANE.B]: 0, [constants.LANE.C]: 0 };
            nearbyCars.forEach(c => laneCounts[c.lane]++);
            
            // Prefer empty lanes, then lanes with fewest cars
            const sortedLanes = allLanes.slice().sort((a, b) => laneCounts[a] - laneCounts[b]);
            
            // 70% chance to avoid player lane for fair gameplay, 30% chance to challenge
            if (Math.random() < 0.7) {
              const nonPlayerLanes = sortedLanes.filter(l => l !== playerCurrentLane);
              if (nonPlayerLanes.length > 0) {
                bestLane = nonPlayerLanes[0]; // Pick emptiest non-player lane
              } else {
                bestLane = sortedLanes[0];
              }
            } else {
              // Challenge mode: spawn in player's lane or least occupied
              bestLane = sortedLanes[0];
            }
          }
        }

        if (bestPos === null) {
          for (const d of [48, 40, 56, 35]) {
            const fallback = (playerSegNorm + d) % N;
            if (this._isSegmentClear(fallback, car.id)) { bestPos = fallback; break; }
          }
          if (bestPos === null) bestPos = (playerSegNorm + 48) % N;
        }
        if (bestLane === null) {
          bestLane = allLanes[Math.floor(Math.random() * allLanes.length)];
        }
        car.pos = bestPos;
        car.lane = bestLane;
        car.type = getRandomVehicle();
        car.passed = false;
        car.trafficWideCleared = false;
        car._trafficCrashApplied = false;
        car.spawnTime = Date.now();
        car.wentBehindAt = null; // Reset for next cycle
        respawnedThisFrame++;
      }
    }
  }

  updateGameState(step, startPos, endPos) {
    // Update stopwatch
    this.stopwatch.update();
    
    // Validate current state before calculations
    if (isNaN(this.pos) || isNaN(this.speed) || isNaN(step) || isNaN(this.totalDistance)) {
      console.warn('Invalid state in updateGameState:', {
        pos: this.pos,
        speed: this.speed,
        step: step,
        totalDistance: this.totalDistance
      });
      return; // Skip this frame
    }
    
    // pos already advanced in update(); use current pos for checkpoint/finish (no double-add)
    const newPos = this.pos;
    const newTotalDistance = this.totalDistance + this.speed * step;
    
    // Check for checkpoint detection
    const checkpoint = this.road && this.road.checkCheckpoint(newPos, 100);
    if (checkpoint) {
      const isNewCheckpoint = this.stopwatch.passCheckpoint(checkpoint);
      if (isNewCheckpoint) {
        const cpLabel = checkpoint.type || `#${checkpoint.index}`;
        console.log(`Checkpoint passed: ${cpLabel} at position ${newPos.toFixed(0)}`);
      }
    }
    
    // Check for finish line crossing event (not just proximity)
    if (!this.finishCrossed && this.road && this.road.finishLine) {
      const finishZ = this.road.finishLine.startZ;
      const oldNorm = ((this.lastValidPos % this.road.length) + this.road.length) % this.road.length;
      const newNorm = ((newPos % this.road.length) + this.road.length) % this.road.length;

      // Crossing forward: either we pass finishZ within the same lap, or we wrap and pass it
      const crossedSameLap = oldNorm <= finishZ && newNorm >= finishZ;
      const wrapped = oldNorm > newNorm; // we wrapped around track length
      const crossedOnWrap = wrapped && (finishZ >= oldNorm || finishZ <= newNorm);

      if ((crossedSameLap || crossedOnWrap) && this.speed > 0) {
        const lapData = this.stopwatch.completeLap();
        this.currentLap = lapData ? lapData.lapNumber : this.currentLap;
        this.shouldUpdateSkyNextGame = true;
        console.log(`Finish crossed! ${lapData ? lapData.formattedLapTime : ''}`);
        // Score reward on finish
        this.scoreVal += 1500;
        if (lapData && lapData.isBestLap) {
          this.scoreVal += 500;
        }
        // Gate duplicate triggers and defer progression to checkLevelCompletion
        this.finishCrossed = true;
      }
    }
    
    // Update total distance (pos already updated in update())
    this.totalDistance = newTotalDistance;

    if (this.inGame && this.aiEnabled) {
      const ps =
        (Math.floor(this.pos / constants.segL) % constants.N + constants.N) % constants.N;
      this._trafficRespawn(ps);
    }

    // Passive scoring: token trickle so score isn't completely static between near-misses
    // Near-miss events are the primary score source (~90%+ of total)
    this.scoreVal += Math.floor(this.speed / 80);
    this.scoreElement.innerHTML = this.scoreVal.toString().padStart(6, "0");
    
    // Update combo system
    this.updateComboSystem(step);

    // Check for level completion
    this.checkLevelCompletion();

    // Boost timer/cooldown decremented in update() — single source of truth

    // Update boost UI
    const boostMeter = document.getElementById('boost-meter');
    if (boostMeter) {
      if (this.isBoosting) {
        const boostProgress = (this.boostTimer / constants.boostDuration) * 100;
        boostMeter.style.width = `${boostProgress}%`;
        boostMeter.style.backgroundColor = '#ff0';
      } else if (this.boostCooldownTimer > 0) {
        const cooldownProgress = (1 - this.boostCooldownTimer / constants.boostCooldown) * 100;
        boostMeter.style.width = `${cooldownProgress}%`;
        boostMeter.style.backgroundColor = '#f00';
      } else {
        boostMeter.style.width = '100%';
        boostMeter.style.backgroundColor = '#0f0';
      }
    }
  }

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
          const bestLapDisplay = document.getElementById('best-lap');
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
  }

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
    let camH = constants.H + this.lines[startPos].y;
    let x = 0;
    let dx = 0;

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
    const heroSizeAdjustment = 0.70; // Smaller hero so center lane feels passable
    this.heroElement.style.transform = `scale(${Math.max(0.5, perspectiveScale * heroSizeAdjustment)})`;

    for (let n = startPos; n < startPos + constants.N; n++) {
      let l = this.lines[n % constants.N];
      if (!l) {
        console.warn('Line is undefined at index:', n % constants.N);
        continue;
      }
      let level = constants.N * 2 - n;

      // Apply map data to line - use line's actual z position for consistency
      const lineWorldZ = l.z + this.pos;
      this.applyMapToLine(l, lineWorldZ, n);

      // update view
      l.project(
        this.playerX * constants.roadW - x,
        camH,
        startPos * constants.segL - (n >= constants.N ? constants.N * constants.segL : 0)
      );
      x += dx;
      dx += l.curve;

      // clear assets
      l.clearSprites();

      // Asset rendering using proper drawSprite with unique layer indices
      if (this.currentLevelIndex === 0) {
        // Tropical level - palms on left only, ocean/beach on left with boats
        const cfg = this.currentAssets.LEVEL_CONFIG?.scenery?.primary || {};
        const spacing = Number.isFinite(cfg.spacing) ? cfg.spacing : 15;
        const sides = Array.isArray(cfg.sides) && cfg.sides.length > 0 ? cfg.sides : [-2.5];
        // Use high sprite layers (8/9) to avoid coastal overlay slots (6/7)
        if (n % spacing === 0) {
          l.drawSprite(level + 100, 8, this.currentAssets.IMAGE.TREE, sides[0]);
        }
        // Only draw a second side if configured (keeps palms left-only)
        if (sides.length > 1 && n % spacing === Math.floor(spacing / 2)) {
          l.drawSprite(level + 100, 9, this.currentAssets.IMAGE.TREE, sides[1]);
        }

        // Add yachts on the ocean side (left), fewer than sailboats
        if (n % 40 === 0) {
          l.drawSprite(level + 600, 4, {
            src: "images/yacht.png",
            width: 120,
            height: 80
          }, -4.5);
        }
        if (n % 55 === 27) {
          l.drawSprite(level + 600, 5, {
            src: "images/yacht.png",
            width: 120,
            height: 80
          }, -5.0);
        }

        // Add skyrise buildings on the right side (opposite sand/water)
        // Match Coastal city/grassy staggering with similar intervals on this side
        if (n % 16 === 0) {
          l.drawSprite(level + 650, 6, {
            src: "images/skyrise1.png",
            width: 200,
            height: 220
          }, 3.8);
        }
        if (n % 19 === 9) {
          l.drawSprite(level + 680, 7, {
            src: "images/skyrise2.png",
            width: 180,
            height: 200
          }, 3.4);
        }
        // New: taller skyrise variant, appears less often
        // Place behind skyrise1 and skyrise2 by using a lower depth
        if (n % 11 === 4) {
          l.drawSprite(level + 640, 8, {
            src: "images/skyrise3.png",
            width: 240,
            height: 260
          }, 4.2);
        }
      } else if (this.currentLevelIndex === 1) {
        // Coastal level - Enhanced Oceanside Scenic Route
        // Dynamic scenery that changes based on track elevation and curves
        
        // Get current track segment info for dynamic effects
        const trackSegment = this.road.findSegment(this.pos);
        const elevation = trackSegment ? this.road.getHeight(this.pos) : 0;
        const curve = trackSegment ? this.road.getCurve(this.pos) : 0;
        const isHighElevation = elevation > 50; // Ocean overlook sections
        const isLowElevation = elevation < -30; // Beach run sections
        const isCurving = Math.abs(curve) > 20; // Curved sections
        
        // LAYERED CITYSCAPE SYSTEM - Buildings at multiple depths
        
        // Far background buildings (smallest, behind everything)
        if (n % 16 === 0) {
          l.drawSprite(level + 400, 8, {
            src: "images/city_buildings.png",
            width: 140,
            height: 120
          }, -4.8);
        }
        if (n % 19 === 9) {
          l.drawSprite(level + 420, 9, {
            src: "images/city_buildings2.png",
            width: 120,
            height: 100
          }, -4.3);
        }
        
        // Mid-background buildings (mixed with far hills)
        if (n % 14 === 7) {
          l.drawSprite(level + 530, 2, {
            src: "images/city_buildings2.png",
            width: 180,
            height: 150
          }, -3.2);
        }
        
        // Grassy mountains layer 1 (far background) - More prominent on high elevation
        if (n % (isHighElevation ? 8 : 12) === 6) {
          l.drawSprite(level + 550, 3, {
            src: "images/grassy_mountain.png",
            width: isHighElevation ? 500 : 450,
            height: isHighElevation ? 170 : 150
          }, -2.2);
        }
        
        // Buildings at hill depth (larger, blending with hills)
        if (n % 11 === 4) {
          l.drawSprite(level + 590, 2, {
            src: "images/city_buildings.png",
            width: 220,
            height: 180
          }, -2.5);
        }
        
        // Grassy mountains layer 2 (mid-distance, overlapping with buildings)
        if (n % 8 === 0) {
          l.drawSprite(level + 600, 2, {
            src: "images/grassy_mountain.png",
            width: 600,
            height: 180
          }, -1.8);
        }
        
        // Foreground buildings (sparse, between hills and palm trees)
        if (n % 18 === 2) {
          l.drawSprite(level + 650, 3, {
            src: "images/city_buildings2.png",
            width: 160,
            height: 140
          }, -2.0);
        }
        if (n % 22 === 11) {
          l.drawSprite(level + 680, 2, {
            src: "images/city_buildings.png",
            width: 150,
            height: 130
          }, -2.3);
        }
        
        // DYNAMIC OCEAN ELEMENTS - More visible during high elevation sections
        
        // Layer 4: Sailboats in ocean (more frequent on overlooks)
        if (n % (isHighElevation ? 15 : 25) === 0) {
          l.drawSprite(level + 600, 4, ASSETS.IMAGE.SAILBOAT, 4.5);
        }
        
        // Layer 5: More sailboats (deeper in ocean, visible on clear stretches)
        if (n % (isHighElevation ? 20 : 35) === 17) {
          l.drawSprite(level + 600, 5, ASSETS.IMAGE.SAILBOAT, 5.0);
        }
        
        // COASTAL VEGETATION - Changes with elevation
        
        // Layer 6: Street lamps on left (sidewalk area) - More frequent in city approach
        if (n % 12 === 0 && !isLowElevation) {
          l.drawSprite(level + 650, 6, {
            src: "images/street_lamp.png",
            width: 40,
            height: 80
          }, -4.5); // Moved further left to sidewalk area
        }
        
        // Layer 7: Palm trees on right (beach/sand area) - Denser during beach run
        if (n % (isLowElevation ? 8 : 14) === 7) {
          l.drawSprite(level + 700, 7, {
            src: "images/tree.png",
            width: 80,
            height: 120
          }, 2.5);
        }
        
        // SPECIAL COASTAL EFFECTS
        
        // Seagulls flying over ocean (high elevation overlooks only)
        if (isHighElevation && n % 40 === 15) {
          l.drawSprite(level + 300, 8, {
            src: "images/seagull.png",
            width: 30,
            height: 20
          }, 3.8 + Math.sin(n * 0.1) * 0.5); // Animated flight pattern
        }
        
        // Beach umbrellas during low elevation beach sections
        if (isLowElevation && n % 30 === 10) {
          l.drawSprite(level + 750, 9, {
            src: "images/beach_umbrella.png",
            width: 50,
            height: 60
          }, 3.2);
        }
        
        // Lighthouse on distant point (curves and overlooks)
        if ((isCurving || isHighElevation) && n % 80 === 0) {
          l.drawSprite(level + 200, 10, {
            src: "images/lighthouse.png",
            width: 60,
            height: 120
          }, 6.0);
        }
      }

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
          const tolerance = 30; // tighter threshold — prevents multi-line flicker
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

      if (this.aiEnabled && Date.now() >= this.trafficGraceUntil) {
        for (let car of this.cars) {
          // Normalize segment index (handles negative; matches _trafficRowHits)
          const carSegment = ((Math.floor(car.pos) % constants.N) + constants.N) % constants.N;
          const lineSegment = n % constants.N;
          // Don't draw cars far behind — hide before respawn so no visible snap
          let carDist = carSegment - startPos;
          if (carDist > constants.N / 2) carDist -= constants.N;
          if (carDist < -constants.N / 2) carDist += constants.N;
          if (carDist < -(constants.CAR_HIDE_BEHIND_SEGMENTS || 28)) continue; // hide before respawn

          if (carSegment === lineSegment) {
            // AI cars get highest z-index since they're closest to player on the road
            // Use level + 10000 to ensure they render in front of all scenery
            // 
            // Instead of using drawSprite with offset, manually position cars
            // This avoids the centered/offset double-application bug entirely
            const baseDestX = l.X;
            // Lane values now match player range: -0.6, 0, 0.6
            // Use 2000 multiplier for good visual separation on screen
            const laneOffsetPixels = car.lane * 2000 * l.scale * constants.halfWidth;
            const destX = baseDestX + laneOffsetPixels;
            const destY = l.Y + 4;
            const destW = (car.type.width * l.W) / 265;
            const destH = (car.type.height * l.W) / 265;
            
            // Center the car sprite horizontally
            const finalX = destX - destW / 2;
            const finalY = destY - destH;
            
            car.element.style.display = 'block';
            car.element.style.background = `url('${car.type.src}') no-repeat`;
            car.element.style.backgroundSize = `${destW}px ${destH}px`;
            car.element.style.left = finalX + 'px';
            car.element.style.top = finalY + 'px';
            car.element.style.width = destW + 'px';
            car.element.style.height = destH + 'px';
            car.element.style.zIndex = level + 10000;
            
            // Apply fade-in effect for visual telegraph
            car.element.style.opacity = car.getOpacity();
            
            car.wasDrawnThisFrame = true;
          }
        }
      }

      // update road - cull segments that are off-screen
      if (l.Y >= maxy) continue;
      maxy = l.Y;
      
      // Also cull segments that are too far off to the sides (prevents lingering during curves)
      const screenMargin = constants.width * 0.3; // Allow 30% margin
      if (l.X < -screenMargin || l.X > constants.width + screenMargin) {
        // Hide this line's elements if it's too far off-screen
        for (let i = 0; i < 6; i++) { // Hide road quad elements (0-5)
          if (l.elements[i]) {
            l.elements[i].style.display = 'none';
          }
        }
        continue;
      }

      // Re-enable road elements if they're on-screen
      for (let i = 0; i < 6; i++) {
        if (l.elements[i]) {
          l.elements[i].style.display = 'block';
        }
      }
      
      let even = ((n / 2) | 0) % 2;
      let grass = this.currentAssets.COLOR.GRASS[even * 1];
      let grassLeft = this.currentAssets.COLOR.GRASS_LEFT ? this.currentAssets.COLOR.GRASS_LEFT[even * 1] : grass;
      let rumble = this.currentAssets.COLOR.RUMBLE[even * 1];
      let tar = this.currentAssets.COLOR.TAR[even * 1];

      let p = this.lines[(n - 1) % constants.N];

      // 4-Zone coastal highway system: City -> Sidewalk -> Road -> Beach -> Ocean
      if (this.currentLevelIndex === 1) { // Coastal level only
        // Ensure coastal transition zone layers are visible for this level
        if (l.elements[6]) {
          l.elements[6].style.display = 'block';
        }
        if (l.elements[7]) {
          l.elements[7].style.display = 'block';
        }
        // Zone 1: Far left - City area (green) - wider coverage
        drawQuad(
          l.elements[0],
          level - 1,
          grassLeft,
          l.X - l.W * 2, // Closer to road
          p.Y,
          l.W * 4, // Much wider to eliminate gaps
          l.X - l.W * 2,
          l.Y,
          l.W * 4
        );
        
        // Zone 2: Left transition - Sidewalk area (gray) - overlapping
        drawQuad(
          l.elements[6],
          level - 1,
          this.currentAssets.COLOR.SIDEWALK[even * 1],
          l.X - l.W * 0.8, // Much closer to road edge
          p.Y,
          l.W * 1.5, // Wider to overlap and eliminate gaps
          l.X - l.W * 0.8,
          l.Y,
          l.W * 1.5
        );
        
        // Zone 3: Right transition - Beach area (sand) - overlapping
        drawQuad(
          l.elements[7],
          level - 1,
          this.currentAssets.COLOR.BEACH[even * 1],
          l.X + l.W * 0.8, // Much closer to road edge
          p.Y,
          l.W * 1.5, // Wider to overlap and eliminate gaps
          l.X + l.W * 0.8,
          l.Y,
          l.W * 1.5
        );
        
        // Zone 4: Far right - Ocean area (blue) - wider coverage
        drawQuad(
          l.elements[1],
          level - 1,
          grass,
          l.X + l.W * 2, // Closer to road
          p.Y,
          l.W * 4, // Much wider to eliminate gaps
          l.X + l.W * 2,
          l.Y,
          l.W * 4
        );
      } else {
        // Non-coastal levels
        if (this.currentLevelIndex === 0) {
          // Tropical: mirror coastal ocean/beach on the LEFT side
          // Show beach overlay element (left transition) and right sidewalk element
          if (l.elements[6]) l.elements[6].style.display = 'block';
          if (l.elements[7]) l.elements[7].style.display = 'block';

          // Far left: Ocean area (use GRASS_LEFT as ocean blue), wide coverage
          drawQuad(
            l.elements[0],
            level - 1,
            grassLeft,
            l.X - l.W * 2,
            p.Y,
            l.W * 4,
            l.X - l.W * 2,
            l.Y,
            l.W * 4
          );

          // Left transition: Beach area (sand), overlapping the edge
          drawQuad(
            l.elements[6],
            level - 1,
            this.currentAssets.COLOR.BEACH[even * 1],
            l.X - l.W * 0.8,
            p.Y,
            l.W * 1.5,
            l.X - l.W * 0.8,
            l.Y,
            l.W * 1.5
          );

          // Right side: sidewalk (grey) and white zone beyond
          // Sidewalk next to road (use a separate element from beach)
          if (l.elements[7]) {
            l.elements[7].style.display = 'block';
            drawQuad(
              l.elements[7],
              level - 1,
              this.currentAssets.COLOR.SIDEWALK[even * 1],
              l.X + l.W * 0.8, // Close to road edge
              p.Y,
              l.W * 1.5, // Wide enough to cover gap
              l.X + l.W * 0.8,
              l.Y,
              l.W * 1.5
            );
          }
          // White zone beyond sidewalk
          drawQuad(
            l.elements[1],
            level - 1,
            this.currentAssets.COLOR.SIDEWALK_WHITE ? this.currentAssets.COLOR.SIDEWALK_WHITE[even * 1] : '#FFFFFF',
            l.X + l.W * 2,
            p.Y,
            l.W * 4,
            l.X + l.W * 2,
            l.Y,
            l.W * 4
          );
        } else {
          // Standard 2-zone system for other levels
          if (l.elements[6]) {
            l.elements[6].style.display = 'none';
            l.elements[6].style.background = 'transparent';
          }
          if (l.elements[7]) {
            l.elements[7].style.display = 'none';
            l.elements[7].style.background = 'transparent';
          }
          drawQuad(
            l.elements[0],
            level,
            grassLeft,
            constants.width / 4,
            p.Y,
            constants.halfWidth + 2,
            constants.width / 4,
            l.Y,
            constants.halfWidth
          );
          drawQuad(
            l.elements[1],
            level,
            grass,
            (constants.width / 4) * 3,
            p.Y,
            constants.halfWidth + 2,
            (constants.width / 4) * 3,
            l.Y,
            constants.halfWidth
          );
        }
      }

      // Road surface - normal z-index
      drawQuad(
        l.elements[2],
        level,
        rumble,
        p.X,
        p.Y,
        p.W * 1.15,
        l.X,
        l.Y,
        l.W * 1.15
      );
      drawQuad(
        l.elements[3],
        level,
        tar,
        p.X,
        p.Y,
        p.W,
        l.X,
        l.Y,
        l.W
      );

      if (!even) {
        drawQuad(
          l.elements[4],
          level,
          this.currentAssets.COLOR.RUMBLE[1],
          p.X,
          p.Y,
          p.W * 0.4,
          l.X,
          l.Y,
          l.W * 0.4
        );
        drawQuad(
          l.elements[5],
          level,
          tar,
          p.X,
          p.Y,
          p.W * 0.35,
          l.X,
          l.Y,
          l.W * 0.35
        );
      }
    }

    // Hide finish banner element if it wasn't rendered this frame
    if (!finishRenderedThisFrame && this.finishBannerEl) {
      this.finishBannerEl.style.display = 'none';
    }
    // Hide checkpoint banner element if it wasn't rendered this frame
    if (!checkpointRenderedThisFrame && this.checkpointBannerEl) {
      this.checkpointBannerEl.style.display = 'none';
    }
    
    // Hide cars that weren't drawn this frame (prevents flickering)
    if (this.aiEnabled) {
      for (let car of this.cars) {
        if (!car.wasDrawnThisFrame) {
          car.element.style.display = 'none';
        } else {
          car.element.style.display = 'block';
        }
      }
    }
  }


  // Level Management Methods
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
    
    // Advance sky variant on level change for time-of-day progression
    this.dayCycleIndex = Number.isInteger(this.dayCycleIndex) ? this.dayCycleIndex + 1 : 1;
    this.currentSkyIndex = this.dayCycleIndex % this.currentAssets.IMAGE.SKY.length;
    this.cloudElement.style.backgroundImage = `url(${this.currentAssets.IMAGE.SKY[this.currentSkyIndex]})`;
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
  }

  nextLevel() {
    const nextIndex = (this.currentLevelIndex + 1) % 2; // 2 levels total
    this.levelsCompleted++;
    this.changeLevel(nextIndex);
    
    // DON'T reset cars - let them continue naturally!
    // The respawn system will handle adding/removing cars as needed
    // Reset car flags for new sector (pos=0; cars keep segment positions)
    if (this.aiEnabled && Array.isArray(this.cars)) {
      for (let car of this.cars) {
        car.passed = false;
        car.trafficWideCleared = false;
        car._trafficCrashApplied = false;
        car.wentBehindAt = null; // Mario Kart: fresh sector, no stale respawn delay
      }
    }
  }

  getCurrentLevelName() {
    const level = getCurrentLevel(this.currentLevelIndex);
    return level.name;
  }

  updateLevelDisplay() {
    if (this.levelElement) {
      this.levelElement.textContent = `Level ${this.currentLevelIndex + 1}`;
    }
  }

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
  }

  // Level Select Methods
  showLevelSelect() {
    this.inLevelSelect = true;
    this.levelSelectElement.style.display = 'flex';
    this.homeElement.style.display = 'none';
    this.hudElement.style.display = 'none'; // Hide HUD during level select
    this.roadElement.style.display = 'none'; // Hide road to prevent grey box
    this.levelSelectCooldown = 500; // 500ms cooldown before accepting input
    this.updateLevelSelectUI();
    this.updateLevelPreview(this.selectedLevelIndex); // Show preview for selected level
  }

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
  }

  updateLevelSelectUI() {
    const levelOptions = document.querySelectorAll('.level-option');
    levelOptions.forEach((option, index) => {
      if (index === this.selectedLevelIndex) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
    this.updateLevelPreview(this.selectedLevelIndex); // Update preview when selection changes
  }

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
  }

  handleLevelSelectInput() {
    if (!this.inLevelSelect || this.levelSelectCooldown > 0) return;

    if (KEYS.ArrowLeft || KEYS.KeyA) {
      this.selectedLevelIndex = Math.max(0, this.selectedLevelIndex - 1);
      this.updateLevelSelectUI();
    }
    
    if (KEYS.ArrowRight || KEYS.KeyD) {
      this.selectedLevelIndex = Math.min(1, this.selectedLevelIndex + 1); // Max 2 levels
      this.updateLevelSelectUI();
    }
    
    if (KEYS.Insert || KEYS.KeyC) {
      this.selectLevel(this.selectedLevelIndex);
    }
  }

  selectLevel(levelIndex) {
    console.log(`Level ${levelIndex} selected`);
    this.changeLevel(levelIndex);
    this.hideLevelSelect();
    this.startGame();
  }

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
  }

  startGame() {
    console.log('Starting game...');
    this.inGame = true;
    this.crashRecoveryUntil = 0;
    this.trafficGraceUntil = Date.now() + (constants.TRAFFIC_GRACE_MS || 2000);
    this.speed = 0;
    this.pos = 0;
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
    document.getElementById('music-controls').style.display = 'block';
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
  }
}

export default Game;
