globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
};

const { ASSETS } = await import('../client/src/config/assets.js');
const { HERO_TRAFFIC_HITBOX, TRAFFIC } = await import('../client/src/config/constants.js');
const { rectFromNormalizedHitbox, rectsOverlap } = await import('../client/src/core/mathUtils.js');
const { TrafficMixin } = await import('../client/src/core/trafficController.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, tolerance, label) {
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (delta ${delta})`);
  }
}

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function validateNormalizedHitbox(hitbox, label) {
  assert(hitbox, `${label} missing hitbox`);
  for (const key of ['left', 'top', 'right', 'bottom']) {
    assert(Number.isFinite(hitbox[key]), `${label} hitbox.${key} is not finite`);
    assert(hitbox[key] >= 0 && hitbox[key] <= 1, `${label} hitbox.${key} out of range`);
  }
  assert(hitbox.right > hitbox.left, `${label} hitbox width must be positive`);
  assert(hitbox.bottom > hitbox.top, `${label} hitbox height must be positive`);
}

// ---------------------------------------------------------------------------
// 1. Per-vehicle hitbox geometry (unchanged by the collision-model rewrite)
// ---------------------------------------------------------------------------
const unit = rect(0, 0, 100, 100);
const vehicles = ASSETS.IMAGE.VEHICLES;
assert(Array.isArray(vehicles) && vehicles.length >= 10, 'vehicle asset list missing');

const rows = vehicles.map((vehicle, index) => {
  validateNormalizedHitbox(vehicle.hitbox, `vehicle-${index}`);
  const box = rectFromNormalizedHitbox(unit, vehicle.hitbox);
  const widthFactor = box.width / unit.width;
  const heightFactor = box.height / unit.height;
  assert(widthFactor >= 0.47 && widthFactor <= 0.62, `vehicle-${index} width factor ${widthFactor.toFixed(2)} outside playable range`);
  assert(heightFactor >= 0.68 && heightFactor <= 0.76, `vehicle-${index} height factor ${heightFactor.toFixed(2)} outside playable range`);
  return { id: index, width: widthFactor.toFixed(2), height: heightFactor.toFixed(2) };
});

validateNormalizedHitbox(HERO_TRAFFIC_HITBOX, 'hero');
const heroBox = rectFromNormalizedHitbox(unit, HERO_TRAFFIC_HITBOX);
approx(heroBox.width, 40, 0.001, 'hero hitbox width');
approx(heroBox.height, 58, 0.001, 'hero hitbox height');

const fallback = rectFromNormalizedHitbox(unit, null, 0.58, 0.62);
approx(fallback.left, 21, 0.001, 'fallback left');
approx(fallback.right, 79, 0.001, 'fallback right');

const narrowVehicle = vehicles.find((vehicle) => vehicle.src.includes('vehicle-5'));
assert(narrowVehicle, 'vehicle-5 missing');
const narrowBox = rectFromNormalizedHitbox(rect(100, 0, 100, 100), narrowVehicle.hitbox);
assert(!rectsOverlap(narrowBox, rect(108, 40, 22, 24)), 'transparent left padding should not collide');
assert(rectsOverlap(narrowBox, rect(160, 40, 22, 24)), 'painted body area should collide');

// ---------------------------------------------------------------------------
// 2. Width-aware lane helpers (_carCrashLaneDist / _trafficShouldCrash). RETAINED but no
//    longer gate live crashes — section 3 (visual hitbox overlap) is the crash decision.
//    Kept here to lock the width-ordering invariant + debug fields.
// ---------------------------------------------------------------------------
// Near-miss tiers must stay strictly ordered above the crash gap.
assert(TRAFFIC.CRASH > 0, 'crash gap must be positive');
assert(TRAFFIC.CRASH < TRAFFIC.PERFECT, 'crash gap must sit below the perfect-pass band');
assert(TRAFFIC.PERFECT < TRAFFIC.CLOSE && TRAFFIC.CLOSE < TRAFFIC.NICE, 'near-miss tiers must be ordered');
assert(TRAFFIC.REFERENCE_CAR_WIDTH > 0, 'reference car width must be positive');
assert(TRAFFIC.IMPACT_BAND_SEGMENTS > 0, 'impact band must be positive');
assert(TRAFFIC.COLLISION_AHEAD_SEGMENTS > 0 && TRAFFIC.COLLISION_BEHIND_SEGMENTS > 0, 'collision window must be positive');

// Per-car crash gap is width-aware: wider body -> wider required gap. All stay below PERFECT.
const carCrash = (vehicle) => TrafficMixin._carCrashLaneDist.call(null, { type: vehicle });
const stdCar = vehicles[0];                                   // width 88, hitbox ~0.59
const truck = vehicles.find((v) => v.isTruck);                // width 100, hitbox ~0.55
const narrowCar = vehicles[3];                                // width 88, hitbox ~0.52
const crashStd = carCrash(stdCar);
const crashTruck = carCrash(truck);
const crashNarrow = carCrash(narrowCar);
assert(crashTruck > crashStd && crashStd > crashNarrow, `width ordering failed: truck ${crashTruck.toFixed(3)} std ${crashStd.toFixed(3)} narrow ${crashNarrow.toFixed(3)}`);
assert(crashTruck < TRAFFIC.PERFECT, 'even the widest crash gap must stay below a perfect pass');

// _trafficShouldCrash(car, closestLaneDist, inImpact, crossed)
const crashCtx = { _carCrashLaneDist: TrafficMixin._carCrashLaneDist };
function shouldCrash(vehicle, closest, inImpact, crossed) {
  return TrafficMixin._trafficShouldCrash.call(crashCtx, { type: vehicle }, closest, inImpact, crossed);
}
assert(shouldCrash(stdCar, 0.20, true, false), 'a very tight gap while longitudinally overlapping should crash');
assert(shouldCrash(stdCar, 0.20, false, true), 'a very tight gap at the crossing frame should crash');
assert(!shouldCrash(stdCar, 0.20, false, false), 'no crash when neither overlapping nor crossing');
assert(!shouldCrash(stdCar, TRAFFIC.PERFECT, true, false), 'a clear perfect-pass gap is never a crash');
// Width-aware ordering at a mid gap: the widest (truck) crashes, the narrowest is squeezable.
assert(shouldCrash(truck, 0.36, true, false), 'the widest car crashes at a mid gap (0.36)');
assert(!shouldCrash(narrowCar, 0.36, true, false), 'the narrowest car can be squeezed at a mid gap (0.36)');

// ---------------------------------------------------------------------------
// 3. _trafficWorldHits integration: CRASH is decided by rendered hitbox-rect overlap
//    (pixel-accurate / WYSIWYG); near-miss TIER is the closest lane gap at the crossing.
// ---------------------------------------------------------------------------
// hero rendered ~60x80 at the bottom of the view.
const heroRenderRect = () => rect(380, 600, 60, 80);

function runHits({ carBounds, laneDist = 1.4, lane = 0, rel = -8, prevRel = 34, simTimeMs = 1000, spawnTime = 0, trafficGraceUntil = 0, crashRecoveryUntil = 0, lateral = false }) {
  let crashCount = 0, passCount = 0, nearCount = 0;
  const car = {
    id: 1, lane, relativeDistance: rel, prevRelativeDistance: prevRel,
    spawnTime, state: 'active', crashed: false, passed: false, type: vehicles[0],
    lastRenderBounds: carBounds || null,
  };
  const context = {
    aiEnabled: true, inGame: true, debugCollision: false,
    simTimeMs, trafficGraceUntil, crashRecoveryUntil,
    cars: [car], playerX: laneDist, speed: 50,
    _heroBounds: heroRenderRect(),
    trafficWorld: { recordPass(id, type) { passCount++; car.passed = true; car.passType = type; }, retireCar() {} },
    _getHeroTrafficBounds: TrafficMixin._getHeroTrafficBounds,
    _rectsOverlap: TrafficMixin._rectsOverlap,
    _trafficVisualOverlap: TrafficMixin._trafficVisualOverlap,
    _trafficSweptVisualOverlap: () => false, // swept needs live projection; not exercised here
    _trafficLateralOverlap: () => lateral,   // depth-shared near-plane fallback (stubbed per case)
    _applyTrafficCrash(hitCar) { crashCount++; hitCar.crashed = true; hitCar._trafficCrashApplied = true; },
    _logTrafficCollisionDebug() {},
    _scoreNearMiss() { nearCount++; },
  };
  TrafficMixin._trafficWorldHits.call(context);
  return { crashCount, passCount, nearCount, car };
}

// Overlapping rendered sprites crash — regardless of the lane number.
const crash = runHits({ carBounds: rect(380, 600, 60, 80), laneDist: 1.4 });
assert(crash.crashCount === 1 && crash.nearCount === 0 && crash.passCount === 0, 'overlapping hitbox rects should crash, not score');

// Visually clear sprites with a close lane gap at the crossing → near-miss, no crash.
const perfect = runHits({ carBounds: rect(520, 600, 60, 80), laneDist: 0.64 });
assert(perfect.crashCount === 0 && perfect.nearCount === 1 && perfect.passCount === 1, 'clear sprites + 0.64 lane gap should score one near-miss');

// Near-plane fallback: even when the per-frame rendered rects DON'T overlap (Y projection lag),
// a same-lane car at the crossing crashes via the depth-shared lateral test.
const lateralCrash = runHits({ carBounds: rect(520, 600, 60, 80), laneDist: 0.0, lateral: true });
assert(lateralCrash.crashCount === 1 && lateralCrash.nearCount === 0, 'lateral fallback should crash a same-lane crossing the visual test misses');

// Visually clear + wide lane gap → plain pass, no score.
const wide = runHits({ carBounds: rect(520, 600, 60, 80), laneDist: 1.40 });
assert(wide.crashCount === 0 && wide.nearCount === 0 && wide.passCount === 1, 'a wide clear pass records a pass with no score');

// Just-spawned (fade grace) car is inert even if its rendered rect overlaps.
const fadeGrace = runHits({ carBounds: rect(380, 600, 60, 80), spawnTime: 800, simTimeMs: 1000 });
assert(fadeGrace.crashCount === 0 && fadeGrace.nearCount === 0, 'a just-spawned (fade-grace) car should not crash');

// Sector-grace traffic is inert.
const sectorGrace = runHits({ carBounds: rect(380, 600, 60, 80), trafficGraceUntil: 1500, simTimeMs: 1000 });
assert(sectorGrace.crashCount === 0 && sectorGrace.nearCount === 0, 'sector-grace traffic should be inert');

// ---------------------------------------------------------------------------
// 4. Pixel-accurate hitbox-rect overlap (hero vs car / pickup) — the core of the model.
// ---------------------------------------------------------------------------
const heroRect = rect(380, 600, 60, 80);
const heroHB = rectFromNormalizedHitbox(heroRect, HERO_TRAFFIC_HITBOX);
// Same-position car overlaps; a car shifted a full lane to the side does not.
const onTopCar = rectFromNormalizedHitbox(rect(380, 600, 60, 80), vehicles[0].hitbox);
const besideCar = rectFromNormalizedHitbox(rect(470, 600, 60, 80), vehicles[0].hitbox);
assert(rectsOverlap(heroHB, onTopCar), 'a car on the hero should overlap');
assert(!rectsOverlap(heroHB, besideCar), 'a car a lane over should not overlap');
// Pickup disc (inset bounding box) collects only when it reaches the hero.
const farPickup = rect(390, 300, 40, 40);   // up near the horizon
const onPickup = rect(390, 600, 40, 40);    // down at the hero
const insetBox = (r) => ({ left: r.left + r.width * 0.14, top: r.top + r.height * 0.14, right: r.right - r.width * 0.14, bottom: r.bottom - r.height * 0.14 });
assert(!rectsOverlap(heroHB, insetBox(farPickup)), 'a far pickup should not collect');
assert(rectsOverlap(heroHB, insetBox(onPickup)), 'a pickup on the hero should collect');

console.log('Hitbox + collision smoke passed');
console.table(rows);
