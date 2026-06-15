export const DRIVING_DEFAULTS = {
  SIM_RATE: 60,
  STEER_ACCEL: 7.5,
  STEER_DAMPING: 6.5,
  MAX_STEER_VELOCITY: 1.15,
  STEER_MIN_GRIP: 0.35,
  ROAD_BOUNDARY_LEFT: -0.95,
  ROAD_BOUNDARY_RIGHT: 0.95,
  OFFROAD_EDGE: 0.75,
  OFFROAD_SPEED_FACTOR: 0.96,
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export function createDrivingState(overrides = {}) {
  return {
    speed: 0,
    playerX: 0,
    steerVelocity: 0,
    isBoosting: false,
    boostTimer: 0,
    boostCooldownTimer: 0,
    ...overrides,
  };
}

export function updateDrivingPhysics(state, input, config, step) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0;
  const cfg = { ...DRIVING_DEFAULTS, ...config };
  const next = createDrivingState(state);
  let boostStarted = false;

  if (input.boost && !next.isBoosting && next.boostCooldownTimer <= 0) {
    next.isBoosting = true;
    next.boostTimer = cfg.boostDuration;
    boostStarted = true;
  }

  if (next.isBoosting) {
    next.boostTimer -= safeStep;
    if (next.boostTimer <= 0) {
      next.isBoosting = false;
      next.boostTimer = 0;
      next.boostCooldownTimer = cfg.boostCooldown;
    }
  } else if (next.boostCooldownTimer > 0) {
    next.boostCooldownTimer = Math.max(0, next.boostCooldownTimer - safeStep);
  }

  const previousSpeed = Number.isFinite(next.speed) ? next.speed : 0;
  const maxSpeed = next.isBoosting ? cfg.boostSpeed : cfg.maxSpeed;
  let accel = cfg.decel;
  if (input.accelerate) accel = next.isBoosting ? cfg.boostSpeed : cfg.accel;
  else if (input.brake) accel = cfg.breaking;

  next.speed = clamp(previousSpeed + accel * safeStep, 0, maxSpeed);

  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const speedGrip = cfg.maxSpeed > 0 ? clamp(next.speed / cfg.maxSpeed, cfg.STEER_MIN_GRIP, 1) : 1;
  const previousSteerVelocity = Number.isFinite(next.steerVelocity) ? next.steerVelocity : 0;
  const damping = Math.exp(-cfg.STEER_DAMPING * safeStep);
  const targetSteerVelocity =
    steerInput * (cfg.STEER_ACCEL * speedGrip) / Math.max(cfg.STEER_DAMPING, 0.0001);

  next.steerVelocity =
    previousSteerVelocity * damping + targetSteerVelocity * (1 - damping);
  next.steerVelocity = clamp(
    next.steerVelocity,
    -cfg.MAX_STEER_VELOCITY,
    cfg.MAX_STEER_VELOCITY
  );

  const previousPlayerX = Number.isFinite(next.playerX) ? next.playerX : 0;
  next.playerX = previousPlayerX + ((previousSteerVelocity + next.steerVelocity) / 2) * safeStep;

  if (next.playerX < cfg.ROAD_BOUNDARY_LEFT) {
    next.playerX = cfg.ROAD_BOUNDARY_LEFT;
    if (next.steerVelocity < 0) next.steerVelocity = 0;
  } else if (next.playerX > cfg.ROAD_BOUNDARY_RIGHT) {
    next.playerX = cfg.ROAD_BOUNDARY_RIGHT;
    if (next.steerVelocity > 0) next.steerVelocity = 0;
  }

  if (Math.abs(next.playerX) > cfg.OFFROAD_EDGE && next.speed > cfg.maxOffSpeed) {
    const frames = safeStep * cfg.SIM_RATE;
    const factor = Math.pow(cfg.OFFROAD_SPEED_FACTOR, frames);
    next.speed = Math.max(cfg.maxOffSpeed, next.speed * factor);
  }

  const distanceSpeed = (previousSpeed + next.speed) / 2;
  const distanceDelta = distanceSpeed * safeStep * cfg.SIM_RATE;

  return {
    ...next,
    distanceDelta,
    boostStarted,
  };
}
