import { PLAYER_STATES, PLAYER_COLORS, LANES } from '../../shared/constants.js';

export class Player {
  constructor(id, name = '') {
    this.id = id;
    this.name = name;
    this.state = PLAYER_STATES.CONNECTED;
    this.isHost = false;
    this.isReady = false;
    
    // Game position and physics
    this.position = { x: 0, z: 0 };
    this.speed = 0;
    this.lane = LANES.B; // Default to middle lane
    this.direction = 0; // -1 left, 0 straight, 1 right
    
    // Race statistics
    this.currentLap = 1;
    this.lapTime = 0;
    this.bestLapTime = 0;
    this.totalRaceTime = 0;
    this.racePosition = 1;
    this.isFinished = false;
    this.finishTime = null;
    
    // Power-ups and effects
    this.currentPowerup = null;
    this.powerupCooldown = 0;
    this.boostReady = true;
    this.boostCooldown = 0;
    this.shieldActive = false;
    this.shieldEndTime = 0;
    this.speedBoostActive = false;
    this.speedBoostEndTime = 0;
    
    // Visual appearance
    this.color = PLAYER_COLORS[0]; // Will be assigned by room
    this.carType = 'default';
    
    // Input state
    this.input = {
      left: false,
      right: false,
      accelerate: false,
      brake: false,
      boost: false,
      powerup: false
    };
    
    // Connection info
    this.lastInputTime = Date.now();
    this.lastHeartbeat = Date.now();
    this.ping = 0;
    
    // Statistics
    this.stats = {
      distanceTraveled: 0,
      powerupsCollected: 0,
      powerupsUsed: 0,
      collisions: 0,
      overtakes: 0,
      timesOvertaken: 0
    };
  }

  // State management
  setState(newState) {
    this.state = newState;
  }

  setReady(ready) {
    this.isReady = ready;
  }

  setHost(isHost) {
    this.isHost = isHost;
  }

  // Position and physics
  updatePosition(x, z) {
    this.position.x = x;
    this.position.z = z;
  }

  updateSpeed(speed) {
    this.speed = speed;
  }

  updateLane(lane) {
    this.lane = lane;
  }

  // Race management
  nextLap() {
    if (this.currentLap > 0) {
      this.lapTime = Date.now() - this.lapStartTime;
      if (this.bestLapTime === 0 || this.lapTime < this.bestLapTime) {
        this.bestLapTime = this.lapTime;
      }
    }
    
    this.currentLap++;
    this.lapStartTime = Date.now();
  }

  finishRace(finishTime) {
    this.isFinished = true;
    this.finishTime = finishTime;
    this.totalRaceTime = finishTime;
    this.setState(PLAYER_STATES.FINISHED);
  }

  startRace() {
    this.setState(PLAYER_STATES.RACING);
    this.lapStartTime = Date.now();
    this.currentLap = 1;
    this.racePosition = 1;
    this.isFinished = false;
    this.finishTime = null;
    this.totalRaceTime = 0;
    
    // Reset position
    this.position = { x: 0, z: 0 };
    this.speed = 0;
    this.lane = LANES.B;
    
    // Reset power-ups
    this.currentPowerup = null;
    this.powerupCooldown = 0;
    this.boostReady = true;
    this.boostCooldown = 0;
    this.clearEffects();
    
    // Reset stats
    this.stats = {
      distanceTraveled: 0,
      powerupsCollected: 0,
      powerupsUsed: 0,
      collisions: 0,
      overtakes: 0,
      timesOvertaken: 0
    };
  }

  // Power-ups and effects
  collectPowerup(powerupType) {
    this.currentPowerup = powerupType;
    this.stats.powerupsCollected++;
  }

  usePowerup() {
    if (this.currentPowerup) {
      const powerup = this.currentPowerup;
      this.currentPowerup = null;
      this.stats.powerupsUsed++;
      return powerup;
    }
    return null;
  }

  applySpeedBoost(duration) {
    this.speedBoostActive = true;
    this.speedBoostEndTime = Date.now() + duration;
  }

  activateShield(duration) {
    this.shieldActive = true;
    this.shieldEndTime = Date.now() + duration;
  }

  clearEffects() {
    this.shieldActive = false;
    this.speedBoostActive = false;
    this.shieldEndTime = 0;
    this.speedBoostEndTime = 0;
  }

  updateEffects() {
    const now = Date.now();
    
    if (this.shieldActive && now > this.shieldEndTime) {
      this.shieldActive = false;
    }
    
    if (this.speedBoostActive && now > this.speedBoostEndTime) {
      this.speedBoostActive = false;
    }
    
    if (this.boostCooldown > 0) {
      this.boostCooldown = Math.max(0, this.boostCooldown - 16); // Assuming 60fps
    } else {
      this.boostReady = true;
    }
  }

  // Input handling
  updateInput(inputData) {
    this.input = { ...this.input, ...inputData };
    this.lastInputTime = Date.now();
  }

  // Network methods
  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  updatePing(ping) {
    this.ping = ping;
  }

  isConnected() {
    return Date.now() - this.lastHeartbeat < 30000; // 30 seconds timeout
  }

  // Collision and interactions
  onCollision(otherPlayer) {
    this.stats.collisions++;
    // Apply collision effects (speed reduction, etc.)
  }

  onOvertake(otherPlayer) {
    this.stats.overtakes++;
  }

  onOvertaken(otherPlayer) {
    this.stats.timesOvertaken++;
  }

  // Appearance
  setColor(color) {
    this.color = color;
  }

  setCarType(carType) {
    this.carType = carType;
  }

  // Serialization methods
  getPublicInfo() {
    return {
      id: this.id,
      name: this.name,
      isHost: this.isHost,
      isReady: this.isReady,
      state: this.state,
      color: this.color,
      carType: this.carType,
      ping: this.ping
    };
  }

  getRaceInfo() {
    return {
      id: this.id,
      name: this.name,
      position: this.position,
      speed: this.speed,
      lane: this.lane,
      currentLap: this.currentLap,
      lapTime: this.lapTime,
      racePosition: this.racePosition,
      isFinished: this.isFinished,
      finishTime: this.finishTime,
      color: this.color,
      carType: this.carType,
      
      // Power-ups and effects
      currentPowerup: this.currentPowerup,
      shieldActive: this.shieldActive,
      speedBoostActive: this.speedBoostActive,
      boostReady: this.boostReady,
      
      // Visual indicators
      direction: this.direction
    };
  }

  getStats() {
    return {
      ...this.stats,
      bestLapTime: this.bestLapTime,
      totalRaceTime: this.totalRaceTime,
      currentLap: this.currentLap,
      racePosition: this.racePosition
    };
  }

  getFullState() {
    return {
      ...this.getPublicInfo(),
      ...this.getRaceInfo(),
      stats: this.getStats()
    };
  }

  // Validation
  static isValidName(name) {
    return name && 
           typeof name === 'string' && 
           name.trim().length > 0 && 
           name.trim().length <= 20 &&
           /^[a-zA-Z0-9_\-\s]+$/.test(name.trim());
  }

  // Factory method
  static create(id, name, color) {
    const player = new Player(id, name);
    player.setColor(color);
    return player;
  }
} 