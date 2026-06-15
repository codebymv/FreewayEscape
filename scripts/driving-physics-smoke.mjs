import { updateDrivingPhysics, createDrivingState } from '../client/src/core/drivingPhysics.js';

const config = {
  maxSpeed: 85,
  accel: 14,
  boostSpeed: 125,
  breaking: -28,
  decel: -10,
  maxOffSpeed: 28,
  boostDuration: 3,
  boostCooldown: 5,
};

function approx(actual, expected, tolerance, label) {
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)} (delta ${delta.toFixed(4)})`);
  }
}

function makeFrames(duration, fps) {
  const dt = 1 / fps;
  const frames = [];
  let elapsed = 0;
  while (elapsed < duration - 1e-9) {
    const step = Math.min(dt, duration - elapsed);
    frames.push(step);
    elapsed += step;
  }
  return frames;
}

function makeLagFrames(duration) {
  const frames = [];
  let elapsed = 0;
  let i = 0;
  while (elapsed < duration - 1e-9) {
    const rawStep = i % 17 === 0 ? 1 / 15 : 1 / 60;
    const step = Math.min(rawStep, duration - elapsed);
    frames.push(step);
    elapsed += step;
    i++;
  }
  return frames;
}

function inputAt(t) {
  return {
    accelerate: t < 5.0,
    brake: t >= 6.0 && t < 6.5,
    left: t >= 2.5 && t < 3.0,
    right: t >= 0.5 && t < 1.5,
    boost: t >= 3.0 && t < 3.5,
  };
}

function simulate(frames) {
  let state = createDrivingState();
  let distance = 0;
  let maxSegmentJump = 0;
  let t = 0;

  for (const step of frames) {
    const result = updateDrivingPhysics(state, inputAt(t), config, step);
    distance += result.distanceDelta;
    maxSegmentJump = Math.max(maxSegmentJump, result.distanceDelta / 200);
    state = result;
    t += step;
  }

  return { ...state, distance, maxSegmentJump };
}

const baseline = simulate(makeFrames(8, 60));
const at30 = simulate(makeFrames(8, 30));
const at144 = simulate(makeFrames(8, 144));
const lag = simulate(makeLagFrames(8));

for (const [label, run] of [['30fps', at30], ['144fps', at144], ['lag-spike', lag]]) {
  const isLag = label === 'lag-spike';
  approx(run.speed, baseline.speed, isLag ? 1.6 : 0.8, `${label} speed`);
  approx(run.distance, baseline.distance, isLag ? 160 : 80, `${label} distance`);
  approx(run.playerX, baseline.playerX, isLag ? 0.06 : 0.035, `${label} playerX`);
}

if (lag.maxSegmentJump > 3.1) {
  throw new Error(`lag-spike segment jump too large: ${lag.maxSegmentJump.toFixed(3)}`);
}

console.log('Driving physics smoke passed');
console.table({
  '60fps': {
    speed: baseline.speed.toFixed(3),
    distance: baseline.distance.toFixed(3),
    playerX: baseline.playerX.toFixed(3),
    maxSegmentJump: baseline.maxSegmentJump.toFixed(3),
  },
  '30fps': {
    speed: at30.speed.toFixed(3),
    distance: at30.distance.toFixed(3),
    playerX: at30.playerX.toFixed(3),
    maxSegmentJump: at30.maxSegmentJump.toFixed(3),
  },
  '144fps': {
    speed: at144.speed.toFixed(3),
    distance: at144.distance.toFixed(3),
    playerX: at144.playerX.toFixed(3),
    maxSegmentJump: at144.maxSegmentJump.toFixed(3),
  },
  'lag-spike': {
    speed: lag.speed.toFixed(3),
    distance: lag.distance.toFixed(3),
    playerX: lag.playerX.toFixed(3),
    maxSegmentJump: lag.maxSegmentJump.toFixed(3),
  },
});
