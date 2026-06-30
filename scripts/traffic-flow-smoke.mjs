import { TrafficWorld } from '../client/src/core/trafficWorld.js';

const VEHICLES = [
  { src: 'car-a.png', width: 90, height: 45 },
  { src: 'car-b.png', width: 96, height: 48 },
  { src: 'car-c.png', width: 84, height: 42 },
];

const CONFIG = {
  SIM_RATE: 60,
  segLength: 200,
  drawDistanceSegments: 18,
  spawnBufferDistance: 1700,
  initialSpawnExtraDistance: 500,
  despawnBehindDistance: -700,
  sameLaneSpacing: 2000,
  adjacentLaneSpacing: 1650,
  crossLaneSpacing: 1150,
  sameLaneMinGap: 900,
  sameLaneFollowDistance: 2200,
  adjacentLaneMinGap: 650,
  adjacentLaneFollowDistance: 1650,
  crossLaneMinGap: 0,
  crossLaneFollowDistance: 0,
  trafficAccel: 12,
  adjacentPressureDistance: 1600,
  pressureCullMinRelativeDistance: 2800,
  laneWallDistance: 400,
  laneWallPredictionDistance: 1200,
  reactionWindowDistance: 4800,
  wallAvoidanceLookaheadDistance: 5200,
  wallCullMinRelativeDistance: 1400,
  patternGapMin: 1600,
  patternGapMax: 2600,
  maxSpawnPerUpdate: 2,
  speedBands: {
    slow: [18, 28],
    normal: [28, 42],
    fast: [42, 56],
  },
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    const rawStep = i % 19 === 0 ? 1 / 15 : 1 / 60;
    const step = Math.min(rawStep, duration - elapsed);
    frames.push(step);
    elapsed += step;
    i++;
  }
  return frames;
}

function playerSpeedAt(t) {
  if (t < 1.5) return 35 + t * 18;
  if (t < 6) return 62;
  if (t < 7) return 74;
  return 58;
}

function simulate(frames, label) {
  const traffic = new TrafficWorld({
    random: seededRandom(1234),
    vehicles: VEHICLES,
    lanes: [-0.75, 0, 0.75],
    config: CONFIG,
  });
  let t = 0;
  let simTimeMs = 0;
  let playerDistance = 0;
  const visibleById = new Map();
  const passOrder = [];
  let maxVisibleJump = 0;
  let maxSegmentJump = 0;
  let peakActive = 0;
  let impossibleWall = false;
  let tightAdjacentPair = false;
  let sameLaneOverlap = false;
  let adjacentLaneOverlap = false;
  let reusedWhileVisible = false;

  traffic.reset({ simTimeMs, playerDistance, targetCount: 4 });

  for (const step of frames) {
    const speed = playerSpeedAt(t);
    playerDistance += speed * step * CONFIG.SIM_RATE;
    simTimeMs += step * 1000;
    t += step;

    const events = traffic.update({
      step,
      simTimeMs,
      playerDistance,
      playerSpeed: speed,
      roadLength: 12000,
      allowSpawn: true,
    });

    for (const retired of events.retired) {
      const last = visibleById.get(retired.id);
      if (last && last.relativeDistance > CONFIG.despawnBehindDistance * 0.5) {
        reusedWhileVisible = true;
      }
      visibleById.delete(retired.id);
    }

    const visible = traffic.getVisibleCars({
      playerDistance,
      aheadDistance: CONFIG.drawDistanceSegments * CONFIG.segLength + 400,
      behindDistance: 120,
    });
    const visibleIds = new Set(visible.map((car) => car.id));
    for (const id of visibleById.keys()) {
      if (!visibleIds.has(id)) visibleById.delete(id);
    }

    for (const car of visible) {
      const previous = visibleById.get(car.id);
      if (previous) {
        const jump = Math.abs(car.relativeDistance - previous.relativeDistance);
        maxVisibleJump = Math.max(maxVisibleJump, jump);
        maxSegmentJump = Math.max(maxSegmentJump, jump / CONFIG.segLength);
      }
      visibleById.set(car.id, { relativeDistance: car.relativeDistance });
    }

    for (const car of traffic.cars) {
      if (!car.passed && car.prevRelativeDistance > 0 && car.relativeDistance <= 0) {
        traffic.recordPass(car.id, 'SMOKE');
        passOrder.push(`${car.id}:${car.lane}`);
      }
    }

    peakActive = Math.max(peakActive, traffic.cars.length);
    if (hasThreeLaneWall(traffic.cars, playerDistance)) {
      impossibleWall = true;
    }
    if (hasTightAdjacentPair(traffic.cars, playerDistance)) {
      tightAdjacentPair = true;
    }
    if (hasSameLaneOverlap(traffic.cars)) {
      sameLaneOverlap = true;
    }
    if (hasAdjacentLaneOverlap(traffic.cars)) {
      adjacentLaneOverlap = true;
    }
  }

  const snapshot = traffic.cars
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((car) => ({
      id: car.id,
      lane: car.lane,
      relativeDistance: Number(car.relativeDistance.toFixed(1)),
      speed: Number(car.speed.toFixed(2)),
      passed: car.passed,
    }));

  return {
    label,
    playerDistance,
    passOrder,
    snapshot,
    peakActive,
    maxVisibleJump,
    maxSegmentJump,
    impossibleWall,
    tightAdjacentPair,
    sameLaneOverlap,
    adjacentLaneOverlap,
    reusedWhileVisible,
  };
}

function hasThreeLaneWall(cars, playerDistance) {
  const reactionCars = cars.filter((car) => {
    const rel = car.worldDistance - playerDistance;
    return rel > 0 && rel < CONFIG.reactionWindowDistance;
  });

  for (const anchor of reactionCars) {
    const lanes = new Set();
    for (const car of reactionCars) {
      if (Math.abs(car.worldDistance - anchor.worldDistance) <= CONFIG.laneWallDistance) {
        lanes.add(car.lane);
      }
    }
    if (lanes.size >= 3) return true;
  }
  return false;
}

function hasTightAdjacentPair(cars, playerDistance) {
  const laneStep = 0.75;
  const reactionCars = cars.filter((car) => {
    const rel = car.worldDistance - playerDistance;
    return rel > CONFIG.pressureCullMinRelativeDistance &&
      rel < CONFIG.wallAvoidanceLookaheadDistance;
  });

  for (let i = 0; i < reactionCars.length; i++) {
    for (let j = i + 1; j < reactionCars.length; j++) {
      const a = reactionCars[i];
      const b = reactionCars[j];
      const laneDistance = Math.abs(a.lane - b.lane);
      if (laneDistance <= 0.01 || laneDistance > laneStep * 1.1) continue;
      if (Math.abs(a.worldDistance - b.worldDistance) < CONFIG.adjacentPressureDistance) {
        return true;
      }
    }
  }
  return false;
}

function hasSameLaneOverlap(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      if (Math.abs(cars[i].lane - cars[j].lane) > 0.01) continue;
      if (Math.abs(cars[i].worldDistance - cars[j].worldDistance) < CONFIG.sameLaneMinGap - 1) {
        return true;
      }
    }
  }
  return false;
}

function hasAdjacentLaneOverlap(cars) {
  const laneStep = 0.75;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const laneDistance = Math.abs(cars[i].lane - cars[j].lane);
      if (laneDistance <= 0.01 || laneDistance > laneStep * 1.1) continue;
      if (Math.abs(cars[i].worldDistance - cars[j].worldDistance) < CONFIG.adjacentLaneMinGap - 1) {
        return true;
      }
    }
  }
  return false;
}

function manualCar({ id, lane, worldDistance, speed }) {
  return {
    id,
    type: VEHICLES[0],
    lane,
    worldDistance,
    speed,
    desiredSpeed: speed,
    spawnTime: 0,
    passed: false,
    crashed: false,
    state: 'active',
    prevRelativeDistance: worldDistance,
    relativeDistance: worldDistance,
    lastRenderBounds: null,
    pattern: 'manual',
  };
}

function simulateFollowingScenario({ adjacent = false } = {}) {
  const traffic = new TrafficWorld({
    random: seededRandom(5678),
    vehicles: VEHICLES,
    lanes: [-0.75, 0, 0.75],
    config: {
      ...CONFIG,
      despawnBehindDistance: -5000,
      maxSpawnPerUpdate: 0,
      wallCullMinRelativeDistance: Infinity,
      pressureCullMinRelativeDistance: Infinity,
    },
  });

  let simTimeMs = 0;
  const lane = adjacent ? -0.75 : 0;
  traffic.reset({ simTimeMs, playerDistance: 0, targetCount: 0 });
  traffic.cars.push(
    manualCar({ id: 1, lane: 0, worldDistance: 1800, speed: 20 }),
    manualCar({ id: 2, lane, worldDistance: adjacent ? 1500 : 1300, speed: 56 })
  );
  traffic.setTargetCount(0);

  for (const step of makeFrames(8, 60)) {
    simTimeMs += step * 1000;
    traffic.update({
      step,
      simTimeMs,
      playerDistance: 0,
      playerSpeed: 0,
      roadLength: 12000,
      allowSpawn: false,
    });
  }

  const ordered = traffic.cars.slice().sort((a, b) => b.worldDistance - a.worldDistance);
  const gap = ordered[0].worldDistance - ordered[1].worldDistance;
  const minGap = adjacent ? CONFIG.adjacentLaneMinGap : CONFIG.sameLaneMinGap;
  if (gap < minGap - 1) {
    throw new Error(`${adjacent ? 'adjacent' : 'same-lane'} follower clipped leader: gap ${gap.toFixed(1)} < ${minGap}`);
  }
  if (ordered[1].worldDistance > ordered[0].worldDistance) {
    throw new Error(`${adjacent ? 'adjacent' : 'same-lane'} follower passed through leader`);
  }
  if (!ordered[1].followingId) {
    throw new Error(`${adjacent ? 'adjacent' : 'same-lane'} follower never reacted to leader`);
  }
}

function approx(actual, expected, tolerance, label) {
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(3)}, got ${actual.toFixed(3)} (delta ${delta.toFixed(3)})`);
  }
}

const baseline = simulate(makeFrames(10, 60), '60fps');
const at30 = simulate(makeFrames(10, 30), '30fps');
const at144 = simulate(makeFrames(10, 144), '144fps');
const lag = simulate(makeLagFrames(10), 'lag-spike');

for (const run of [at30, at144, lag]) {
  approx(run.playerDistance, baseline.playerDistance, run.label === 'lag-spike' ? 80 : 40, `${run.label} player distance`);
  if (run.label !== 'lag-spike') {
    if (run.passOrder.length !== baseline.passOrder.length) {
      throw new Error(`${run.label} pass count diverged: ${run.passOrder.length} vs ${baseline.passOrder.length}`);
    }
  }
  if (run.label === 'lag-spike' && run.passOrder.length < Math.floor(baseline.passOrder.length * 0.65)) {
    throw new Error(`${run.label} skipped too many pass crossings: ${run.passOrder.length} vs ${baseline.passOrder.length}`);
  }
  if (run.snapshot.length !== baseline.snapshot.length) {
    throw new Error(`${run.label} active count diverged: ${run.snapshot.length} vs ${baseline.snapshot.length}`);
  }
  if (run.label !== 'lag-spike') {
    const expectedCars = baseline.snapshot.slice().sort((a, b) => b.relativeDistance - a.relativeDistance);
    const actualCars = run.snapshot.slice().sort((a, b) => b.relativeDistance - a.relativeDistance);
    for (let i = 0; i < expectedCars.length; i++) {
      approx(actualCars[i].relativeDistance, expectedCars[i].relativeDistance, run.label === '144fps' ? 420 : 2600, `${run.label} ordered car ${i} relative distance`);
    }
  }
}

for (const run of [baseline, at30, at144, lag]) {
  if (run.impossibleWall) {
    throw new Error(`${run.label} created a three-lane reaction wall`);
  }
  if (run.tightAdjacentPair) {
    throw new Error(`${run.label} created tight adjacent-lane pressure`);
  }
  if (run.sameLaneOverlap) {
    throw new Error(`${run.label} allowed same-lane car overlap`);
  }
  if (run.adjacentLaneOverlap) {
    throw new Error(`${run.label} allowed adjacent-lane car overlap`);
  }
  if (run.reusedWhileVisible) {
    throw new Error(`${run.label} reused/retired a car while still visibly close`);
  }
  if (run.maxSegmentJump > 1.8) {
    throw new Error(`${run.label} visible traffic jumped too far: ${run.maxSegmentJump.toFixed(3)} segments`);
  }
}

simulateFollowingScenario();
simulateFollowingScenario({ adjacent: true });

console.log('Traffic flow smoke passed');
console.table({
  '60fps': {
    passes: baseline.passOrder.length,
    active: baseline.snapshot.length,
    peakActive: baseline.peakActive,
    maxSegmentJump: baseline.maxSegmentJump.toFixed(3),
  },
  '30fps': {
    passes: at30.passOrder.length,
    active: at30.snapshot.length,
    peakActive: at30.peakActive,
    maxSegmentJump: at30.maxSegmentJump.toFixed(3),
  },
  '144fps': {
    passes: at144.passOrder.length,
    active: at144.snapshot.length,
    peakActive: at144.peakActive,
    maxSegmentJump: at144.maxSegmentJump.toFixed(3),
  },
  'lag-spike': {
    passes: lag.passOrder.length,
    active: lag.snapshot.length,
    peakActive: lag.peakActive,
    maxSegmentJump: lag.maxSegmentJump.toFixed(3),
  },
});
