import * as constants from '../config/constants.js';
import { ASSETS } from '../config/assets.js';
import { Car } from '../classes/Car.js';
import { rectFromNormalizedHitbox, rectsOverlap } from './mathUtils.js';

// Traffic system: spawn configuration, projection, DOM rendering, collision /
// near-miss detection, post-crash recovery, lane selection, and respawn.
// Mixed into GameEngine.prototype; every method runs with `this` bound to the
// engine instance, identical to an inline class method.
export const TrafficMixin = {
  _getSelectedDensityPreset() {
    const key = constants.normalizeTrafficDensityKey(this.selectedDensityKey);
    const preset = this.selectedDensityPreset || constants.getTrafficDensityPreset(key);
    return preset || constants.getTrafficDensityPreset(constants.DEFAULT_TRAFFIC_DENSITY);
  },

  _setTrafficDensity(key) {
    this.selectedDensityKey = constants.normalizeTrafficDensityKey(key);
    this.selectedDensityPreset = constants.getTrafficDensityPreset(this.selectedDensityKey);
    if (this.trafficWorld) {
      this.trafficWorld.config = { ...this.trafficWorld.config, ...this._getTrafficWorldConfig() };
      this.trafficWorld.setTargetCount(this._getTrafficTargetCount());
    }
  },

  _getDensityScoreMultiplier() {
    const preset = this._getSelectedDensityPreset();
    return Number.isFinite(preset?.scoreMultiplier) ? preset.scoreMultiplier : 1;
  },

  _getTrafficWorldConfig() {
    const preset = this._getSelectedDensityPreset();
    const spacing = Number.isFinite(preset.spacingMultiplier) ? preset.spacingMultiplier : 1;
    const speed = Number.isFinite(preset.speedMultiplier) ? preset.speedMultiplier : 1;
    const scaleDistance = (value) => Math.round(value * spacing);
    const scaleSpeedBand = ([min, max]) => [min * speed, max * speed];

    return {
      segLength: constants.segL,
      drawDistanceSegments: Math.max(constants.drawDistance + 8, Math.floor(constants.N * 0.62)),
      despawnBehindDistance: -constants.segL * 7,
      sameLaneSpacing: scaleDistance(constants.segL * 10),
      adjacentLaneSpacing: scaleDistance(constants.segL * 8.25),
      crossLaneSpacing: scaleDistance(constants.segL * 5.75),
      sameLaneMinGap: scaleDistance(constants.segL * 4.5),
      sameLaneFollowDistance: scaleDistance(constants.segL * 11),
      adjacentLaneMinGap: scaleDistance(constants.segL * 3.25),
      adjacentLaneFollowDistance: scaleDistance(constants.segL * 8.25),
      crossLaneMinGap: 0,
      crossLaneFollowDistance: 0,
      trafficAccel: 12,
      adjacentPressureDistance: scaleDistance(constants.segL * 8),
      pressureCullMinRelativeDistance: scaleDistance(constants.segL * 14),
      laneWallDistance: constants.segL * 2,
      laneWallPredictionDistance: constants.segL * 6,
      reactionWindowDistance: constants.segL * 24,
      wallAvoidanceLookaheadDistance: constants.segL * Math.max(24, constants.drawDistance - 1),
      wallCullMinRelativeDistance: constants.segL * 7,
      spawnBufferDistance: constants.segL * 8.5,
      initialSpawnExtraDistance: constants.segL * 2.5,
      // Hard floor: never place a car nearer than the visible horizon (drawDistance),
      // so traffic always fades in from far ahead instead of popping in near the player.
      minSpawnAheadDistance: constants.segL * Math.max(constants.drawDistance + 8, Math.floor(constants.N * 0.62)),
      patternGapMin: scaleDistance(constants.segL * 8),
      patternGapMax: scaleDistance(constants.segL * 13),
      maxSpawnPerUpdate: 2,
      densityKey: preset.key,
      speedBands: {
        slow: scaleSpeedBand([18, 28]),
        normal: scaleSpeedBand([28, 42]),
        fast: scaleSpeedBand([42, 56]),
      },
    };
  },

  _getTrafficTargetCount() {
    const preset = this._getSelectedDensityPreset();
    const baseCars = Number.isFinite(preset.baseCars) ? preset.baseCars : constants.AI_BASE_COUNT;
    const carsPerSector = Number.isFinite(preset.carsPerSector) ? preset.carsPerSector : constants.AI_CARS_PER_LEVEL;
    const maxCars = Number.isFinite(preset.maxCars) ? preset.maxCars : constants.AI_MAX_CARS;
    return Math.min(baseCars + (this.levelsCompleted * carsPerSector), maxCars);
  },

  initCars() {
    const vehicles = ASSETS.IMAGE.VEHICLES;
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      console.warn('initCars: No vehicles available');
      return;
    }
    this._hideAllTrafficElements();
    this.trafficWorld.setVehicles(vehicles);
    this.trafficWorld.config = { ...this.trafficWorld.config, ...this._getTrafficWorldConfig() };
    this.trafficWorld.reset({
      simTimeMs: this.simTimeMs,
      playerDistance: this.totalDistance || 0,
      targetCount: this._getTrafficTargetCount(),
    });
    this.cars = this.trafficWorld.cars;
    console.log(`TrafficWorld initialized: ${this.cars.length} persistent cars`);
  },

  _hideAllTrafficElements() {
    if (!this.trafficCarElements) return;
    for (const wrapper of this.trafficCarElements.values()) {
      if (wrapper?.element) wrapper.element.style.display = 'none';
    }
  },

  _hideRetiredTrafficElements(retired = []) {
    for (const car of retired) {
      const wrapper = this.trafficCarElements?.get(car.id);
      if (wrapper?.element) wrapper.element.style.display = 'none';
    }
  },

  _ensureTrafficCarElement(car) {
    if (!this.trafficCarElements) this.trafficCarElements = new Map();
    let wrapper = this.trafficCarElements.get(car.id);
    if (!wrapper) {
      wrapper = new Car(0, car.type, car.lane, car.spawnTime);
      wrapper.id = car.id;
      wrapper.element.classList.add('traffic-car');
      wrapper.element.dataset.trafficId = String(car.id);
      wrapper.element.style.left = '0px';
      wrapper.element.style.top = '0px';
      wrapper.element.style.transform = 'none';
      wrapper.element.style.willChange = 'left, top, width, height, opacity';
      this.trafficCarElements.set(car.id, wrapper);
    }
    wrapper.type = car.type;
    wrapper.lane = car.lane;
    wrapper.spawnTime = car.spawnTime;
    wrapper.fadeInDuration = 700;
    car.element = wrapper.element;
    return wrapper.element;
  },

  _trafficRenderAheadDistance() {
    return Math.max(constants.segL, (constants.N - 3) * constants.segL);
  },

  _rememberTrafficProjectionRow(line, offsetSegments) {
    if (!line || !Number.isFinite(line.scale) || line.scale <= 0) return;
    if (!Array.isArray(this.trafficProjectionRows)) this.trafficProjectionRows = [];
    // The camera is quantized to the segment boundary (camZ = startPos*segL), but the
    // player sits at a continuous sub-segment offset. Cars track distance continuously,
    // so label each row by its TRUE distance from the player (segment distance minus the
    // sub-segment offset). Without this, a car's distance->screen-X mapping is off by up
    // to one segment and sawtooths every segment crossing — a visible freeze/snap on curves.
    const segL = constants.segL;
    const subSegmentOffset = ((this.pos % segL) + segL) % segL;
    this.trafficProjectionRows.push({
      relativeDistance: offsetSegments * segL - subSegmentOffset,
      X: line.X,
      Y: line.Y,
      W: line.W,
      scale: line.scale,
      roadLeft: line.X - line.W * 0.5,
      roadRight: line.X + line.W * 0.5,
      curve: line.curve || 0,
      rawCurve: line.rawCurve || 0,
      rawHeight: line.rawHeight || 0,
    });
  },

  _sampleTrafficProjection(relativeDistance) {
    const rows = this.trafficProjectionRows;
    if (!Array.isArray(rows) || rows.length < 2 || !Number.isFinite(relativeDistance)) return null;

    const first = rows[0];
    const last = rows[rows.length - 1];
    // The first traffic row sits ~a segment ahead of the player, but the hero is drawn at the
    // very bottom of the screen (nearer than rel=0). Extrapolate below the first row (down to
    // ~2 segments) so cars crossing the player's plane still project down into the hero's
    // screen band — otherwise there's a near-field gap where a car has no projectable bounds
    // and can pass through the player without a crash.
    const nearFloor = first.relativeDistance - constants.segL * 2;
    if (relativeDistance < nearFloor || relativeDistance > last.relativeDistance) return null;

    if (relativeDistance < first.relativeDistance) {
      const a = rows[0];
      const b = rows[1];
      const span = (b.relativeDistance - a.relativeDistance) || constants.segL;
      const t = (relativeDistance - a.relativeDistance) / span; // < 0 (extrapolating toward the player)
      const ex = (p, q) => p + (q - p) * t;
      return {
        relativeDistance,
        X: ex(a.X, b.X),
        Y: ex(a.Y, b.Y),
        W: ex(a.W, b.W),
        scale: a.scale, // nearest (positive) scale; sprite sizing uses W, not scale
        roadLeft: ex(a.roadLeft, b.roadLeft),
        roadRight: ex(a.roadRight, b.roadRight),
        curve: ex(a.curve, b.curve),
        rawCurve: ex(a.rawCurve, b.rawCurve),
        rawHeight: ex(a.rawHeight, b.rawHeight),
        lowerOffset: 0,
        t: 0,
      };
    }

    const distance = Math.max(first.relativeDistance, Math.min(relativeDistance, last.relativeDistance));
    let lowerIndex = Math.max(0, Math.min(rows.length - 2, Math.floor(distance / constants.segL)));
    while (lowerIndex > 0 && rows[lowerIndex].relativeDistance > distance) lowerIndex--;
    while (lowerIndex < rows.length - 2 && rows[lowerIndex + 1].relativeDistance < distance) lowerIndex++;

    const lower = rows[lowerIndex];
    const upper = rows[Math.min(rows.length - 1, lowerIndex + 1)] || lower;
    const span = Math.max(1, upper.relativeDistance - lower.relativeDistance);
    const t = Math.max(0, Math.min(1, (distance - lower.relativeDistance) / span));
    const lerp = (a, b) => a + (b - a) * t;

    return {
      relativeDistance: distance,
      X: lerp(lower.X, upper.X),
      Y: lerp(lower.Y, upper.Y),
      W: lerp(lower.W, upper.W),
      scale: lerp(lower.scale, upper.scale),
      roadLeft: lerp(lower.roadLeft, upper.roadLeft),
      roadRight: lerp(lower.roadRight, upper.roadRight),
      curve: lerp(lower.curve, upper.curve),
      rawCurve: lerp(lower.rawCurve, upper.rawCurve),
      rawHeight: lerp(lower.rawHeight, upper.rawHeight),
      lowerOffset: lowerIndex,
      t,
    };
  },

  _trafficLaneAxis(lane) {
    const lanes = Object.values(constants.LANE).filter(Number.isFinite);
    const maxLane = lanes.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
    return Math.max(-1, Math.min(1, (Number(lane) || 0) / maxLane));
  },

  _projectTrafficCar(car, startPos) {
    return this._projectTrafficCarAtDistance(car, car.relativeDistance);
  },

  _projectTrafficCarAtDistance(car, relativeDistance) {
    if (!Number.isFinite(relativeDistance)) return null;
    const projected = this._sampleTrafficProjection(relativeDistance);
    if (!projected) return null;

    const rawOffset = relativeDistance / constants.segL;
    const scale = projected.scale;
    if (!Number.isFinite(scale) || scale <= 0) return null;

    // Center traffic inside each lane without relying on hard edge clamps.
    // The value is expressed as a fraction of half-road width; keeping it below
    // the painted lane-center ideal gives wide sprites room during hard curves.
    const laneHalfSpread = 0.56;
    const laneOffset = this._trafficLaneAxis(car.lane) * projected.W * 0.5 * laneHalfSpread;
    const laneCenterX = projected.X + laneOffset;
    const roadLeft = projected.roadLeft;
    const roadRight = projected.roadRight;
    return {
      X: projected.X,
      Y: projected.Y,
      W: projected.W,
      scale,
      laneCenterX,
      laneOffset,
      roadLeft,
      roadRight,
      roadMinX: Math.min(roadLeft, roadRight),
      roadMaxX: Math.max(roadLeft, roadRight),
      rawOffset,
      lowerOffset: projected.lowerOffset,
      projectionT: projected.t,
      zIndex: Math.round(30000 - Math.max(0, rawOffset) * 120),
    };
  },

  _trafficRenderMetrics(car, projected) {
    if (!car?.type || !projected) return null;
    const spriteScaleBase = 300;
    const renderW = (car.type.width * projected.W) / spriteScaleBase;
    const renderH = (car.type.height * projected.W) / spriteScaleBase;
    if (!Number.isFinite(renderW) || !Number.isFinite(renderH) || renderW <= 0 || renderH <= 0) return null;

    const roadHalfWidth = Math.max(1, (projected.roadMaxX - projected.roadMinX) * 0.5);
    const maxLaneOffset = Math.max(0, roadHalfWidth - renderW * 0.46);
    const fittedLaneOffset = Math.max(-maxLaneOffset, Math.min(maxLaneOffset, projected.laneOffset));
    const laneCenterX = projected.X + fittedLaneOffset;
    const renderX = laneCenterX - renderW / 2;
    const renderY = projected.Y + 4 - renderH;

    return {
      renderW,
      renderH,
      renderX,
      renderY,
      fittedLaneOffset,
      bounds: {
        left: renderX,
        top: renderY,
        right: renderX + renderW,
        bottom: renderY + renderH,
        width: renderW,
        height: renderH,
        centerX: renderX + renderW / 2,
        centerY: renderY + renderH / 2,
      },
    };
  },

  _renderTrafficCars(startPos) {
    if (!this.aiEnabled || !this.trafficWorld) {
      this._hideAllTrafficElements();
      return;
    }

    for (const car of this.cars || []) {
      car.wasDrawnLastFrame = car.wasDrawnThisFrame === true;
      car.wasDrawnThisFrame = false;
      car.lastRenderBounds = null;
      car.lastCollisionBounds = null;
      car.lastSweepRenderBounds = null;
      car.lastSweepCollisionBounds = null;
    }
    for (const wrapper of this.trafficCarElements?.values?.() || []) {
      if (wrapper?.element) wrapper.element.style.display = 'none';
    }

    if (this.simTimeMs < this.trafficGraceUntil) return;

    const visible = this.trafficWorld.getVisibleCars({
      playerDistance: this.totalDistance || 0,
      aheadDistance: this._trafficRenderAheadDistance(),
      behindDistance: constants.segL * 0.65,
    });
    const aheadLimit = this._trafficRenderAheadDistance();
    const horizonFadeDistance = constants.segL * 4;

    for (const car of visible) {
      const projected = this._projectTrafficCar(car, startPos);
      if (!projected) continue;
      const metrics = this._trafficRenderMetrics(car, projected);
      if (!metrics) continue;

      const element = this._ensureTrafficCarElement(car);
      car.smoothRender = null;

      const ageFade = Math.max(0, Math.min(1, (this.simTimeMs - car.spawnTime) / 700));
      const horizonFade = Math.max(0, Math.min(1, (aheadLimit - car.relativeDistance) / horizonFadeDistance));
      const opacity = Math.min(ageFade, horizonFade || 1);

      element.style.display = 'block';
      element.style.background = `url('${car.type.src}') no-repeat`;
      element.style.backgroundSize = `${metrics.renderW}px ${metrics.renderH}px`;
      element.style.left = `${metrics.renderX}px`;
      element.style.top = `${metrics.renderY}px`;
      element.style.transform = 'none';
      element.style.width = `${metrics.renderW}px`;
      element.style.height = `${metrics.renderH}px`;
      element.style.zIndex = projected.zIndex;
      element.style.opacity = opacity;
      element.style.filter = 'none';

      car.wasDrawnThisFrame = true;
      car.lastRenderBounds = metrics.bounds;
      car.lastProjectionDebug = {
        rawOffset: projected.rawOffset,
        lowerOffset: projected.lowerOffset,
        t: projected.projectionT,
        laneOffset: projected.laneOffset,
        fittedLaneOffset: metrics.fittedLaneOffset,
      };
    }
  },

  _getHeroTrafficBounds() {
    // Computed each frame in drawRoad() from the hero's scale math (no DOM reflow).
    return this._heroBounds || null;
  },

  _rectsOverlap(a, b) {
    return rectsOverlap(a, b);
  },

  _debugRect(rect) {
    if (!rect) return null;
    return {
      left: Number(rect.left?.toFixed?.(1) ?? rect.left),
      top: Number(rect.top?.toFixed?.(1) ?? rect.top),
      right: Number(rect.right?.toFixed?.(1) ?? rect.right),
      bottom: Number(rect.bottom?.toFixed?.(1) ?? rect.bottom),
      width: Number(rect.width?.toFixed?.(1) ?? rect.width),
      height: Number(rect.height?.toFixed?.(1) ?? rect.height),
      centerX: Number(rect.centerX?.toFixed?.(1) ?? rect.centerX),
      centerY: Number(rect.centerY?.toFixed?.(1) ?? rect.centerY),
    };
  },

  _trafficCollisionSnapshot(car, extra = {}) {
    const debug = car?.lastCollisionDebug || {};
    return {
      frame: this.collisionDebugFrame || 0,
      simTimeMs: Number((this.simTimeMs || 0).toFixed(1)),
      playerX: Number((this.playerX || 0).toFixed(3)),
      speed: Number((this.speed || 0).toFixed(2)),
      carId: car?.id,
      lane: car?.lane,
      type: car?.type?.src?.split('/').slice(-2).join('/'),
      state: car?.state,
      spawnAgeMs: car?.spawnTime == null ? null : Number(((this.simTimeMs || 0) - car.spawnTime).toFixed(1)),
      rel: Number(car?.relativeDistance?.toFixed?.(1) ?? car?.relativeDistance),
      prevRel: Number(car?.prevRelativeDistance?.toFixed?.(1) ?? car?.prevRelativeDistance),
      laneDist: Number(debug.laneDist?.toFixed?.(3) ?? extra.laneDist ?? NaN),
      source: debug.source ?? extra.source ?? null,
      collisionSource: debug.source ?? extra.source ?? null,
      inCollisionWindow: debug.inCollisionWindow ?? extra.inCollisionWindow ?? false,
      sweptCollisionWindow: debug.sweptCollisionWindow ?? extra.sweptCollisionWindow ?? false,
      visualOverlap: debug.visualOverlap ?? false,
      visualCrash: debug.visualCrash ?? false,
      sweptOverlap: debug.sweptOverlap ?? false,
      crossedPlayerPlane: debug.crossedPlayerPlane ?? false,
      centerCrashLaneDist: Number(debug.centerCrashLaneDist?.toFixed?.(3) ?? debug.centerCrashLaneDist ?? NaN),
      sweepCrashLaneDist: Number(debug.sweepCrashLaneDist?.toFixed?.(3) ?? debug.sweepCrashLaneDist ?? NaN),
      sameLaneCrossing: debug.sameLaneCrossing ?? false,
      compressedLaneCrossing: debug.compressedLaneCrossing ?? false,
      sweptVisualOverlap: debug.sweptVisualOverlap ?? false,
      sweptVisualCrash: debug.sweptVisualCrash ?? false,
      deadCenterCrash: debug.deadCenterCrash ?? false,
      visibleAtCrossing: debug.visibleAtCrossing ?? false,
      carActive: car?.state === 'active' && car?.crashed !== true,
      fadeGraceActive: car?.spawnTime == null
        ? false
        : (this.simTimeMs || 0) - car.spawnTime < (constants.CAR_FADEIN_GRACE_MS ?? 500),
      trafficGraceActive: (this.simTimeMs || 0) < (this.trafficGraceUntil || 0),
      crashRecoveryActive: (this.simTimeMs || 0) < (this.crashRecoveryUntil || 0),
      wasDrawnThisFrame: car?.wasDrawnThisFrame === true,
      wasDrawnLastFrame: car?.wasDrawnLastFrame === true,
      renderBounds: this._debugRect(car?.lastRenderBounds),
      trafficBounds: this._debugRect(car?.lastRenderBounds),
      collisionBounds: this._debugRect(car?.lastCollisionBounds),
      trafficHitboxBounds: this._debugRect(car?.lastCollisionBounds),
      sweepRenderBounds: this._debugRect(car?.lastSweepRenderBounds),
      sweepCollisionBounds: this._debugRect(car?.lastSweepCollisionBounds),
      heroBounds: this._debugRect(this._heroBounds),
      heroHitboxBounds: this._debugRect(this._heroTrafficHitboxBounds),
      projection: car?.lastProjectionDebug || null,
      ...extra,
    };
  },

  _logTrafficCollisionDebug(type, car, extra = {}) {
    if (!this.debugCollision) return;
    const snapshot = this._trafficCollisionSnapshot(car, { type, ...extra });
    if (!Array.isArray(this.collisionDebugEvents)) this.collisionDebugEvents = [];
    this.collisionDebugEvents.push(snapshot);
    if (this.collisionDebugEvents.length > 80) this.collisionDebugEvents.shift();
    this.lastCollisionDebugSnapshot = snapshot;

    const message = `[collision-debug] ${type} car#${snapshot.carId} rel=${snapshot.rel} prev=${snapshot.prevRel} laneDist=${snapshot.laneDist} source=${snapshot.source || '-'} visual=${snapshot.visualOverlap} window=${snapshot.inCollisionWindow} swept=${snapshot.sweptOverlap}`;
    if (type === 'CRASH') console.info(message, snapshot);
    else console.warn(message, snapshot);
  },

  _trafficVisualOverlap(car) {
    if (!car.lastRenderBounds) return false;
    const hero = this._getHeroTrafficBounds();
    if (!hero) return false;
    const carBox = rectFromNormalizedHitbox(car.lastRenderBounds, car.type?.hitbox, 0.58, 0.62);
    const heroBox = rectFromNormalizedHitbox(hero, constants.HERO_TRAFFIC_HITBOX, 0.46, 0.58);
    car.lastCollisionBounds = carBox;
    this._heroTrafficHitboxBounds = heroBox;
    return this._rectsOverlap(carBox, heroBox);
  },

  _trafficSweptVisualOverlap(car) {
    const hero = this._getHeroTrafficBounds();
    if (!hero) return false;

    const projected = this._projectTrafficCarAtDistance(car, 0);
    const metrics = this._trafficRenderMetrics(car, projected);
    if (!metrics) return false;

    const carBox = rectFromNormalizedHitbox(metrics.bounds, car.type?.hitbox, 0.52, 0.58);
    const heroBox = rectFromNormalizedHitbox(hero, constants.HERO_TRAFFIC_HITBOX, 0.42, 0.52);
    car.lastSweepRenderBounds = metrics.bounds;
    car.lastSweepCollisionBounds = carBox;
    this._heroTrafficHitboxBounds = heroBox;
    return this._rectsOverlap(carBox, heroBox);
  },

  // Depth-shared lateral test: project the car to the player's plane (near-field extrapolated)
  // and compare ONLY the lateral hitbox spans. At the player's depth a car IS where the hero is,
  // so an X overlap is a collision — this is immune to the vertical lag between the fixed hero
  // sprite and the projected road rows (which otherwise lets a car slip through the player).
  // Still width-aware: narrow cars (narrower hitbox) stay squeezable.
  _trafficLateralOverlap(car) {
    const hero = this._getHeroTrafficBounds();
    if (!hero) return false;
    const projected = this._projectTrafficCarAtDistance(car, 0);
    const metrics = projected && this._trafficRenderMetrics(car, projected);
    if (!metrics) return false;
    const carBox = rectFromNormalizedHitbox(metrics.bounds, car.type?.hitbox, 0.58, 0.62);
    const heroBox = rectFromNormalizedHitbox(hero, constants.HERO_TRAFFIC_HITBOX, 0.46, 0.58);
    car.lastSweepCollisionBounds = carBox; // surface to the debug overlay
    this._heroTrafficHitboxBounds = heroBox;
    return carBox.left < heroBox.right && carBox.right > heroBox.left;
  },

  // Per-car crash gap (lane units). Wider cars need a wider berth; narrower ones can be
  // squeezed closer. Scale-independent and deterministic. Kept below PERFECT so the
  // near-miss tiers above it always remain reachable.
  _carCrashLaneDist(car) {
    const T = constants.TRAFFIC;
    const hb = car.type?.hitbox;
    const widthFrac = hb && Number.isFinite(hb.right) && Number.isFinite(hb.left)
      ? Math.max(0.1, hb.right - hb.left)
      : 0.58;
    const effWidth = (car.type?.width || 88) * widthFrac;
    const ref = T.REFERENCE_CAR_WIDTH || 51;
    const scale = T.CRASH_WIDTH_SCALE ?? 0.6;
    const adjusted = (T.CRASH ?? 0.38) * (1 + scale * (effWidth / ref - 1));
    return Math.max(0.15, Math.min(adjusted, (T.PERFECT ?? 0.65) - 0.03));
  },

  // Crash iff the closest lateral approach is within this car's crash gap while the cars are
  // longitudinally overlapping (impact band) or at the exact crossing frame.
  _trafficShouldCrash(car, closestLaneDist, inImpact, crossed) {
    const carCrash = this._carCrashLaneDist(car);
    const crash = (inImpact || crossed) && closestLaneDist <= carCrash;
    car.lastCollisionDebug = {
      source: crash ? (inImpact ? 'impact-lane' : 'cross-lane') : null,
      relativeDistance: car.relativeDistance,
      prevRelativeDistance: car.prevRelativeDistance,
      laneDist: closestLaneDist,
      closestLaneDist,
      carCrash,
      inImpact,
      crossed,
    };
    return crash;
  },

  _applyTrafficCrash(car) {
    // Shield absorbs the hit: retire the car, no speed/combo/time penalty.
    if (this._consumeShield && this._consumeShield()) {
      car.crashed = true;
      car._trafficCrashApplied = true;
      this.trafficWorld?.retireCar(car.id, this.simTimeMs);
      this._hideRetiredTrafficElements([car]);
      return;
    }

    car.crashed = true;
    car._trafficCrashApplied = true;
    this._bustDrift?.(); // a crash mid-drift loses the pending points
    this.speed = Math.min(constants.hitSpeed, this.speed);
    if (this.inGame && this.audio) this.audio.play("honk");
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.updateComboDisplay();
    this.screenShake(12, 220);
    this._showImpactMarker(car);
    this._showCrashFeedback();
    this.onCollision();
    this.trafficWorld?.retireCar(car.id, this.simTimeMs);
    this._hideRetiredTrafficElements([car]);
  },

  _showImpactMarker(car) {
    const hit = car?.lastCollisionBounds || car?.lastSweepCollisionBounds || car?.lastRenderBounds;
    const hero = this._heroTrafficHitboxBounds || this._heroBounds;
    if (!this.roadElement || !hit || !hero) return;

    const overlapLeft = Math.max(hit.left, hero.left);
    const overlapRight = Math.min(hit.right, hero.right);
    const overlapTop = Math.max(hit.top, hero.top);
    const overlapBottom = Math.min(hit.bottom, hero.bottom);
    const x = overlapRight > overlapLeft
      ? (overlapLeft + overlapRight) / 2
      : ((hit.centerX ?? (hit.left + hit.right) / 2) + (hero.centerX ?? (hero.left + hero.right) / 2)) / 2;
    const y = overlapBottom > overlapTop
      ? (overlapTop + overlapBottom) / 2
      : ((hit.centerY ?? (hit.top + hit.bottom) / 2) + (hero.centerY ?? (hero.top + hero.bottom) / 2)) / 2;

    const marker = document.createElement('div');
    marker.className = 'impact-marker';
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    this.roadElement.appendChild(marker);
    setTimeout(() => marker.remove(), 450);
  },

  _trafficWorldHits() {
    if (!this.aiEnabled || !this.trafficWorld || !this.inGame) return;
    if (this.simTimeMs < this.crashRecoveryUntil) return;
    if (this.simTimeMs < this.trafficGraceUntil) return;
    if (this.debugCollision) this.collisionDebugFrame = (this.collisionDebugFrame || 0) + 1;

    const T = constants.TRAFFIC;
    const collisionAhead = constants.segL * (T.COLLISION_AHEAD_SEGMENTS ?? 0.9);
    const collisionBehind = -constants.segL * (T.COLLISION_BEHIND_SEGMENTS ?? 0.7);
    const impactBand = constants.segL * (T.IMPACT_BAND_SEGMENTS ?? 0.5);

    for (const car of this.cars || []) {
      if (car.state !== 'active' || car.crashed) continue;
      const rel = car.relativeDistance;
      const prev = car.prevRelativeDistance;
      if (!Number.isFinite(rel) || !Number.isFinite(prev)) continue;

      // Reset the closest-approach tracker while the car is still ahead of the window, so
      // each pass is measured fresh.
      if (rel > collisionAhead) car._passMinLaneDist = Infinity;

      const laneDist = Math.abs(this.playerX - car.lane);
      const crossed = prev > 0 && rel <= 0;
      const inWindow = rel <= collisionAhead && rel >= collisionBehind;
      if (!inWindow && !crossed) continue;

      const fadeGraceMs = constants.CAR_FADEIN_GRACE_MS ?? 500;
      if (car.spawnTime != null && this.simTimeMs - car.spawnTime < fadeGraceMs) {
        if (this.debugCollision && crossed) {
          this._logTrafficCollisionDebug('SKIP_FADE_GRACE', car, { laneDist, inWindow, crossed, fadeGraceMs });
        }
        continue;
      }

      // Track the closest lateral gap during the pass for near-miss tiering (proximity
      // scoring). The CRASH decision itself is pixel-accurate (visual overlap) below.
      const inImpact = Math.abs(rel) <= impactBand;
      if (inImpact || crossed) {
        car._passMinLaneDist = Math.min(car._passMinLaneDist ?? Infinity, laneDist);
      }
      const closest = Number.isFinite(car._passMinLaneDist) ? car._passMinLaneDist : laneDist;

      // Pixel-accurate crash: the rendered hero hitbox rect overlaps the car's hitbox rect
      // this frame (what you see is what you hit). Near the player's plane (within the impact
      // band or at the crossing) fall back to the depth-shared lateral test, which guarantees a
      // same-lane car can't slip through even when the projection's Y lags the fixed hero
      // sprite or a fast car tunnels between frames. All rects come from projection math (no
      // DOM reflow), so the outcome stays deterministic.
      const visualCrash = this._trafficVisualOverlap(car)
        || ((crossed || inImpact) && this._trafficLateralOverlap(car));
      if (visualCrash) {
        if (!car._trafficCrashApplied) {
          this._logTrafficCollisionDebug('CRASH', car, { laneDist, closest, source: 'visual-overlap' });
          this._applyTrafficCrash(car);
        }
        continue;
      }

      // Clean pass: score the near-miss tier by the closest gap, once, at the crossing.
      if (!car.passed && crossed) {
        let tier = null;
        if (closest <= T.PERFECT) tier = 'PERFECT';
        else if (closest <= T.CLOSE) tier = 'CLOSE';
        else if (closest <= T.NICE) tier = 'NICE';
        if (tier) {
          this._logTrafficCollisionDebug(`PASS_${tier}`, car, { laneDist, closest });
          this.trafficWorld.recordPass(car.id, tier);
          this._scoreNearMiss(car, 0, tier, tier === 'PERFECT' ? 4 : 0, tier === 'PERFECT' ? 80 : 0);
        } else {
          this._logTrafficCollisionDebug('PASS_WIDE', car, { laneDist, closest });
          this.trafficWorld.recordPass(car.id, 'WIDE');
        }
      }
    }
  },


  /**
   * After a crash: move struck car far ahead + reset every other car's flags so traffic
   * doesn't stay in a broken state (wide-cleared / passed pile-up on same row).
   */
  _trafficRecoverAfterCrash(hitCar, anchorSeg) {
    const N = constants.N;
    const anchor = ((anchorSeg % N) + N) % N;
    const vehicles = ASSETS.IMAGE.VEHICLES;
    // Spawn well ahead with min separation so car fades in at horizon, no wall clustering
    let pos = null;
    for (const ahead of [constants.drawDistance + 25, constants.drawDistance + 35, constants.drawDistance + 18]) {
      const testPos = (anchor + ahead) % N;
      if (this._isSegmentClear(testPos, hitCar.id)) { pos = testPos; break; }
    }
    hitCar.pos = pos != null ? pos : (anchor + constants.drawDistance + 25) % N;
    hitCar.lane = this._pickLaneForNewCar(hitCar.pos, {
      avoidPlayerLane: true,
      excludeCarId: hitCar.id
    });
    hitCar.type = this._pickRandom(vehicles);
    hitCar.passed = false;
    hitCar.trafficWideCleared = false;
    hitCar._trafficCrashApplied = false;
    hitCar.spawnTime = this.simTimeMs;

    // Only mark cars in actual collision rows (playerRow ±1) — prevents chain crash without
    // poisoning cars behind us that we never process (which would block respawn forever)
    const playerRow = anchor;
    const collisionRows = new Set([
      playerRow,
      (playerRow + 1) % N,
      (playerRow - 1 + N) % N
    ]);
    for (const c of this.cars) {
      if (c === hitCar) continue;
      const cSeg = ((Math.floor(c.pos) % N) + N) % N;
      if (collisionRows.has(cSeg)) {
        c._trafficCrashApplied = true; // Prevent chain crash next frame
      } else {
        c.passed = false;
        c.trafficWideCleared = false;
        c._trafficCrashApplied = false;
      }
    }
  },

  /**
   * Check if segment has enough clearance from all cars (prevents traffic "wall" clustering).
   * @param {number} segment - Segment index (0..N-1)
   * @param {number} excludeCarId - Optional car ID to exclude (e.g. car being respawned)
   * @returns {boolean}
   */
  _isSegmentClear(segment, excludeCarId = null) {
    const N = constants.N;
    const minSep = constants.MIN_TRAFFIC_SEGMENT_SEP || 12;
    for (const c of this.cars || []) {
      if (excludeCarId != null && c.id === excludeCarId) continue;
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let dist = Math.abs(cPos - segment);
      if (dist > N / 2) dist = N - dist;
      if (dist < minSep) return false;
    }
    return true;
  },

  _getPlayerLane() {
    const th = constants.PLAYER_LANE_THRESHOLD ?? 0.38;
    if (this.playerX > th) return constants.LANE.C;
    if (this.playerX < -th) return constants.LANE.A;
    return constants.LANE.B;
  },

  _segmentDistance(a, b) {
    const N = constants.N;
    let dist = Math.abs((((a % N) + N) % N) - (((b % N) + N) % N));
    if (dist > N / 2) dist = N - dist;
    return dist;
  },

  _laneCountsNearSegment(targetSegment, radius, excludeCarId = null) {
    const counts = {
      [constants.LANE.A]: 0,
      [constants.LANE.B]: 0,
      [constants.LANE.C]: 0
    };

    for (const car of this.cars || []) {
      if (excludeCarId != null && car.id === excludeCarId) continue;
      const carSeg = ((Math.floor(car.pos) % constants.N) + constants.N) % constants.N;
      if (this._segmentDistance(carSeg, targetSegment) <= radius && counts[car.lane] != null) {
        counts[car.lane]++;
      }
    }

    return counts;
  },

  _wouldCreateLaneWall(targetSegment, lane, excludeCarId = null) {
    const radius = constants.TRAFFIC_LANE_WALL_RADIUS ?? 6;
    const lanes = new Set([lane]);

    for (const car of this.cars || []) {
      if (excludeCarId != null && car.id === excludeCarId) continue;
      const carSeg = ((Math.floor(car.pos) % constants.N) + constants.N) % constants.N;
      if (this._segmentDistance(carSeg, targetSegment) <= radius) {
        lanes.add(car.lane);
      }
    }

    return lanes.has(constants.LANE.A) && lanes.has(constants.LANE.B) && lanes.has(constants.LANE.C);
  },

  /**
   * Pick a lane for a new car while avoiding local three-lane walls.
   * @param {number} targetSegment - Segment index (0..N-1) for the new car
   * @param {Object} options
   * @returns {number} Lane value (LANE.A, B, or C)
   */
  _pickLaneForNewCar(targetSegment, options = {}) {
    const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
    const nearbyRadius = options.nearbyRadius ?? 25;
    const excludeCarId = options.excludeCarId ?? null;
    const laneCounts = this._laneCountsNearSegment(targetSegment, nearbyRadius, excludeCarId);

    let candidates = allLanes.filter(
      lane => !this._wouldCreateLaneWall(targetSegment, lane, excludeCarId)
    );
    if (candidates.length === 0) candidates = allLanes.slice();

    if (options.avoidPlayerLane) {
      const playerLane = this._getPlayerLane();
      const nonPlayer = candidates.filter(lane => lane !== playerLane);
      if (nonPlayer.length > 0) candidates = nonPlayer;
    }

    const minCount = Math.min(...candidates.map(lane => laneCounts[lane]));
    const leastUsed = candidates.filter(lane => laneCounts[lane] === minCount);

    return this._pickRandom(leastUsed);
  },

  _trafficRespawn(playerSeg) {
    if (!this.aiEnabled || !Array.isArray(this.cars) || !this.inGame) return;
    if (this.simTimeMs < this.trafficGraceUntil) return;
    if (this.simTimeMs < this.postCrashRespawnGraceUntil) return;
    if (constants.DEBUG_DISABLE_RESPAWN) return;
    const respawnInterval = constants.TRAFFIC_RESPAWN_INTERVAL_MS ?? 900;
    if (this.simTimeMs - this.lastTrafficRespawnAt < respawnInterval) return;
    const N = constants.N;
    const playerSegNorm = ((playerSeg % N) + N) % N;

    // Don't respawn if we already have plenty of cars ahead — reduces snap frequency
    let carsAhead = 0;
    for (const c of this.cars) {
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let d = cPos - playerSegNorm;
      if (d < -N / 2) d += N;
      if (d > N / 2) d -= N;
      if (d > 0) carsAhead++;
    }
    if (carsAhead >= 3) return;

    // Cap 1 respawn per frame to avoid bunching when multiple cars fall behind
    let respawnedThisFrame = 0;
    const RESPAWN_COOLDOWN_MS = 8000; // Mario Kart: same car can't reappear for 8s

    for (const car of this.cars) {
      if (respawnedThisFrame >= 1) break;

      const carPosInt = ((Math.floor(car.pos) % N) + N) % N;
      let distanceFromPlayer = carPosInt - playerSegNorm;
      if (distanceFromPlayer < -N / 2) distanceFromPlayer += N;
      if (distanceFromPlayer > N / 2) distanceFromPlayer -= N;

      // Mario Kart style: car must be fully behind AND gone for RESPAWN_DELAY_MS before reappearing
      // (prevents "same car I just passed" teleport feel)
      // Note: distance calculation handles track wrap-around correctly via normalization above
      const minBehind = -(Math.floor(constants.N / 2) - 1);
      if (distanceFromPlayer <= minBehind) {
        if (car.wentBehindAt == null) car.wentBehindAt = this.simTimeMs;
      } else {
        // Reset when car is ahead again (intentional: prevents respawn if car wrapped back ahead)
        car.wentBehindAt = null;
      }
      const delayMs = constants.RESPAWN_DELAY_MS ?? 4000;
      const canRespawn =
        distanceFromPlayer <= minBehind &&
        car.wentBehindAt != null &&
        this.simTimeMs - car.wentBehindAt > delayMs &&
        (car.spawnTime == null || this.simTimeMs - car.spawnTime > RESPAWN_COOLDOWN_MS);

      if (canRespawn) {
        const vehicles = ASSETS.IMAGE.VEHICLES;
        if (!Array.isArray(vehicles) || vehicles.length === 0) continue;
        const getRandomVehicle = () => this._pickRandom(vehicles);
        // Scale respawn distances to track size (N) to prevent wrap-around bugs on mobile
        const minAhead = Math.min(constants.RESPAWN_MIN_AHEAD ?? 38, Math.floor(N * 0.6));
        const maxAhead = Math.min(constants.RESPAWN_MAX_AHEAD ?? 58, Math.floor(N * 0.8));
        const baseOffset = minAhead + this._randomInt(Math.max(1, maxAhead - minAhead));
        const respawnDistances = [baseOffset, baseOffset + 6, baseOffset + 12];
        let bestPos = null;
        let bestLane = null;
        let minConflicts = Infinity;

        // Pre-filter valid test positions and collect nearby cars in a single pass
        const validTestPositions = [];
        for (let i = 0; i < respawnDistances.length; i++) {
          const testPos = (playerSegNorm + respawnDistances[i]) % N;
          // Validate: testPos should be AHEAD of player (circular distance)
          let aheadDist = testPos - playerSegNorm;
          if (aheadDist < -N / 2) aheadDist += N;
          if (aheadDist > N / 2) aheadDist -= N;
          if (aheadDist < minAhead * 0.5) continue; // Skip if wrapped behind player
          if (!this._isSegmentClear(testPos, car.id)) continue; // Enforce min separation

          validTestPositions.push({
            pos: testPos,
            nearbyCars: []
          });
        }

        if (validTestPositions.length > 0) {
          // Single pass over cars to find nearby ones for all valid test positions
          for (let i = 0; i < this.cars.length; i++) {
            const c = this.cars[i];
            if (c.id === car.id) continue;
            
            const cPos = (Math.floor(c.pos) % N + N) % N;

            for (let j = 0; j < validTestPositions.length; j++) {
              const tp = validTestPositions[j];
              let dist = Math.abs(cPos - tp.pos);
              if (dist > N / 2) dist = N - dist;
              if (dist < 25) {
                tp.nearbyCars.push(c);
              }
            }
          }

          for (let i = 0; i < validTestPositions.length; i++) {
            const { pos: testPos, nearbyCars } = validTestPositions[i];
            
            if (nearbyCars.length < minConflicts) {
              minConflicts = nearbyCars.length;
              bestPos = testPos;
              bestLane = this._pickLaneForNewCar(testPos, {
                avoidPlayerLane: true,
                excludeCarId: car.id
              });
            }
          }
        }

        if (bestPos === null) {
          for (const d of [48, 40, 56, 35]) {
            const fallback = (playerSegNorm + d) % N;
            if (this._isSegmentClear(fallback, car.id)) { bestPos = fallback; break; }
          }
          if (bestPos === null) bestPos = (playerSegNorm + 48) % N;
        }
        if (bestLane === null) {
          bestLane = this._pickLaneForNewCar(bestPos, {
            avoidPlayerLane: true,
            excludeCarId: car.id
          });
        }
        car.pos = bestPos;
        car.lane = bestLane;
        car.type = getRandomVehicle();
        car.passed = false;
        car.trafficWideCleared = false;
        car._trafficCrashApplied = false;
        car.spawnTime = this.simTimeMs;
        car.wentBehindAt = null; // Reset for next cycle
        this.lastTrafficRespawnAt = this.simTimeMs;
        respawnedThisFrame++;
      }
    }
  },
};
