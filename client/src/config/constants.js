export const width = window.innerWidth;
export const height = window.innerHeight;
export const scaleFactor = Math.min(window.innerWidth / 800, window.innerHeight / 500);
export const halfWidth = width / 2;
export const roadW = 4000;
export const segL = 200;
export const camD = 0.2;
export const H = 1500;
export const N = window.innerWidth > 768 ? 70 : 50;
export const drawDistance = Math.floor(N/2);
export const maxSpeed = 85;
export const accel = 14;
export const boostSpeed = 125;
export const breaking = -28;
export const decel = -10;
export const maxOffSpeed = 28;
export const offDecel = -50;
export const enemy_speed = 42;
export const hitSpeed = 14;
export const boostDuration = 3;
export const boostCooldown = 5;
export const mapLength = 15000;
export const lapsPerRace = 1;
export const totalTime = 90; // Legacy countdown (seconds); Arcade uses ARCADE_START_TIME

export const LANE = {
  A: -0.75,  // Left lane - wider spread for spacious feel
  B: 0.0,    // Center lane - perfectly centered
  C: 0.75,   // Right lane - wider spread for spacious feel
};

// Near-Miss Scoring System (lane-distance on playerX*1.8 vs car.lane axis)
export const NEAR_MISS = {
  COLLISION: 0.25,   // Legacy reference
  PERFECT: 0.50,
  CLOSE: 0.75,
  NICE: 1.0,
};

/** Lane-distance collision: values relative to lane positions (-0.75, 0, 0.75)
 *  Player in lane center should only crash with cars in SAME lane.
 *  LANE_WIDTH = 0.75 (distance between lane centers)
 *  CRASH = 0.38 (inside lane, leaves gap for near-miss)
 *  PERFECT = 0.65 (just outside lane edge)
 *  CLOSE = 0.90 (nearby but not same lane)
 *  NICE = 1.20 (wide catch for scoring)
 */
export const TRAFFIC = {
  CRASH: 0.38,       // Crash only when deeply inside same lane
  PERFECT: 0.65,     // Perfect pass: just outside lane boundary
  CLOSE: 0.90,       // Close pass: adjacent lane, close edge
  NICE: 1.20,        // Nice pass: any nearby pass
};

export const NEAR_MISS_POINTS = {
  PERFECT: 500,
  CLOSE: 200,
  NICE: 50,
};

export const NEAR_MISS_LABELS = {
  PERFECT: "PERFECT!",
  CLOSE: "CLOSE!",
  NICE: "NICE!",
};

// Combo System
export const COMBO_WINDOW = 2.5; // Seconds to maintain combo (generous enough for light traffic)
export const COMBO_MULTIPLIERS = {
  0: 1,    // No combo
  3: 2,    // 3+ hits = 2x
  6: 3,    // 6+ hits = 3x
  10: 4,   // 10+ hits = 4x
  15: 6,   // 15+ hits = 6x
  20: 8,   // 20+ hits = 8x
};
// AI Car Difficulty Scaling
export const AI_BASE_COUNT = 4;     // Starting traffic count (first sector feels manageable)
export const AI_CARS_PER_LEVEL = 1; // +1 car per checkpoint passed (escalating pressure)
export const AI_MAX_CARS = 10;      // Max cars - dense traffic at high sector counts

// Arcade Run Mode
export const ARCADE_START_TIME = 45;         // Starting countdown in seconds
export const ARCADE_CHECKPOINT_BONUS = 15;   // Seconds added per checkpoint pass
export const CLEAN_SECTOR_BONUS = 500;       // Extra score for passing sector without crashing
export const ARCADE_CHECKPOINT_INTERVAL = 20; // Seconds between checkpoint spawns (fast first hook)
export const CRASH_TIME_PENALTY = 3;         // Seconds lost per collision
export const CRASH_RECOVERY_MS = 1600;       // Invulnerability after crash so player can steer away
export const TRAFFIC_GRACE_MS = 2000;       // No traffic for 2s after start or checkpoint
export const DEBUG_DISABLE_RESPAWN = false; // Set true to test if respawn causes snapping
export const MIN_TRAFFIC_SEGMENT_SEP = 15; // Increased: more spacing between cars for premium feel
export const RESPAWN_MIN_AHEAD = 40;        // Spawn closer to horizon (more visible earlier)
export const RESPAWN_MAX_AHEAD = 55;        // Narrower spawn range for smoother appearance
export const CAR_HIDE_BEHIND_SEGMENTS = 25; // Hide cars earlier behind player
export const RESPAWN_DELAY_MS = 3500;      // Faster respawn (3.5s) for more action
export const PLAYER_LANE_THRESHOLD = 0.38;  // Same as CRASH threshold: playerX < -0.38 = left, > 0.38 = right, else center
export const CAR_FADEIN_GRACE_MS = 500;    // Collision grace during fade-in (less than visual fade for fairness)

