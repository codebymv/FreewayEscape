// Message types for client-server communication

export const MESSAGE_TYPES = {
  // Connection & Authentication
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  HEARTBEAT: 'HEARTBEAT',
  
  // Room Management
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  ROOM_STATE: 'ROOM_STATE',
  ROOM_CREATED: 'ROOM_CREATED',
  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_LEFT: 'ROOM_LEFT',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  
  // Player Management
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  PLAYER_READY: 'PLAYER_READY',
  PLAYER_NOT_READY: 'PLAYER_NOT_READY',
  
  // Game Lifecycle
  START_RACE: 'START_RACE',
  RACE_STARTED: 'RACE_STARTED',
  RACE_COUNTDOWN: 'RACE_COUNTDOWN',
  RACE_FINISHED: 'RACE_FINISHED',
  RACE_RESULTS: 'RACE_RESULTS',
  
  // Game State
  GAME_STATE: 'GAME_STATE',
  PLAYER_INPUT: 'PLAYER_INPUT',
  PLAYER_POSITION: 'PLAYER_POSITION',
  PLAYER_FINISHED: 'PLAYER_FINISHED',
  LAP_COMPLETED: 'LAP_COMPLETED',
  
  // Power-ups & Interactions
  POWERUP_SPAWNED: 'POWERUP_SPAWNED',
  POWERUP_COLLECTED: 'POWERUP_COLLECTED',
  POWERUP_USED: 'POWERUP_USED',
  POWERUP_EFFECT: 'POWERUP_EFFECT',
  
  // Collisions & Physics
  COLLISION: 'COLLISION',
  PLAYER_COLLISION: 'PLAYER_COLLISION',
  
  // Chat & Communication
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  QUICK_CHAT: 'QUICK_CHAT',
  
  // Errors
  ERROR: 'ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
};

// Message structure templates
export const MESSAGE_TEMPLATES = {
  // Room messages
  CREATE_ROOM: {
    type: MESSAGE_TYPES.CREATE_ROOM,
    data: {
      playerName: '',
      roomSettings: {
        maxPlayers: 4,
        trackId: 'default',
        laps: 3,
        powerupsEnabled: true
      }
    }
  },
  
  JOIN_ROOM: {
    type: MESSAGE_TYPES.JOIN_ROOM,
    data: {
      roomCode: '',
      playerName: ''
    }
  },
  
  // Game state messages
  PLAYER_INPUT: {
    type: MESSAGE_TYPES.PLAYER_INPUT,
    data: {
      playerId: '',
      timestamp: 0,
      input: {
        left: false,
        right: false,
        accelerate: false,
        brake: false,
        boost: false
      }
    }
  },
  
  GAME_STATE: {
    type: MESSAGE_TYPES.GAME_STATE,
    data: {
      timestamp: 0,
      raceState: 'WAITING',
      players: [],
      powerups: [],
      raceTime: 0
    }
  },
  
  PLAYER_POSITION: {
    type: MESSAGE_TYPES.PLAYER_POSITION,
    data: {
      playerId: '',
      position: { x: 0, z: 0 },
      speed: 0,
      lane: 'B',
      lapTime: 0,
      currentLap: 1,
      racePosition: 1
    }
  },
  
  // Power-up messages
  POWERUP_COLLECTED: {
    type: MESSAGE_TYPES.POWERUP_COLLECTED,
    data: {
      playerId: '',
      powerupId: '',
      powerupType: 'SPEED_BOOST'
    }
  },
  
  POWERUP_USED: {
    type: MESSAGE_TYPES.POWERUP_USED,
    data: {
      playerId: '',
      powerupType: 'SPEED_BOOST',
      targetPlayerId: null // For targeted effects
    }
  },
  
  // Room state message
  ROOM_STATE: {
    type: MESSAGE_TYPES.ROOM_STATE,
    data: {
      roomCode: '',
      players: [],
      raceState: 'WAITING',
      settings: {
        maxPlayers: 4,
        trackId: 'default',
        laps: 3,
        powerupsEnabled: true
      },
      host: ''
    }
  },
  
  // Error message
  ERROR: {
    type: MESSAGE_TYPES.ERROR,
    data: {
      code: 'GENERIC_ERROR',
      message: 'An error occurred',
      details: null
    }
  }
};

// Quick chat messages
export const QUICK_CHAT_MESSAGES = [
  'Good luck!',
  'Nice move!',
  'Oops!',
  'Well played!',
  'See you at the finish!',
  'Ready to race!',
  'Let\'s go!',
  'One more time!'
];

// Error codes
export const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED'
};

// Utility functions for creating messages
export function createMessage(type, data = {}) {
  return {
    type,
    data,
    timestamp: Date.now()
  };
}

export function createErrorMessage(code, message, details = null) {
  return createMessage(MESSAGE_TYPES.ERROR, {
    code,
    message,
    details
  });
}

export function createGameStateMessage(gameState) {
  return createMessage(MESSAGE_TYPES.GAME_STATE, {
    ...gameState,
    timestamp: Date.now()
  });
}

export function createPlayerInputMessage(playerId, input) {
  return createMessage(MESSAGE_TYPES.PLAYER_INPUT, {
    playerId,
    input,
    timestamp: Date.now()
  });
} 