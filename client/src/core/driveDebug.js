import * as constants from '../config/constants.js';

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function compactRect(rect) {
  if (!rect) return null;
  return {
    left: Number(finiteNumber(rect.left).toFixed(1)),
    top: Number(finiteNumber(rect.top).toFixed(1)),
    right: Number(finiteNumber(rect.right).toFixed(1)),
    bottom: Number(finiteNumber(rect.bottom).toFixed(1)),
    width: Number(finiteNumber(rect.width, rect.right - rect.left).toFixed(1)),
    height: Number(finiteNumber(rect.height, rect.bottom - rect.top).toFixed(1)),
  };
}

function setRect(element, rect) {
  if (!element || !rect) return;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${Math.max(1, rect.right - rect.left)}px`;
  element.style.height = `${Math.max(1, rect.bottom - rect.top)}px`;
}

export const DriveDebugMixin = {
  _initDriveDebug() {
    if (!this.debugDrive || this.driveDebugOverlay) return;
    const root = document.createElement('div');
    root.id = 'drive-debug-overlay';
    root.innerHTML = `
      <div class="drive-debug-panel"></div>
      <div class="drive-debug-layer" data-layer="lanes"></div>
      <div class="drive-debug-layer" data-layer="windows"></div>
      <div class="drive-debug-layer" data-layer="boxes"></div>
    `;
    this.gameElement?.appendChild(root);
    this.driveDebugOverlay = root;
    this.driveDebugPanel = root.querySelector('.drive-debug-panel');
    this.driveDebugLayers = {
      lanes: root.querySelector('[data-layer="lanes"]'),
      windows: root.querySelector('[data-layer="windows"]'),
      boxes: root.querySelector('[data-layer="boxes"]'),
    };
  },

  _buildDriveDebugSnapshot() {
    const T = constants.TRAFFIC;
    const activeCars = (this.cars || [])
      .filter((car) => car && car.state === 'active' && !car.crashed && Number.isFinite(car.relativeDistance))
      .sort((a, b) => Math.abs(a.relativeDistance) - Math.abs(b.relativeDistance));
    const nearest = activeCars.slice(0, 8).map((car) => ({
      id: car.id,
      lane: car.lane,
      relativeDistance: Number(car.relativeDistance.toFixed(1)),
      prevRelativeDistance: Number((car.prevRelativeDistance ?? car.relativeDistance).toFixed(1)),
      laneDistance: Number(Math.abs((this.playerX || 0) - car.lane).toFixed(3)),
      state: car.state,
      passed: car.passed === true,
      spawnAgeMs: car.spawnTime == null ? null : Number(((this.simTimeMs || 0) - car.spawnTime).toFixed(1)),
      renderBounds: compactRect(car.lastRenderBounds),
      collisionBounds: compactRect(car.lastCollisionBounds),
      sweepBounds: compactRect(car.lastSweepCollisionBounds),
      decision: car.lastCollisionDebug?.source || null,
    }));

    const nearestProjectionDistance = Array.isArray(this.trafficProjectionRows) && this.trafficProjectionRows.length > 0
      ? this.trafficProjectionRows.reduce((best, row) => (
          Math.abs(row.relativeDistance) < Math.abs(best) ? row.relativeDistance : best
        ), this.trafficProjectionRows[0].relativeDistance)
      : 0;
    const laneProjectionDistance = this._sampleTrafficProjection?.(0)
      ? 0
      : nearestProjectionDistance;

    const laneCenters = Object.values(constants.LANE).map((lane) => {
      const projected = this._projectTrafficCarAtDistance?.({ lane }, laneProjectionDistance);
      return {
        lane,
        x: projected ? Number(projected.laneCenterX.toFixed(1)) : null,
      };
    });

    const windowRows = [
      { name: 'ahead', distance: constants.segL * (T.COLLISION_AHEAD_SEGMENTS ?? 0.9) },
      { name: 'player', distance: 0 },
      { name: 'behind', distance: -constants.segL * (T.COLLISION_BEHIND_SEGMENTS ?? 0.7) },
    ].map((row) => {
      const projected = this._sampleTrafficProjection?.(row.distance)
        || (row.name === 'player' ? this._sampleTrafficProjection?.(nearestProjectionDistance) : null);
      return {
        ...row,
        y: projected ? Number(projected.Y.toFixed(1)) : null,
      };
    });

    const pickups = (this.pickups || [])
      .filter((p) => p && !p.collected && p.lastCollisionBounds)
      .map((p) => ({ id: p.id, typeId: p.typeId, collisionBounds: compactRect(p.lastCollisionBounds) }));

    return {
      enabled: this.debugDrive === true,
      seed: this.runSeed,
      simTimeMs: Number((this.simTimeMs || 0).toFixed(1)),
      playerX: Number((this.playerX || 0).toFixed(3)),
      speed: Number((this.speed || 0).toFixed(2)),
      heroBounds: compactRect(this._heroBounds),
      heroHitboxBounds: compactRect(this._heroTrafficHitboxBounds),
      nearest,
      pickups,
      laneCenters,
      windowRows,
      lastEvent: this.lastCollisionDebugSnapshot || null,
      trafficGraceActive: this.simTimeMs < this.trafficGraceUntil,
      crashRecoveryActive: this.simTimeMs < this.crashRecoveryUntil,
    };
  },

  _updateDriveDebugOverlay() {
    if (!this.debugDrive) return;
    this._initDriveDebug();
    if (!this.driveDebugOverlay) return;

    const snapshot = this._buildDriveDebugSnapshot();
    this.lastDriveDebugSnapshot = snapshot;
    this._renderDriveDebugOverlay(snapshot);
  },

  _renderDriveDebugOverlay(snapshot) {
    if (!snapshot || !this.driveDebugOverlay) return;
    const { boxes, lanes, windows } = this.driveDebugLayers || {};
    if (boxes) boxes.replaceChildren();
    if (lanes) lanes.replaceChildren();
    if (windows) windows.replaceChildren();

    const makeBox = (className, rect, label = '') => {
      if (!boxes || !rect) return;
      const el = document.createElement('div');
      el.className = className;
      setRect(el, rect);
      if (label) el.dataset.label = label;
      boxes.appendChild(el);
    };

    makeBox('drive-debug-box hero-box', snapshot.heroHitboxBounds || snapshot.heroBounds, 'hero');
    for (const car of snapshot.nearest) {
      makeBox('drive-debug-box traffic-box', car.collisionBounds || car.renderBounds, `#${car.id}`);
      if (car.sweepBounds) makeBox('drive-debug-box sweep-box', car.sweepBounds, `sweep #${car.id}`);
    }
    for (const pickup of snapshot.pickups || []) {
      makeBox('drive-debug-box pickup-box', pickup.collisionBounds, pickup.typeId);
    }

    if (lanes) {
      for (const lane of snapshot.laneCenters) {
        if (lane.x == null) continue;
        const el = document.createElement('div');
        el.className = 'drive-debug-lane';
        el.style.left = `${lane.x}px`;
        el.dataset.label = String(lane.lane);
        lanes.appendChild(el);
      }
    }

    if (windows) {
      for (const row of snapshot.windowRows) {
        if (row.y == null) continue;
        const el = document.createElement('div');
        el.className = `drive-debug-window ${row.name}`;
        el.style.top = `${row.y}px`;
        el.dataset.label = row.name;
        windows.appendChild(el);
      }
    }

    if (this.driveDebugPanel) {
      const nearest = snapshot.nearest[0];
      const last = snapshot.lastEvent;
      this.driveDebugPanel.textContent = [
        `seed ${snapshot.seed}`,
        `speed ${snapshot.speed.toFixed(1)} x ${snapshot.playerX.toFixed(3)}`,
        nearest ? `near #${nearest.id} rel ${nearest.relativeDistance} lane ${nearest.laneDistance}` : 'near none',
        last ? `last ${last.type || '-'} ${last.source || last.collisionSource || '-'}` : 'last none',
        snapshot.trafficGraceActive ? 'traffic grace' : '',
        snapshot.crashRecoveryActive ? 'recovery' : '',
      ].filter(Boolean).join('\n');
    }
  },
};
