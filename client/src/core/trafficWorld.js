export const TRAFFIC_WORLD_DEFAULTS = {
  SIM_RATE: 60,
  segLength: 200,
  drawDistanceSegments: 35,
  spawnBufferDistance: 2200,
  initialSpawnExtraDistance: 800,
  minSpawnAheadDistance: 7000,
  despawnBehindDistance: -1400,
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
  visibleSpacingCorrectionRate: 18,
  patternGapMin: 1600,
  patternGapMax: 2600,
  maxSpawnPerUpdate: 2,
  speedBands: {
    slow: [18, 28],
    normal: [28, 42],
    fast: [42, 56],
  },
};

const DEFAULT_LANES = [-0.75, 0, 0.75];

export class TrafficWorld {
  constructor(options = {}) {
    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.vehicles = Array.isArray(options.vehicles) ? options.vehicles : [];
    this.lanes = Array.isArray(options.lanes) && options.lanes.length > 0
      ? options.lanes.slice()
      : DEFAULT_LANES.slice();
    this.config = { ...TRAFFIC_WORLD_DEFAULTS, ...(options.config || {}) };
    this.cars = [];
    this.targetCount = 0;
    this.nextId = 1;
    this.nextSpawnDistance = 0;
    this.patternQueue = [];
    this.previousPlayerDistance = 0;
    this.frameEvents = { spawned: [], retired: [] };
  }

  setVehicles(vehicles = []) {
    this.vehicles = Array.isArray(vehicles) ? vehicles : [];
  }

  setTargetCount(count) {
    this.targetCount = Math.max(0, Math.floor(Number(count) || 0));
  }

  reset({ simTimeMs = 0, playerDistance = 0, targetCount = this.targetCount } = {}) {
    this.cars.length = 0;
    this.patternQueue.length = 0;
    this.frameEvents = { spawned: [], retired: [] };
    this.previousPlayerDistance = playerDistance;
    this.nextId = 1;
    this.setTargetCount(targetCount);
    this.nextSpawnDistance = playerDistance + this._initialSpawnDistance();
    this._fillToTarget({ simTimeMs, playerDistance, allowSpawn: true, maxSpawns: this.targetCount });
    return this.cars;
  }

  clearForSector({ simTimeMs = 0, playerDistance = this.previousPlayerDistance } = {}) {
    const retired = this.cars.splice(0, this.cars.length);
    for (const car of retired) {
      car.state = 'retired';
      car.retiredAt = simTimeMs;
    }
    this.frameEvents = { spawned: [], retired };
    this.patternQueue.length = 0;
    this.previousPlayerDistance = playerDistance;
    this.nextSpawnDistance = playerDistance + this._initialSpawnDistance();
  }

  update({
    step = 0,
    simTimeMs = 0,
    playerDistance = 0,
    playerSpeed = 0,
    roadLength = 0,
    allowSpawn = true,
  } = {}) {
    const safeStep = Number.isFinite(step) && step > 0 ? step : 0;
    this.frameEvents = { spawned: [], retired: [] };

    for (const car of this.cars) {
      car.prevRelativeDistance = Number.isFinite(car.relativeDistance)
        ? car.relativeDistance
        : car.worldDistance - this.previousPlayerDistance;
      if (!Number.isFinite(car.desiredSpeed)) car.desiredSpeed = Number.isFinite(car.speed) ? car.speed : this._speed('normal');
      if (!Number.isFinite(car.speed)) car.speed = car.desiredSpeed;
      car.followingId = null;
    }

    this._applyTrafficAwareness(safeStep);

    for (const car of this.cars) {
      car.worldDistance += car.speed * safeStep * this.config.SIM_RATE;
      car.playerSpeedAtUpdate = playerSpeed;
      car.roadLengthAtUpdate = roadLength;
    }

    this._resolveTrafficSpacing(safeStep, playerDistance);

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      car.relativeDistance = car.worldDistance - playerDistance;

      if (car.relativeDistance < this.config.despawnBehindDistance) {
        car.state = 'retired';
        car.retiredAt = simTimeMs;
        this.frameEvents.retired.push(car);
        this.cars.splice(i, 1);
      }
    }

    this.previousPlayerDistance = playerDistance;

    this._breakLaneWalls(playerDistance, simTimeMs, playerSpeed);
    this._breakTightAdjacentPairs(playerDistance, simTimeMs, playerSpeed);

    if (allowSpawn) {
      this._fillToTarget({ simTimeMs, playerDistance, allowSpawn, maxSpawns: this.config.maxSpawnPerUpdate });
    }

    return this.frameEvents;
  }

  getVisibleCars({ playerDistance = this.previousPlayerDistance, aheadDistance = Infinity, behindDistance = 0 } = {}) {
    const visible = [];
    for (const car of this.cars) {
      car.relativeDistance = car.worldDistance - playerDistance;
      if (car.relativeDistance >= -behindDistance && car.relativeDistance <= aheadDistance) {
        visible.push(car);
      }
    }
    visible.sort((a, b) => b.relativeDistance - a.relativeDistance);
    return visible;
  }

  recordPass(carId, passType = 'WIDE') {
    const car = this.cars.find((item) => item.id === carId);
    if (!car) return null;
    car.passed = true;
    car.passType = passType;
    return car;
  }

  retireCar(carId, simTimeMs = 0) {
    const index = this.cars.findIndex((item) => item.id === carId);
    if (index < 0) return null;
    const [car] = this.cars.splice(index, 1);
    car.state = 'retired';
    car.retiredAt = simTimeMs;
    this.frameEvents.retired.push(car);
    return car;
  }

  _fillToTarget({ simTimeMs, playerDistance, allowSpawn, maxSpawns }) {
    if (!allowSpawn || this.vehicles.length === 0 || this.targetCount <= 0) return;
    let spawns = 0;
    while (this.cars.length < this.targetCount && spawns < maxSpawns) {
      if (this.patternQueue.length === 0) {
        this._queueNextPattern(playerDistance);
      }
      const descriptor = this.patternQueue.shift();
      if (!descriptor) break;
      if (descriptor.type === 'gap') continue;

      const car = this._spawnFromDescriptor(descriptor, simTimeMs);
      if (car) spawns++;
    }
  }

  _spawnFromDescriptor(descriptor, simTimeMs) {
    // Safety floor: never spawn nearer than minSpawnAheadDistance from the player.
    // Normal spawns sit well beyond this; the guard only catches edge cases (and pushes
    // the spawn cursor out so the next attempt lands far enough ahead).
    const minAhead = this.config.minSpawnAheadDistance;
    if (Number.isFinite(minAhead) && descriptor.worldDistance - this.previousPlayerDistance < minAhead) {
      this.nextSpawnDistance = Math.max(
        this.nextSpawnDistance,
        this.previousPlayerDistance + minAhead + this.config.patternGapMin
      );
      return null;
    }

    if (!this._canPlace(descriptor)) {
      this.nextSpawnDistance = Math.max(this.nextSpawnDistance, descriptor.worldDistance + this.config.patternGapMin);
      return null;
    }

    const car = {
      id: this.nextId++,
      type: this._pick(this.vehicles),
      lane: descriptor.lane,
      worldDistance: descriptor.worldDistance,
      speed: descriptor.speed,
      spawnTime: simTimeMs,
      passed: false,
      crashed: false,
      state: 'active',
      prevRelativeDistance: descriptor.worldDistance - this.previousPlayerDistance,
      relativeDistance: descriptor.worldDistance - this.previousPlayerDistance,
      lastRenderBounds: null,
      pattern: descriptor.pattern,
      desiredSpeed: descriptor.speed,
      followingId: null,
    };
    this.cars.push(car);
    this.frameEvents.spawned.push(car);
    return car;
  }

  _queueNextPattern(playerDistance) {
    const type = this._choosePattern();
    const base = Math.max(
      this.nextSpawnDistance,
      playerDistance + this._spawnAheadDistance()
    ) + this._range(-160, 220);

    if (type === 'recovery-gap') {
      this.nextSpawnDistance = base + this._range(1300, 2200);
      this.patternQueue.push({ type: 'gap' });
      return;
    }

    const descriptors = this._buildPattern(type, base);
    for (const descriptor of descriptors) {
      this.patternQueue.push(descriptor);
    }
    const last = descriptors.reduce((max, item) => Math.max(max, item.worldDistance), base);
    this.nextSpawnDistance =
      last + this._range(this.config.patternGapMin, this.config.patternGapMax);
  }

  _choosePattern() {
    const roll = this._random();
    if (roll < 0.42) return 'single-slow';
    if (roll < 0.70) return 'staggered-two';
    if (roll < 0.82) return 'two-lane-gate';
    if (roll < 0.88) return 'light-pack';
    return 'recovery-gap';
  }

  _buildPattern(pattern, base) {
    if (pattern === 'single-slow') {
      return [this._descriptor(pattern, base, this._pickLane(), 'slow')];
    }

    if (pattern === 'staggered-two') {
      const lanes = this._shuffleLanes().slice(0, 2);
      return [
        this._descriptor(pattern, base, lanes[0], 'normal'),
        this._descriptor(pattern, base + this._range(1700, 2500), lanes[1], this._random() < 0.35 ? 'fast' : 'normal'),
      ];
    }

    if (pattern === 'two-lane-gate') {
      const lanes = this._shuffleLanes().slice(0, 2);
      const offset = this._range(1600, 2400);
      return [
        this._descriptor(pattern, base, lanes[0], 'normal'),
        this._descriptor(pattern, base + offset, lanes[1], 'normal'),
      ];
    }

    const lanes = this._shuffleLanes().slice(0, 2);
    return [
      this._descriptor(pattern, base, lanes[0], 'normal'),
      this._descriptor(pattern, base + this._range(1800, 2600), lanes[1], 'slow'),
      this._descriptor(pattern, base + this._range(3800, 5200), lanes[this._randomInt(2)], this._random() < 0.5 ? 'normal' : 'fast'),
    ];
  }

  _descriptor(pattern, worldDistance, lane, speedBand) {
    return {
      type: 'car',
      pattern,
      worldDistance,
      lane,
      speed: this._speed(speedBand),
    };
  }

  _canPlace(candidate) {
    for (const car of this.cars) {
      const distance = Math.abs(car.worldDistance - candidate.worldDistance);
      const spacing = this._spacingForLanePair(car.lane, candidate.lane);
      if (distance < spacing) {
        return false;
      }
    }

    const lanesNearCandidate = new Set([candidate.lane]);
    for (const car of this.cars) {
      if (Math.abs(car.worldDistance - candidate.worldDistance) <= this.config.laneWallDistance) {
        lanesNearCandidate.add(car.lane);
      }
    }
    return lanesNearCandidate.size < this.lanes.length;
  }

  _spacingForLanePair(a, b) {
    const laneDistance = Math.abs(a - b);
    if (laneDistance < 0.01) return this.config.sameLaneSpacing;
    const laneStep = this._laneStep();
    if (laneDistance <= laneStep * 1.1) return this.config.adjacentLaneSpacing;
    return this.config.crossLaneSpacing;
  }

  _followConfigForLanePair(a, b) {
    const laneDistance = Math.abs(a - b);
    if (laneDistance < 0.01) {
      return {
        minGap: this.config.sameLaneMinGap,
        followDistance: this.config.sameLaneFollowDistance,
      };
    }

    const laneStep = this._laneStep();
    if (laneDistance <= laneStep * 1.1) {
      return {
        minGap: this.config.adjacentLaneMinGap,
        followDistance: this.config.adjacentLaneFollowDistance,
      };
    }

    return {
      minGap: this.config.crossLaneMinGap,
      followDistance: this.config.crossLaneFollowDistance,
    };
  }

  _laneStep() {
    if (this.lanes.length < 2) return 0.75;
    const sorted = this.lanes.slice().sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      min = Math.min(min, Math.abs(sorted[i] - sorted[i - 1]));
    }
    return Number.isFinite(min) ? min : 0.75;
  }

  _applyTrafficAwareness(step) {
    const frames = Math.max(0.0001, step * this.config.SIM_RATE);
    const accelStep = (this.config.trafficAccel ?? 12) * step;

    for (const car of this.cars) {
      const desired = Number.isFinite(car.desiredSpeed) ? car.desiredSpeed : car.speed;
      if (car.speed < desired) {
        car.speed = Math.min(desired, car.speed + accelStep);
      } else if (car.speed > desired) {
        car.speed = Math.max(desired, car.speed - accelStep);
      }
    }

    const ordered = this.cars.slice().sort((a, b) => b.worldDistance - a.worldDistance);
    for (let i = 0; i < ordered.length; i++) {
      const rear = ordered[i];
      let closest = null;
      let closestGap = Infinity;
      let closestFollow = null;

      for (let j = i - 1; j >= 0; j--) {
        const leader = ordered[j];
        const gap = leader.worldDistance - rear.worldDistance;
        if (gap <= 0 || gap >= closestGap) continue;

        const follow = this._followConfigForLanePair(rear.lane, leader.lane);
        if (follow.minGap <= 0 || follow.followDistance <= 0 || gap > follow.followDistance) continue;

        closest = leader;
        closestGap = gap;
        closestFollow = follow;
      }

      if (!closest || !closestFollow) continue;

      const availableGap = Math.max(0, closestGap - closestFollow.minGap);
      const maxSafeSpeed = closest.speed + availableGap / frames;
      rear.speed = Math.min(rear.speed, maxSafeSpeed);
      if (closestGap < closestFollow.minGap * 1.2) {
        rear.speed = Math.min(rear.speed, closest.speed);
      }
      rear.followingId = closest.id;
    }
  }

  _resolveTrafficSpacing(step = 0, playerDistance = this.previousPlayerDistance) {
    const active = this.cars.filter((car) => car.state !== 'retired');
    for (const lane of this.lanes) {
      const laneCars = active
        .filter((car) => Math.abs(car.lane - lane) < 0.01)
        .sort((a, b) => b.worldDistance - a.worldDistance);

      for (let i = 1; i < laneCars.length; i++) {
        this._separateFollower(laneCars[i - 1], laneCars[i], this.config.sameLaneMinGap, step, playerDistance);
      }
    }

    const laneStep = this._laneStep();
    for (let pass = 0; pass < 2; pass++) {
      const ordered = active.slice().sort((a, b) => b.worldDistance - a.worldDistance);
      for (let i = 0; i < ordered.length; i++) {
        const leader = ordered[i];
        for (let j = i + 1; j < ordered.length; j++) {
          const rear = ordered[j];
          const laneDistance = Math.abs(leader.lane - rear.lane);
          if (laneDistance <= 0.01 || laneDistance > laneStep * 1.1) continue;
          this._separateFollower(leader, rear, this.config.adjacentLaneMinGap, step, playerDistance);
        }
      }
    }
  }

  _separateFollower(leader, rear, minGap, step = 0, playerDistance = this.previousPlayerDistance) {
    if (!leader || !rear || minGap <= 0) return;
    const gap = leader.worldDistance - rear.worldDistance;
    if (gap < 0 || gap >= minGap) return;

    const targetDistance = leader.worldDistance - minGap;
    const correction = rear.worldDistance - targetDistance;
    const recentlyRendered =
      leader.wasDrawnThisFrame === true ||
      leader.wasDrawnLastFrame === true ||
      rear.wasDrawnThisFrame === true ||
      rear.wasDrawnLastFrame === true;

    if (recentlyRendered && correction > 0 && step > 0) {
      const maxCorrection = Math.max(
        2,
        (this.config.visibleSpacingCorrectionRate ?? 18) * step * this.config.SIM_RATE
      );
      rear.worldDistance = Math.max(targetDistance, rear.worldDistance - Math.min(correction, maxCorrection));
      rear.spacingCorrectionLimited = correction > maxCorrection;
    } else {
      rear.worldDistance = targetDistance;
      rear.spacingCorrectionLimited = false;
    }
    rear.speed = Math.min(rear.speed, leader.speed);
    rear.followingId = leader.id;
  }

  _breakLaneWalls(playerDistance, simTimeMs, playerSpeed = 0) {
    const candidates = this.cars.filter((car) => {
      const rel = car.worldDistance - playerDistance;
      car.relativeDistance = rel;
      return rel > this.config.wallCullMinRelativeDistance &&
        rel < this.config.wallAvoidanceLookaheadDistance;
    });

    const horizons = [0, 0.75, 1.5, 2.5, 3.5];
    for (const horizon of horizons) {
      const projected = candidates.map((car) => ({
        car,
        worldDistance: car.worldDistance + car.speed * horizon * this.config.SIM_RATE,
        relativeDistance:
          car.worldDistance +
          car.speed * horizon * this.config.SIM_RATE -
          (playerDistance + playerSpeed * horizon * this.config.SIM_RATE),
      })).filter((item) =>
        item.relativeDistance > this.config.wallCullMinRelativeDistance &&
        item.relativeDistance < this.config.wallAvoidanceLookaheadDistance
      );

      for (const anchor of projected) {
        const wallDistance = horizon === 0
          ? this.config.laneWallDistance
          : this.config.laneWallPredictionDistance;
        const group = projected.filter((item) =>
          Math.abs(item.worldDistance - anchor.worldDistance) <= wallDistance
        );
        const lanes = new Set(group.map((item) => item.car.lane));
        if (lanes.size < this.lanes.length) continue;

        group.sort((a, b) => {
          const relDelta = b.relativeDistance - a.relativeDistance;
          if (Math.abs(relDelta) > 1) return relDelta;
          return b.car.id - a.car.id;
        });
        this.retireCar(group[0].car.id, simTimeMs);
        return;
      }
    }
  }

  _breakTightAdjacentPairs(playerDistance, simTimeMs, playerSpeed = 0) {
    const laneStep = this._laneStep();
    const minRel = this.config.pressureCullMinRelativeDistance ?? this.config.wallCullMinRelativeDistance;
    const maxRel = this.config.wallAvoidanceLookaheadDistance;
    const pressureDistance = this.config.adjacentPressureDistance ?? this.config.adjacentLaneSpacing;
    const horizons = [0, 1.25, 2.5, 3.75];

    for (const horizon of horizons) {
      const projected = this.cars.map((car) => ({
        car,
        worldDistance: car.worldDistance + car.speed * horizon * this.config.SIM_RATE,
        relativeDistance:
          car.worldDistance +
          car.speed * horizon * this.config.SIM_RATE -
          (playerDistance + playerSpeed * horizon * this.config.SIM_RATE),
      })).filter((item) =>
        item.relativeDistance > minRel &&
        item.relativeDistance < maxRel
      );

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];
          const laneDistance = Math.abs(a.car.lane - b.car.lane);
          if (laneDistance <= 0.01 || laneDistance > laneStep * 1.1) continue;
          if (Math.abs(a.worldDistance - b.worldDistance) > pressureDistance) continue;

          const retire = a.relativeDistance > b.relativeDistance ? a.car : b.car;
          this.retireCar(retire.id, simTimeMs);
          return;
        }
      }
    }
  }

  _initialSpawnDistance() {
    return this._spawnAheadDistance() + this.config.initialSpawnExtraDistance;
  }

  _spawnAheadDistance() {
    return this.config.drawDistanceSegments * this.config.segLength + this.config.spawnBufferDistance;
  }

  _speed(bandName) {
    const band = this.config.speedBands[bandName] || this.config.speedBands.normal;
    return this._range(band[0], band[1]);
  }

  _pickLane() {
    return this._pick(this.lanes);
  }

  _shuffleLanes() {
    const lanes = this.lanes.slice();
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = this._randomInt(i + 1);
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    return lanes;
  }

  _pick(items) {
    return items[this._randomInt(items.length)];
  }

  _range(min, max) {
    return min + this._random() * (max - min);
  }

  _randomInt(max) {
    return Math.floor(this._random() * Math.max(1, max));
  }

  _random() {
    return this.random();
  }
}
