// Shared constants for both client and server

// WebSocket connection
export const WEBSOCKET_URL = 'ws://localhost:8080/ws';

// Game dimensions and physics
export const GAME = {
  WIDTH: 800,
  HEIGHT: 500,
  SCALE_FACTOR: typeof window !== 'undefined' ? Math.min(window.innerWidth / 800 || 1, window.innerHeight / 500 || 1) : 1,
  HALF_WIDTH: 400,
  ROAD_WIDTH: 4000,
  SEGMENT_LENGTH: 200,
  CAM_DEPTH: 0.2,
  HORIZON: 1500,
  DRAW_DISTANCE: 35,
  MAX_SPEED: 200,
  ACCEL: 30,
  BOOST_SPEED: 300,
  BREAKING: -40,
  DECEL: -15,
  MAX_OFF_SPEED: 40,
  OFF_DECEL: -70,
  ENEMY_SPEED: 8,
  HIT_SPEED: 20,
  BOOST_DURATION: 3000, // milliseconds
  BOOST_COOLDOWN: 5000, // milliseconds
  MAP_LENGTH: 15000,
  LAPS_PER_RACE: 3
};

// Player lanes
export const LANES = {
  A: -2.3,
  B: -0.5,
  C: 1.2
};

// Multiplayer settings
export const MULTIPLAYER = {
  MAX_PLAYERS: 4,
  MIN_PLAYERS: 1, // Allow single player for testing
  TICK_RATE: 20, // Server updates per second
  CLIENT_PREDICTION_BUFFER: 100, // milliseconds
  INTERPOLATION_DELAY: 100, // milliseconds
  RECONNECT_TIMEOUT: 30000, // 30 seconds
  ROOM_CODE_LENGTH: 6
};

// Power-up types
export const POWERUPS = {
  SPEED_BOOST: {
    type: 'SPEED_BOOST',
    duration: 3000,
    effect: 'speed',
    rarity: 'common',
    multiplier: 1.5
  },
  OIL_SLICK: {
    type: 'OIL_SLICK',
    duration: 0,
    effect: 'trap',
    rarity: 'common',
    slowdown: 0.3
  },
  SHIELD: {
    type: 'SHIELD',
    duration: 5000,
    effect: 'protection',
    rarity: 'uncommon'
  },
  LIGHTNING: {
    type: 'LIGHTNING',
    duration: 0,
    effect: 'global',
    rarity: 'rare',
    slowdown: 0.5
  },
  TELEPORT: {
    type: 'TELEPORT',
    duration: 0,
    effect: 'position',
    rarity: 'rare',
    distance: 1000
  }
};

// Player colors for multiplayer
export const PLAYER_COLORS = [
  '#FF0000', // Red
  '#0000FF', // Blue
  '#00FF00', // Green
  '#FFFF00'  // Yellow
];

// Input keys
export const KEYS = {
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  SPACE: 'Space',
  ENTER: 'Enter',
  C: 'KeyC',
  M: 'KeyM'
};

// Race states
export const RACE_STATES = {
  WAITING: 'WAITING',
  COUNTDOWN: 'COUNTDOWN',
  RACING: 'RACING',
  FINISHED: 'FINISHED'
};

// Player states
export const PLAYER_STATES = {
  CONNECTED: 'CONNECTED',
  READY: 'READY',
  RACING: 'RACING',
  FINISHED: 'FINISHED',
  DISCONNECTED: 'DISCONNECTED'
}; 