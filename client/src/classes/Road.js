import { TRACK_SEGMENTS } from '../config/tracks.js';
import { ASSETS } from '../config/assets.js';
import * as constants from '../config/constants.js';

/**
 * Road class - Manages segment-based track with checkpoints
 * Based on the Outrun project's proven architecture
 */
export class Road {
  constructor() {
    this.segments = [];
    this.length = 0;
    this.checkpoints = [];
    this.checkpointPositions = [];
    this.finishLine = null;
  }

  /**
   * Add a segment to the road
   * @param {Object} segmentDef - Segment definition from TRACK_SEGMENTS
   * @param {number} segmentLength - Length of this segment instance
   * @param {Object} options - Additional options (special objects, etc.)
   */
  addSegment(segmentDef, segmentLength, options = {}) {
    const segment = {
      index: this.segments.length,
      type: segmentDef.type,
      length: segmentLength,
      startZ: this.length,
      endZ: this.length + segmentLength,
      curve: segmentDef.curve,
      height: segmentDef.height,
      special: options.special || null,
      isCheckpoint: options.isCheckpoint || false,
      isFinishLine: options.isFinishLine || false
    };

    this.segments.push(segment);
    this.length += segmentLength;

    // Track checkpoints and finish line
    if (segment.isCheckpoint) {
      this.checkpoints.push(segment);
    }
    if (segment.isFinishLine) {
      this.finishLine = segment;
    }

    return segment;
  }

  /**
   * Find the segment at a given position
   * @param {number} z - Position along the track
   * @returns {Object|null} The segment at this position
   */
  findSegment(z) {
    // Normalize position to track length
    const normalizedZ = ((z % this.length) + this.length) % this.length;
    
    // Binary search for efficiency with large track counts
    let left = 0;
    let right = this.segments.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const segment = this.segments[mid];
      
      if (normalizedZ >= segment.startZ && normalizedZ < segment.endZ) {
        return segment;
      } else if (normalizedZ < segment.startZ) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    // Fallback to last segment if we're at the very end
    return this.segments[this.segments.length - 1] || null;
  }

  /**
   * Get curve value at a specific position
   * @param {number} z - Position along the track
   * @returns {number} Curve value at this position
   */
  getCurve(z) {
    const segment = this.findSegment(z);
    if (!segment || !segment.curve) return 0;
    
    const localZ = z - segment.startZ;
    return segment.curve(localZ);
  }

  /**
   * Get height value at a specific position
   * @param {number} z - Position along the track
   * @returns {number} Height value at this position
   */
  getHeight(z) {
    const segment = this.findSegment(z);
    if (!segment || !segment.height) return 0;
    
    const localZ = z - segment.startZ;
    return segment.height(localZ);
  }

  /**
   * Check if position is at a checkpoint
   * @param {number} z - Position along the track
   * @param {number} tolerance - Distance tolerance for checkpoint detection
   * @returns {Object|null} Checkpoint segment if found
   */
  checkCheckpoint(z, tolerance = 50) {
    // Normalize once for position-based checks
    const normalizedZ = ((z % this.length) + this.length) % this.length;

    // Prefer intelligent, position-based checkpoints if available
    if (this.checkpointPositions && this.checkpointPositions.length > 0) {
      for (let i = 0; i < this.checkpointPositions.length; i++) {
        const cp = this.checkpointPositions[i];
        const directDistance = Math.abs(normalizedZ - cp);
        const wrapDistance = this.length - directDistance;
        const distance = Math.min(directDistance, wrapDistance);
        if (distance <= tolerance) {
          return { index: i, position: cp };
        }
      }
    }

    // Fallback to segment-flagged checkpoints if present
    const segment = this.findSegment(z);
    if (segment && segment.isCheckpoint) {
      const localZ = z - segment.startZ;
      if (localZ <= tolerance) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Check if position is at the finish line
   * @param {number} z - Position along the track
   * @param {number} tolerance - Distance tolerance for finish line detection
   * @returns {boolean} True if at finish line
   */
  checkFinishLine(z, tolerance = 50) {
    if (!this.finishLine) {
      console.log('No finish line found in road!');
      return false;
    }
    
    const normalizedZ = ((z % this.length) + this.length) % this.length;
    const finishZ = this.finishLine.startZ;
    
    // Calculate distance considering track wrapping
    const directDistance = Math.abs(normalizedZ - finishZ);
    const wrapDistance = this.length - directDistance;
    const distance = Math.min(directDistance, wrapDistance);
    
    // Debug logging
    if (distance <= tolerance * 2) { // Log when we're getting close
      console.log(`Finish line check: normalizedZ=${normalizedZ.toFixed(0)}, finishZ=${finishZ}, directDist=${directDistance.toFixed(0)}, wrapDist=${wrapDistance.toFixed(0)}, finalDist=${distance.toFixed(0)}, tolerance=${tolerance}`);
    }
    
    // Check if we're close to the finish line
    return distance <= tolerance;
  }

  /**
   * Get the special object at a position (finish line, etc.)
   * @param {number} z - Position along the track
   * @returns {Object|null} Special object if found
   */
  getSpecial(z) {
    const segment = this.findSegment(z);

    // If we're in the finish segment, always return the finish sprite
    // This keeps the banner visible stably while the finish segment is in view
    if (segment && segment.isFinishLine) {
      return this.finishLine ? this.finishLine.special : null;
    }

    // Otherwise, show any non-finish specials
    return segment && segment.special && segment.special !== ASSETS.IMAGE.FINISH ? segment.special : null;
  }

  /**
   * Calculate lap progress (0-1)
   * @param {number} z - Current position
   * @returns {number} Progress through current lap
   */
  getLapProgress(z) {
    const normalizedZ = ((z % this.length) + this.length) % this.length;
    return normalizedZ / this.length;
  }

  /**
   * Get total number of laps completed
   * @param {number} z - Current position
   * @returns {number} Number of completed laps
   */
  getCompletedLaps(z) {
    return Math.floor(z / this.length);
  }

  /**
   * Reset the road (clear all segments)
   */
  reset() {
    this.segments = [];
    this.length = 0;
    this.checkpoints = [];
    this.checkpointPositions = [];
    this.finishLine = null;
  }

  /**
   * Build a sample track for testing
   */
  buildSampleTrack() {
    this.reset();
    
    // Start with finish line
    this.addSegment(
      TRACK_SEGMENTS.STRAIGHT(100),
      100,
      { special: ASSETS.IMAGE.FINISH, isFinishLine: true }
    );
    
    // Add various segments
    this.addSegment(TRACK_SEGMENTS.STRAIGHT(500), 500);
    this.addSegment(TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(400), 400);
    this.addSegment(TRACK_SEGMENTS.STRAIGHT(300), 300);
    this.addSegment(TRACK_SEGMENTS.CURVE_GENTLE_LEFT(400), 400);
    this.addSegment(TRACK_SEGMENTS.STRAIGHT(300), 300);
    
    // Add checkpoint
    this.addSegment(
      TRACK_SEGMENTS.STRAIGHT(100),
      100,
      { isCheckpoint: true }
    );
    
    this.addSegment(TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(600), 600);
    this.addSegment(TRACK_SEGMENTS.STRAIGHT(400), 400);
    
    console.log(`Road built with ${this.segments.length} segments, total length: ${this.length}`);
    console.log(`Checkpoints: ${this.checkpoints.length}, Finish line: ${this.finishLine ? 'Yes' : 'No'}`);
  }

  /**
   * Set intelligent checkpoints by absolute distance positions
   * @param {number[]} positions - distances along the track
   */
  setCheckpoints(positions = []) {
    this.checkpointPositions = Array.isArray(positions) ? positions.slice() : [];
  }
}