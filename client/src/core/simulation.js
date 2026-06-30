import * as constants from '../config/constants.js';
import { terrainUndulation } from './mathUtils.js';

// Per-frame simulation: map curve/height sampling onto a line, track-wrap length,
// and the core game-state update (checkpoints, finish line, traffic step, passive
// scoring). Mixed into GameEngine.prototype; runs with `this` bound to the engine.
// Note: the Arcade subclass (game.js) overrides updateGameState and calls super.
export const SimulationMixin = {
  applyMapToLine(line, worldZ, lineIndex = 0) {
    // Use new Road system for curve and height calculations
    const normalizedZ = ((worldZ % this.road.length) + this.road.length) % this.road.length;
    
    // Cache the last applied values to prevent unnecessary recalculation
    if (line.lastAppliedZ === normalizedZ) {
      return; // No need to recalculate if position hasn't changed
    }
    line.lastAppliedZ = normalizedZ;
    
    const rawCurve = this.road.getCurve(normalizedZ);
    const rawHeight = this.road.getHeight(normalizedZ);
    const CURVE_DEADZONE = 0.5;
    const CURVE_CLAMP = 160;
    const visibleCurve = Math.abs(rawCurve) < CURVE_DEADZONE ? 0 : rawCurve;

    // Rolling terrain so straights aren't dead flat. Added to the VISUAL height (line.y)
    // only — line.rawHeight stays segment-only so scenery elevation logic (isHighElevation,
    // desert rim, etc.) keys off the intentional hills, not the gentle rolls.
    const undulation = terrainUndulation(normalizedZ, this.road.length, constants.TERRAIN_UNDULATION);

    line.rawCurve = rawCurve;
    line.rawHeight = rawHeight;
    line.curve = Math.max(-CURVE_CLAMP, Math.min(CURVE_CLAMP, visibleCurve));
    line.y = rawHeight + undulation;

    // Get special objects from Road system
    const special = this.road.getSpecial(normalizedZ);
    // Always set the special for this line; finish rendering is capped to once per frame
    line.special = special || null;
  },


  /**
   * Single source of truth for position wrapping. When road exists, use road.length
   * so outer pos and inner updateGameState stay in sync (avoids startPos vs rowPhys drift).
   */
  _getTrackWrapLength() {
    if (this.road && this.road.length > 0 && !isNaN(this.road.length)) {
      return this.road.length;
    }
    return this.map?.trackLength || constants.mapLength;
  },


  updateGameState(step, startPos, endPos) {
    // Update stopwatch
    this.stopwatch.update();
    
    // Validate current state before calculations
    if (isNaN(this.pos) || isNaN(this.speed) || isNaN(step) || isNaN(this.totalDistance)) {
      console.warn('Invalid state in updateGameState:', {
        pos: this.pos,
        speed: this.speed,
        step: step,
        totalDistance: this.totalDistance
      });
      return; // Skip this frame
    }
    
    // pos already advanced in update(); use current pos for checkpoint/finish (no double-add)
    const newPos = this.pos;
    const newTotalDistance = this.totalDistance + (this.lastDistanceDelta || 0);
    
    // Check for checkpoint detection
    const checkpoint = this.road && this.road.checkCheckpoint(newPos, 100);
    if (checkpoint) {
      const isNewCheckpoint = this.stopwatch.passCheckpoint(checkpoint);
      if (isNewCheckpoint) {
        const cpLabel = checkpoint.type || `#${checkpoint.index}`;
        console.log(`Checkpoint passed: ${cpLabel} at position ${newPos.toFixed(0)}`);
      }
    }
    
    // Check for finish line crossing event (not just proximity)
    if (!this.finishCrossed && this.road && this.road.finishLine) {
      const finishZ = this.road.finishLine.startZ;
      const oldNorm = ((this.lastValidPos % this.road.length) + this.road.length) % this.road.length;
      const newNorm = ((newPos % this.road.length) + this.road.length) % this.road.length;

      // Crossing forward: either we pass finishZ within the same lap, or we wrap and pass it
      const crossedSameLap = oldNorm <= finishZ && newNorm >= finishZ;
      const wrapped = oldNorm > newNorm; // we wrapped around track length
      const crossedOnWrap = wrapped && (finishZ >= oldNorm || finishZ <= newNorm);

      if ((crossedSameLap || crossedOnWrap) && this.speed > 0) {
        const lapData = this.stopwatch.completeLap();
        this.currentLap = lapData ? lapData.lapNumber : this.currentLap;
        this.shouldUpdateSkyNextGame = true;
        console.log(`Finish crossed! ${lapData ? lapData.formattedLapTime : ''}`);
        // Score reward on finish
        this.scoreVal += 1500;
        if (lapData && lapData.isBestLap) {
          this.scoreVal += 500;
        }
        // Gate duplicate triggers and defer progression to checkLevelCompletion
        this.finishCrossed = true;
      }
    }
    
    // Update total distance (pos already updated in update())
    this.totalDistance = newTotalDistance;

    if (this.inGame && this.aiEnabled && this.trafficWorld) {
      this.trafficWorld.setTargetCount(this._getTrafficTargetCount());
      const trafficEvents = this.trafficWorld.update({
        step,
        simTimeMs: this.simTimeMs,
        playerDistance: this.totalDistance,
        playerSpeed: this.speed,
        roadLength: this.road?.length || 0,
        allowSpawn:
          this.simTimeMs >= this.trafficGraceUntil &&
          this.simTimeMs >= this.postCrashRespawnGraceUntil,
      });
      this.cars = this.trafficWorld.cars;
      this._hideRetiredTrafficElements(trafficEvents.retired);
    }

    // Road pickups: spawn ahead, advance, and collect on a close pass.
    this._updatePickups?.(step);

    // Passive scoring: token trickle so score isn't completely static between near-misses
    // Near-miss events are the primary score source (~90%+ of total)
    this.scoreVal += Math.floor(this.speed / 80);
    this.scoreElement.innerHTML = this.scoreVal.toString().padStart(6, "0");
    
    // Update combo system
    this.updateComboSystem(step);

    // Check for level completion
    this.checkLevelCompletion();

    // Boost timer/cooldown decremented in update() — single source of truth

  },
};
