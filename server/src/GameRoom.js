import { 
  RACE_STATES, 
  PLAYER_STATES, 
  MULTIPLAYER, 
  PLAYER_COLORS,
  GAME,
  POWERUPS
} from '../../shared/constants.js';
import { 
  MESSAGE_TYPES, 
  createMessage, 
  createGameStateMessage 
} from '../../shared/messages.js';

export class GameRoom {
  constructor(code, hostId, settings = {}) {
    this.code = code;
    this.hostId = hostId;
    this.createdAt = Date.now();
    
    // Room settings
    this.settings = {
      maxPlayers: settings.maxPlayers || MULTIPLAYER.MAX_PLAYERS,
      trackId: settings.trackId || 'default',
      laps: settings.laps || GAME.LAPS_PER_RACE,
      powerupsEnabled: settings.powerupsEnabled !== false,
      isPublic: settings.isPublic !== false,
      allowSpectators: settings.allowSpectators || false
    };
    
    // Game state
    this.state = RACE_STATES.WAITING;
    this.players = new Map(); // playerId -> Player
    this.spectators = new Set();
    
    // Race management
    this.raceStartTime = null;
    this.countdownStartTime = null;
    this.countdownDuration = 3000; // 3 seconds
    this.raceEndTime = null;
    this.finishOrder = [];
    
    // Game loop
    this.gameLoop = null;
    this.tickRate = MULTIPLAYER.TICK_RATE;
    this.lastTick = Date.now();
    
    // Power-ups and game objects
    this.powerups = new Map(); // powerupId -> powerup
    this.gameObjects = new Map();
    
    // Statistics
    this.raceNumber = 0;
    this.totalRaces = 0;
    
    console.log(`🏠 Room ${this.code} created with settings:`, this.settings);
  }

  // Player Management
  addPlayer(player) {
    if (this.players.size >= this.settings.maxPlayers) {
      throw new Error('Room is full');
    }
    
    if (this.state !== RACE_STATES.WAITING) {
      throw new Error('Cannot join room during race');
    }
    
    // Assign color
    const usedColors = Array.from(this.players.values()).map(p => p.color);
    const availableColors = PLAYER_COLORS.filter(color => !usedColors.includes(color));
    if (availableColors.length > 0) {
      player.setColor(availableColors[0]);
    }
    
    this.players.set(player.id, player);
    console.log(`👤 ${player.name} added to room ${this.code} (${this.players.size}/${this.settings.maxPlayers})`);
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    this.players.delete(playerId);
    
    // Remove from finish order if racing
    this.finishOrder = this.finishOrder.filter(id => id !== playerId);
    
    console.log(`👤 ${player.name} removed from room ${this.code}`);
    
    // If this was the host, transfer to another player
    if (this.hostId === playerId && this.players.size > 0) {
      const newHost = this.players.values().next().value;
      this.hostId = newHost.id;
      newHost.setHost(true);
      console.log(`👑 Host transferred to ${newHost.name} in room ${this.code}`);
    }
    
    return true;
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getPlayers() {
    return Array.from(this.players.values());
  }

  getPlayerCount() {
    return this.players.size;
  }

  getHost() {
    return this.players.get(this.hostId);
  }

  // Room State
  isFull() {
    return this.players.size >= this.settings.maxPlayers;
  }

  isEmpty() {
    return this.players.size === 0;
  }

  isWaiting() {
    return this.state === RACE_STATES.WAITING;
  }

  isRacing() {
    return this.state === RACE_STATES.RACING;
  }

  isFinished() {
    return this.state === RACE_STATES.FINISHED;
  }

  allPlayersReady() {
    if (this.players.size < MULTIPLAYER.MIN_PLAYERS) return false;
    return Array.from(this.players.values()).every(player => player.isReady);
  }

  // Race Management
  startRace() {
    if (this.state !== RACE_STATES.WAITING) {
      throw new Error('Race is already in progress');
    }
    
    if (this.players.size < MULTIPLAYER.MIN_PLAYERS) {
      throw new Error(`Need at least ${MULTIPLAYER.MIN_PLAYERS} players to start`);
    }
    
    console.log(`🏁 Starting race in room ${this.code}`);
    
    // Start countdown
    this.state = RACE_STATES.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.raceNumber++;
    this.totalRaces++;
    
    // Initialize players for race
    this.getPlayers().forEach((player, index) => {
      player.startRace();
      player.racePosition = index + 1; // Initial positions
    });
    
    // Clear finish order
    this.finishOrder = [];
    
    // Broadcast countdown start
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.RACE_COUNTDOWN, {
      countdown: this.countdownDuration,
      startTime: this.countdownStartTime + this.countdownDuration
    }));
    
    // Start countdown timer
    setTimeout(() => {
      this.actuallyStartRace();
    }, this.countdownDuration);
  }

  actuallyStartRace() {
    this.state = RACE_STATES.RACING;
    this.raceStartTime = Date.now();
    
    console.log(`🚗 Race actually started in room ${this.code}`);
    
    // Start game loop
    this.startGameLoop();
    
    // Broadcast race start
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.RACE_STARTED, {
      startTime: this.raceStartTime,
      trackId: this.settings.trackId,
      laps: this.settings.laps
    }));
  }

  finishRace() {
    if (this.state !== RACE_STATES.RACING) return;
    
    this.state = RACE_STATES.FINISHED;
    this.raceEndTime = Date.now();
    
    console.log(`🏁 Race finished in room ${this.code}`);
    
    // Stop game loop
    this.stopGameLoop();
    
    // Calculate final results
    const results = this.calculateRaceResults();
    
    // Broadcast results
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.RACE_RESULTS, {
      results,
      raceTime: this.raceEndTime - this.raceStartTime,
      finishOrder: this.finishOrder
    }));
    
    // Auto-return to waiting after delay
    setTimeout(() => {
      this.resetForNextRace();
    }, 10000); // 10 seconds to view results
  }

  resetForNextRace() {
    this.state = RACE_STATES.WAITING;
    this.raceStartTime = null;
    this.raceEndTime = null;
    this.finishOrder = [];
    
    // Reset players
    this.getPlayers().forEach(player => {
      player.setState(PLAYER_STATES.CONNECTED);
      player.setReady(false);
      player.isFinished = false;
    });
    
    // Clear game objects
    this.powerups.clear();
    this.gameObjects.clear();
    
    console.log(`🔄 Room ${this.code} reset for next race`);
    
    // Broadcast room state
    this.broadcastRoomState();
  }

  // Game Loop
  startGameLoop() {
    if (this.gameLoop) return;
    
    this.lastTick = Date.now();
    this.gameLoop = setInterval(() => {
      this.update();
    }, 1000 / this.tickRate);
  }

  stopGameLoop() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  update() {
    const now = Date.now();
    const deltaTime = now - this.lastTick;
    this.lastTick = now;
    
    if (this.state !== RACE_STATES.RACING) return;
    
    // Update player effects
    this.getPlayers().forEach(player => {
      player.updateEffects();
    });
    
    // Update race positions
    this.updateRacePositions();
    
    // Check for race completion
    this.checkRaceCompletion();
    
    // Spawn power-ups
    if (this.settings.powerupsEnabled) {
      this.updatePowerups(deltaTime);
    }
    
    // Broadcast game state
    this.broadcastGameState();
  }

  // Input Handling
  updatePlayerInput(playerId, inputData) {
    const player = this.getPlayer(playerId);
    if (!player || player.state !== PLAYER_STATES.RACING) return;
    
    player.updateInput(inputData.input);
    
    // Here you would apply the input to update player position
    // This is simplified - in a real implementation, you'd have physics simulation
    this.simulatePlayerMovement(player, inputData.input);
  }

  simulatePlayerMovement(player, input) {
    // Simplified movement simulation
    // In a real implementation, this would be much more complex
    
    let speedChange = 0;
    
    if (input.accelerate) {
      speedChange += GAME.ACCEL;
    }
    if (input.brake) {
      speedChange += GAME.BREAKING;
    }
    
    // Apply speed boost
    if (player.speedBoostActive) {
      speedChange *= 1.5;
    }
    
    // Update speed
    player.speed = Math.max(0, Math.min(GAME.MAX_SPEED, player.speed + speedChange));
    
    // Update position (simplified)
    const movement = player.speed * 0.016; // Assuming 60fps
    player.position.z += movement;
    
    // Lane changes
    if (input.left && player.lane > GAME.LANES.A) {
      player.lane = Math.max(GAME.LANES.A, player.lane - 0.1);
    }
    if (input.right && player.lane < GAME.LANES.C) {
      player.lane = Math.min(GAME.LANES.C, player.lane + 0.1);
    }
    
    // Update stats
    player.stats.distanceTraveled += movement;
  }

  // Power-ups
  updatePowerups(deltaTime) {
    // Spawn new power-ups occasionally
    if (Math.random() < 0.01) { // 1% chance per tick
      this.spawnPowerup();
    }
    
    // Update existing power-ups
    this.powerups.forEach((powerup, id) => {
      powerup.timeAlive += deltaTime;
      
      // Remove old power-ups
      if (powerup.timeAlive > 30000) { // 30 seconds
        this.powerups.delete(id);
      }
    });
  }

  spawnPowerup() {
    const powerupId = `powerup_${Date.now()}_${Math.random()}`;
    const types = Object.keys(POWERUPS);
    const type = types[Math.floor(Math.random() * types.length)];
    
    const powerup = {
      id: powerupId,
      type,
      position: {
        x: (Math.random() - 0.5) * 2000, // Random X position
        z: Math.random() * 10000 // Random Z position ahead
      },
      timeAlive: 0
    };
    
    this.powerups.set(powerupId, powerup);
    
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.POWERUP_SPAWNED, {
      powerup
    }));
  }

  usePowerup(playerId, data) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    
    const powerupType = player.usePowerup();
    if (!powerupType) return;
    
    // Apply powerup effect
    this.applyPowerupEffect(player, powerupType, data.targetPlayerId);
    
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.POWERUP_USED, {
      playerId,
      powerupType,
      targetPlayerId: data.targetPlayerId
    }));
  }

  applyPowerupEffect(player, powerupType, targetPlayerId = null) {
    switch (powerupType) {
      case 'SPEED_BOOST':
        player.applySpeedBoost(3000);
        break;
        
      case 'SHIELD':
        player.activateShield(5000);
        break;
        
      case 'LIGHTNING':
        // Affect all other players
        this.getPlayers().forEach(p => {
          if (p.id !== player.id && !p.shieldActive) {
            p.speed *= 0.5; // Reduce speed by 50%
          }
        });
        break;
        
      case 'OIL_SLICK':
        // Create oil slick at current position
        this.createOilSlick(player.position);
        break;
        
      case 'TELEPORT':
        // Move player forward
        player.position.z += 1000;
        break;
    }
  }

  // Race Logic
  updateRacePositions() {
    const players = this.getPlayers()
      .filter(p => p.state === PLAYER_STATES.RACING)
      .sort((a, b) => {
        // Sort by lap, then by position
        if (a.currentLap !== b.currentLap) {
          return b.currentLap - a.currentLap;
        }
        return b.position.z - a.position.z;
      });
    
    players.forEach((player, index) => {
      const newPosition = index + 1;
      if (player.racePosition !== newPosition) {
        if (newPosition < player.racePosition) {
          player.onOvertake();
        } else if (newPosition > player.racePosition) {
          player.onOvertaken();
        }
        player.racePosition = newPosition;
      }
    });
  }

  checkRaceCompletion() {
    this.getPlayers().forEach(player => {
      if (player.state === PLAYER_STATES.RACING && !player.isFinished) {
        // Check if player completed a lap
        if (player.position.z >= GAME.MAP_LENGTH) {
          player.nextLap();
          player.position.z = 0; // Reset position for next lap
          
          this.broadcastToRoom(createMessage(MESSAGE_TYPES.LAP_COMPLETED, {
            playerId: player.id,
            lap: player.currentLap,
            lapTime: player.lapTime
          }));
          
          // Check if player finished race
          if (player.currentLap > this.settings.laps) {
            this.playerFinished(player);
          }
        }
      }
    });
  }

  playerFinished(player) {
    player.finishRace(Date.now() - this.raceStartTime);
    this.finishOrder.push(player.id);
    
    console.log(`🏁 ${player.name} finished ${this.finishOrder.length}${this.getOrdinalSuffix(this.finishOrder.length)} in room ${this.code}`);
    
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.PLAYER_FINISHED, {
      playerId: player.id,
      playerName: player.name,
      position: this.finishOrder.length,
      raceTime: player.totalRaceTime,
      lapTimes: [player.bestLapTime] // Simplified
    }));
    
    // Check if race is complete
    const racingPlayers = this.getPlayers().filter(p => p.state === PLAYER_STATES.RACING && !p.isFinished);
    if (racingPlayers.length === 0 || this.finishOrder.length >= this.players.size) {
      setTimeout(() => this.finishRace(), 2000); // 2 second delay
    }
  }

  calculateRaceResults() {
    return this.finishOrder.map((playerId, index) => {
      const player = this.getPlayer(playerId);
      return {
        position: index + 1,
        playerId: player.id,
        playerName: player.name,
        raceTime: player.totalRaceTime,
        bestLapTime: player.bestLapTime,
        stats: player.getStats()
      };
    });
  }

  // Utility Methods
  getOrdinalSuffix(num) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
  }

  // Broadcasting
  broadcastToRoom(message, excludePlayerId = null) {
    // This will be handled by GameServer
    // We'll add a callback for this
    if (this.onBroadcast) {
      this.onBroadcast(message, excludePlayerId);
    }
  }

  broadcastGameState() {
    const gameState = {
      timestamp: Date.now(),
      raceState: this.state,
      raceTime: this.raceStartTime ? Date.now() - this.raceStartTime : 0,
      players: this.getPlayers().map(p => p.getRaceInfo()),
      powerups: Array.from(this.powerups.values()),
      finishOrder: this.finishOrder
    };
    
    this.broadcastToRoom(createGameStateMessage(gameState));
  }

  broadcastRoomState() {
    this.broadcastToRoom(createMessage(MESSAGE_TYPES.ROOM_STATE, {
      roomState: this.getState()
    }));
  }

  // Serialization
  getState() {
    return {
      code: this.code,
      state: this.state,
      players: this.getPlayers().map(p => p.getPublicInfo()),
      settings: this.settings,
      host: this.getHost()?.name || 'Unknown',
      playerCount: this.players.size,
      raceNumber: this.raceNumber,
      createdAt: this.createdAt
    };
  }

  getPublicInfo() {
    return {
      code: this.code,
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      state: this.state,
      host: this.getHost()?.name || 'Unknown',
      trackId: this.settings.trackId,
      isPublic: this.settings.isPublic
    };
  }
} 