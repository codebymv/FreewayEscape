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
export const SIM_RATE = 60;
export const STEER_ACCEL = 7.5;
export const STEER_DAMPING = 6.5;
export const MAX_STEER_VELOCITY = 1.15;
export const STEER_MIN_GRIP = 0.35;
export const mapLength = 15000;
export const lapsPerRace = 1;

// Master elevation visibility. The base pseudo-3D projection barely registers height
// (even 150-unit hills shift the horizon ~1-2px). This multiplies how strongly any
// elevation difference from the camera's row reads on screen, so long grades and hills
// actually show. Affects ALL elevation (segment hills + rolling terrain). 1 = original
// (near-flat); raise for more dramatic relief. Applied in Line.project().
export const HEIGHT_PROJECTION_GAIN = 12;

// Rolling terrain layered on the VISUAL road height (simulation.applyMapToLine) so straights
// aren't dead flat. Built from integer harmonics of the track length (seamless across the
// loop). Kept off line.rawHeight, so scenery elevation logic ignores it. Low harmonics =
// long, sustained "mile-stretch" inclines (not frequent bumps). Set amplitude 0 to disable.
export const TERRAIN_UNDULATION = {
  amplitude: 55,   // primary roll height (track units; hills are ~150-180)
  secondary: 22,   // secondary roll for natural, non-repetitive variation
  harmonic1: 3,    // primary inclines per lap — low = long sweeping grades
  harmonic2: 7,    // secondary, gentler variation on top
};
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
  // Deterministic lane-distance crash model. Outcome depends only on the CLOSEST lateral gap
  // (|playerX - car.lane|) the player achieves during a pass — not on frame timing or render
  // scale — so the same maneuver always gives the same result. CRASH is the gap for a
  // reference-width car; wider cars get a slightly larger gap (width-aware, and visible).
  CRASH: 0.38,        // Lateral gap at/under which a reference-width car crashes
  PERFECT: 0.65,      // Clean pass tiers (lateral gap), all wider than the crash gap
  CLOSE: 0.90,
  NICE: 1.20,
  REFERENCE_CAR_WIDTH: 51,   // effective body px (width * hitbox-width) the base CRASH is tuned for
  CRASH_WIDTH_SCALE: 0.6,    // how strongly car width shifts the crash gap (0 = ignore, 1 = proportional)
  IMPACT_BAND_SEGMENTS: 0.5, // longitudinal contact zone (in segments) where a crash can register
  COLLISION_AHEAD_SEGMENTS: 0.9,  // window (ahead) over which the closest approach is tracked
  COLLISION_BEHIND_SEGMENTS: 0.7, // window (behind) for closest-approach tracking
  // Deprecated (old screen-space/swept model): CENTER_CRASH, SWEEP_CRASH, SWEEP_WINDOW_EXTENSION_SEGMENTS
  CENTER_CRASH: 0.22,
  SWEEP_CRASH: 0.60,
  SWEEP_WINDOW_EXTENSION_SEGMENTS: 1.25,
};

// Tightened to the hero's solid body (the sprite fills its 110x56 frame edge-to-edge, so
// these are a pure forgiveness inset — slimmer lateral box = more room to squeeze past).
export const HERO_TRAFFIC_HITBOX = {
  left: 0.30,
  top: 0.21,
  right: 0.70,
  bottom: 0.79,
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
export const AI_BASE_COUNT = 3;     // Starting traffic count (first sector feels manageable)
export const AI_CARS_PER_LEVEL = 1; // +1 car per checkpoint passed (escalating pressure)
export const AI_MAX_CARS = 8;       // Max cars - dense traffic at high sector counts

export const DEFAULT_TRAFFIC_DENSITY = 'standard';

export const TRAFFIC_DENSITY_ORDER = ['chill', 'standard', 'dense', 'max'];

export const TRAFFIC_DENSITY_PRESETS = {
  chill: {
    key: 'chill',
    label: 'CHILL',
    baseCars: 2,
    carsPerSector: 1,
    maxCars: 5,
    spacingMultiplier: 1.25,
    speedMultiplier: 0.92,
    scoreMultiplier: 0.75,
  },
  standard: {
    key: 'standard',
    label: 'STANDARD',
    baseCars: 3,
    carsPerSector: 1,
    maxCars: 8,
    spacingMultiplier: 1,
    speedMultiplier: 1,
    scoreMultiplier: 1,
  },
  dense: {
    key: 'dense',
    label: 'DENSE',
    baseCars: 4,
    carsPerSector: 1,
    maxCars: 10,
    spacingMultiplier: 0.9,
    speedMultiplier: 1.05,
    scoreMultiplier: 1.25,
  },
  max: {
    key: 'max',
    label: 'RUSH HOUR',
    baseCars: 5,
    carsPerSector: 1,
    maxCars: 11,
    spacingMultiplier: 0.84,
    speedMultiplier: 1.08,
    scoreMultiplier: 1.5,
  },
};

export function normalizeTrafficDensityKey(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'maxrisk' || raw === 'max-risk' || raw === 'max_risk') return 'max';
  if (TRAFFIC_DENSITY_PRESETS[raw]) return raw;
  return DEFAULT_TRAFFIC_DENSITY;
}

export function getTrafficDensityPreset(value) {
  return TRAFFIC_DENSITY_PRESETS[normalizeTrafficDensityKey(value)];
}

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
export const TRAFFIC_LANE_WALL_RADIUS = 6; // Prevent all three lanes from being blocked at one reaction point
export const TRAFFIC_TELEGRAPH_MS = 1200; // Incoming cars glow/fade long enough to be readable
export const RESPAWN_MIN_AHEAD = 40;        // Spawn closer to horizon (more visible earlier)
export const RESPAWN_MAX_AHEAD = 55;        // Narrower spawn range for smoother appearance
export const CAR_HIDE_BEHIND_SEGMENTS = 25; // Hide cars earlier behind player
export const RESPAWN_DELAY_MS = 3500;      // Faster respawn (3.5s) for more action
export const TRAFFIC_RESPAWN_INTERVAL_MS = 900; // Min sim-time gap between respawns
export const CRASH_RESPAWN_GRACE_MS = 1400; // No new traffic respawns during the first recovery beat
export const PLAYER_LANE_THRESHOLD = 0.38;  // Same as CRASH threshold: playerX < -0.38 = left, > 0.38 = right, else center
export const CAR_FADEIN_GRACE_MS = 500;    // Collision grace during fade-in (less than visual fade for fairness)
