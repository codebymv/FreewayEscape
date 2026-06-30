// Live track authoring uses segment functions: each segment defines a smooth
// curve and elevation profile over its local distance.

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smootherStep = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const smoothPulse = (value) => {
  const s = Math.sin(clamp01(value) * Math.PI);
  return s * s;
};

export const TRACK_SEGMENTS = {
  // Straight segment - no curve, flat
  STRAIGHT: (length) => ({
    type: 'straight',
    length,
    curve: () => 0,
    height: () => 0
  }),

  // Long highway sweepers with zero-slope entry/exit.
  CURVE_GENTLE_LEFT: (length, intensity = -60, variation = 0) => ({
    type: 'curve_gentle_left', 
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const variationScale = 1 + Math.sin(progress * Math.PI * 2) * variation;
      return intensity * variationScale * smoothPulse(progress);
    },
    height: () => 0
  }),

  CURVE_GENTLE_RIGHT: (length, intensity = 60, variation = 0) => ({
    type: 'curve_gentle_right',
    length, 
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const variationScale = 1 + Math.sin(progress * Math.PI * 2) * variation;
      return intensity * variationScale * smoothPulse(progress);
    },
    height: () => 0
  }),

  // Progressive curves that tighten or loosen
  CURVE_PROGRESSIVE_LEFT: (length, startIntensity = -40, endIntensity = -80) => ({
    type: 'curve_progressive_left',
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const easedProgress = smootherStep(progress);
      const intensityAtPoint = startIntensity + (endIntensity - startIntensity) * easedProgress;
      return intensityAtPoint * smoothPulse(progress);
    },
    height: () => 0
  }),

  CURVE_PROGRESSIVE_RIGHT: (length, startIntensity = 40, endIntensity = 80) => ({
    type: 'curve_progressive_right', 
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const easedProgress = smootherStep(progress);
      const intensityAtPoint = startIntensity + (endIntensity - startIntensity) * easedProgress;
      return intensityAtPoint * smoothPulse(progress);
    },
    height: () => 0
  }),

  // Natural flowing S-curves with asymmetry
  S_CURVE_NATURAL: (length, intensity = 50, asymmetry = 0.2) => ({
    type: 's_curve_natural',
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const neutralWidth = Math.max(0.12, Math.min(0.28, asymmetry));
      const firstEnd = 0.5 - neutralWidth * 0.5;
      const secondStart = 0.5 + neutralWidth * 0.5;
      if (progress < firstEnd) {
        return intensity * smoothPulse(progress / firstEnd);
      }
      if (progress > secondStart) {
        return -intensity * 0.82 * smoothPulse((progress - secondStart) / (1 - secondStart));
      }
      return 0;
    },
    height: () => 0
  }),

  // Chicane-style quick left-right combination
  CHICANE_LEFT_RIGHT: (length, intensity = 70) => ({
    type: 'chicane_left_right',
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      if (progress < 0.4) {
        // Left part
        const localProgress = progress / 0.4;
        return -intensity * Math.sin(localProgress * Math.PI);
      } else if (progress < 0.6) {
        // Transition (straight)
        return 0;
      } else {
        // Right part
        const localProgress = (progress - 0.6) / 0.4;
        return intensity * Math.sin(localProgress * Math.PI);
      }
    },
    height: () => 0
  }),

  // Hills and elevation changes
  HILL_UP: (length, maxHeight = 200) => ({
    type: 'hill_up',
    length,
    curve: () => 0,
    height: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      return maxHeight * Math.sin(progress * Math.PI); // Smooth hill
    }
  }),

  HILL_DOWN: (length, maxHeight = -200) => ({
    type: 'hill_down', 
    length,
    curve: () => 0,
    height: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      return maxHeight * Math.sin(progress * Math.PI);
    }
  }),

  // Banked turns (curve + elevation for realistic highway feel)
  BANKED_TURN_LEFT: (length, curveIntensity = -75, bankAngle = 50) => ({
    type: 'banked_turn_left',
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      return curveIntensity * Math.sin(progress * Math.PI);
    },
    height: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      return bankAngle * Math.sin(progress * Math.PI) * 0.2; // Very subtle banking
    }
  }),

  BANKED_TURN_RIGHT: (length, curveIntensity = 75, bankAngle = -50) => ({
    type: 'banked_turn_right',
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length; 
      return curveIntensity * Math.sin(progress * Math.PI);
    },
    height: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      return bankAngle * Math.sin(progress * Math.PI) * 0.2;
    }
  })
};

// Historical path authoring experiment. Kept as compatibility data only; the
// live road renderer reads TRACKS below.
export const TRACK_PATHS = {
  // Pacific Coast Highway - True highway experience with massive straightaways
  PACIFIC_COAST: {
    points: [
      // === MASSIVE HIGHWAY STRAIGHT (24km of pure speed) ===
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 6000, y: 0 },
      { x: 9000, y: 0 },
      { x: 12000, y: 0 },
      { x: 15000, y: 0 },
      { x: 18000, y: 0 },
      { x: 21000, y: 0 },
      { x: 24000, y: 0 },
      
      // === GENTLE HIGHWAY CURVE 1 (minimal steering required) ===
      { x: 26000, y: -100 },
      { x: 28000, y: -150 },
      { x: 30000, y: -150 },
      
      // === LONG STRAIGHT SECTION 2 (14km straightaway) ===
      { x: 33000, y: -150 },
      { x: 36000, y: -150 },
      { x: 39000, y: -150 },
      { x: 42000, y: -150 },
      { x: 44000, y: -150 },
      
      // === GENTLE HIGHWAY CURVE 2 (slight left to center) ===
      { x: 46000, y: -100 },
      { x: 48000, y: -50 },
      { x: 50000, y: 0 },
      
      // === FINAL STRAIGHT SECTION (10km to turnaround) ===
      { x: 53000, y: 0 },
      { x: 56000, y: 0 },
      { x: 59000, y: 0 },
      { x: 60000, y: 0 },
      
      // === WIDE HIGHWAY TURNAROUND (like a real highway interchange) ===
      { x: 61000, y: 300 },
      { x: 61500, y: 800 },
      { x: 61500, y: 1300 },
      { x: 61000, y: 1800 },
      { x: 60000, y: 2000 },
      
      // === RETURN HIGHWAY STRAIGHT (full-length return journey) ===
      { x: 59000, y: 2000 },
      { x: 56000, y: 2000 },
      { x: 53000, y: 2000 },
      { x: 50000, y: 2000 },
      { x: 48000, y: 2000 },
      { x: 46000, y: 2000 },
      { x: 44000, y: 2000 },
      { x: 42000, y: 2000 },
      { x: 39000, y: 2000 },
      { x: 36000, y: 2000 },
      { x: 33000, y: 2000 },
      { x: 30000, y: 2000 },
      { x: 28000, y: 2000 },
      { x: 26000, y: 2000 },
      { x: 24000, y: 2000 },
      { x: 21000, y: 2000 },
      { x: 18000, y: 2000 },
      { x: 15000, y: 2000 },
      { x: 12000, y: 2000 },
      { x: 9000, y: 2000 },
      { x: 6000, y: 2000 },
      { x: 3000, y: 2000 },
      
      // === START/FINISH TURNAROUND ===
      { x: 1000, y: 1700 },
      { x: 200, y: 1200 },
      { x: 0, y: 500 },
      { x: 0, y: 0 }
    ]
  }
};

// Convert track path to distance-based lookup
function createDistanceLookup(pathPoints) {
  const lookup = [];
  let totalDistance = 0;
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];
    const segmentDistance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    
    lookup.push({
      distance: totalDistance,
      point: p1,
      segmentLength: segmentDistance
    });
    
    totalDistance += segmentDistance;
  }
  
  // Add final point
  lookup.push({
    distance: totalDistance,
    point: pathPoints[pathPoints.length - 1],
    segmentLength: 0
  });
  
  return { lookup, totalDistance };
}

// Get 2D position along track path at given distance
function getPositionAtDistance(distanceLookup, distance) {
  const { lookup, totalDistance } = distanceLookup;
  
  // Wrap distance around track
  const normalizedDistance = ((distance % totalDistance) + totalDistance) % totalDistance;
  
  // Find the segment this distance falls in
  for (let i = 0; i < lookup.length - 1; i++) {
    const current = lookup[i];
    const next = lookup[i + 1];
    
    if (normalizedDistance >= current.distance && normalizedDistance <= next.distance) {
      // Interpolate between current and next point
      const segmentProgress = (normalizedDistance - current.distance) / current.segmentLength;
      
      return {
        x: current.point.x + (next.point.x - current.point.x) * segmentProgress,
        y: current.point.y + (next.point.y - current.point.y) * segmentProgress
      };
    }
  }
  
  // Fallback to last point
  return lookup[lookup.length - 1].point;
}

// Calculate curve value based on path direction changes
function getCurveFromPath(distanceLookup, distance, lookAhead = 500) {
  const currentPos = getPositionAtDistance(distanceLookup, distance);
  const futurePos = getPositionAtDistance(distanceLookup, distance + lookAhead);
  const pastPos = getPositionAtDistance(distanceLookup, distance - lookAhead);
  
  // Calculate direction vectors
  const forwardVector = { 
    x: futurePos.x - currentPos.x, 
    y: futurePos.y - currentPos.y 
  };
  const pastVector = { 
    x: currentPos.x - pastPos.x, 
    y: currentPos.y - pastPos.y 
  };
  
  // Normalize vectors to get direction only
  const forwardLength = Math.sqrt(forwardVector.x ** 2 + forwardVector.y ** 2);
  const pastLength = Math.sqrt(pastVector.x ** 2 + pastVector.y ** 2);
  
  if (forwardLength < 0.1 || pastLength < 0.1) return 0; // Avoid division by zero
  
  const forwardNorm = { x: forwardVector.x / forwardLength, y: forwardVector.y / forwardLength };
  const pastNorm = { x: pastVector.x / pastLength, y: pastVector.y / pastLength };
  
  // Calculate angle change using cross product of normalized vectors
  const crossProduct = forwardNorm.x * pastNorm.y - forwardNorm.y * pastNorm.x;
  
  // Use a gentler scaling factor for more forgiving curves
  const curvature = crossProduct * 2000; // Reduced from 5000 to make curves gentler
  
  // Add debug logging for first few calculations
  if (distance < 1000 && Math.abs(curvature) > 1) {
    console.log(`getCurveFromPath(${distance}): forward=${JSON.stringify(forwardNorm)}, past=${JSON.stringify(pastNorm)}, cross=${crossProduct.toFixed(4)}, curve=${curvature.toFixed(1)}`);
  }
  
  // Scale to reasonable game curve values - gentler max for forgiving curves
  return Math.max(-200, Math.min(200, curvature));
}

// Legacy track system - kept for reference but not used by gameplay
export const TRACKS_V2 = {
  // This is no longer used - the main TRACKS object handles everything now
};

// Minimap helpers removed

if (typeof window !== 'undefined') {
  window.testPathSystem = () => {
    console.log('=== LEGACY PATH SYSTEM SAMPLE (NON-LIVE) ===');

    const pathData = createDistanceLookup(TRACK_PATHS.PACIFIC_COAST.points);
    console.log(`Total path length: ${pathData.totalDistance.toFixed(1)} units`);

    for (let dist = 0; dist < pathData.totalDistance; dist += pathData.totalDistance / 8) {
      const pos = getPositionAtDistance(pathData, dist);
      const curve = getCurveFromPath(pathData, dist);
      console.log(`Distance ${dist.toFixed(0)}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) curve: ${curve.toFixed(1)}`);
    }
  };
}

// Live segment-based track layouts
// Only Tropical and Coastal remain
export const TRACKS = {
  TROPICAL: {
    name: 'Tropical Paradise Highway',
    segments: [
      TRACK_SEGMENTS.STRAIGHT(6500),
      TRACK_SEGMENTS.HILL_UP(4400, 105),
      TRACK_SEGMENTS.STRAIGHT(7000),
      TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(5400, 24),
      TRACK_SEGMENTS.STRAIGHT(9000),
      TRACK_SEGMENTS.HILL_DOWN(4400, -115),
      TRACK_SEGMENTS.STRAIGHT(5200),
      TRACK_SEGMENTS.CURVE_GENTLE_LEFT(5200, -22),
      TRACK_SEGMENTS.STRAIGHT(4200),
    ]
  },

  COASTAL: {
    name: 'Pacific Coast Highway',
    segments: [
      TRACK_SEGMENTS.STRAIGHT(6000),
      TRACK_SEGMENTS.CURVE_PROGRESSIVE_RIGHT(6800, 28, 40),
      TRACK_SEGMENTS.STRAIGHT(9000),
      TRACK_SEGMENTS.HILL_UP(5600, 165),
      TRACK_SEGMENTS.STRAIGHT(6000),
      TRACK_SEGMENTS.CURVE_GENTLE_LEFT(6600, -38),
      TRACK_SEGMENTS.STRAIGHT(9000),
      TRACK_SEGMENTS.HILL_DOWN(5400, -180),
      TRACK_SEGMENTS.STRAIGHT(6000),
      TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(6400, 34),
      TRACK_SEGMENTS.STRAIGHT(2200)
    ]
  },

  DESERT: {
    name: 'Sonoran Canyon',
    segments: [
      TRACK_SEGMENTS.STRAIGHT(6000),
      TRACK_SEGMENTS.CURVE_PROGRESSIVE_RIGHT(6800, 22, 34), // tightening right into the canyon mouth
      TRACK_SEGMENTS.STRAIGHT(7600),
      TRACK_SEGMENTS.HILL_UP(5400, 150),                     // climb to the rim
      TRACK_SEGMENTS.BANKED_TURN_LEFT(7400, -30, 50),        // banked canyon sweeper
      TRACK_SEGMENTS.STRAIGHT(7600),
      TRACK_SEGMENTS.HILL_DOWN(5400, -165),                  // drop back to the wash
      TRACK_SEGMENTS.BANKED_TURN_RIGHT(7400, 30, -50),       // banked sweeper the other way
      TRACK_SEGMENTS.STRAIGHT(7600),
      TRACK_SEGMENTS.S_CURVE_NATURAL(9000, 22, 0.20),        // flowing S through the rocks
      TRACK_SEGMENTS.STRAIGHT(3000)
    ]
  }
};

// Helper function to get track for specific level
export function getTrackForLevel(levelId) {
  const levelKey = levelId.toUpperCase();
  
  // Use the main TRACKS object which now has path-based coastal track
  return TRACKS[levelKey] || TRACKS.TROPICAL;
}

// Helper function to calculate total track length
export function calculateTrackLength(track) {
  // For path-based tracks, use the actual path distance
  if (track.pathData && track.pathData.totalDistance) {
    return track.pathData.totalDistance;
  }
  // For segment-based tracks, sum segment lengths
  return track.segments.reduce((total, segment) => total + segment.length, 0);
}

const TRACK_SHAPE_DEFAULTS = {
  curveDeadzone: 0.5,
  curveClamp: 160,
  segL: 200,
  roadW: 4000,
  camD: 0.2,
  cameraHeight: 1500,
  width: 1280,
  height: 720,
  lineCount: 70,
};

function resolveTrack(trackOrKey = 'TROPICAL') {
  if (trackOrKey && Array.isArray(trackOrKey.segments)) return trackOrKey;
  if (typeof trackOrKey === 'number') {
    if (trackOrKey === 1) return TRACKS.COASTAL;
    if (trackOrKey === 2) return TRACKS.DESERT;
    return TRACKS.TROPICAL;
  }
  const key = String(trackOrKey || 'TROPICAL').toUpperCase();
  return TRACKS[key] || TRACKS.TROPICAL;
}

function getSegmentAtDistance(track, distance) {
  const trackLength = calculateTrackLength(track);
  const normalized = ((distance % trackLength) + trackLength) % trackLength;
  let start = 0;

  for (const segment of track.segments) {
    const end = start + segment.length;
    if (normalized >= start && normalized < end) {
      return { segment, localDistance: normalized - start, start, end };
    }
    start = end;
  }

  const segment = track.segments[track.segments.length - 1];
  return { segment, localDistance: segment.length, start: trackLength - segment.length, end: trackLength };
}

function getTrackCurveAt(track, distance) {
  const { segment, localDistance } = getSegmentAtDistance(track, distance);
  return segment.curve ? segment.curve(localDistance) : 0;
}

function getTrackHeightAt(track, distance) {
  const { segment, localDistance } = getSegmentAtDistance(track, distance);
  return segment.height ? segment.height(localDistance) : 0;
}

function estimateTrackScreenDrift(track, options = {}) {
  const cfg = { ...TRACK_SHAPE_DEFAULTS, ...options };
  const halfWidth = cfg.width / 2;
  const trackLength = calculateTrackLength(track);
  const lines = Array.from({ length: cfg.lineCount }, (_, i) => ({
    z: i * cfg.segL + 270,
  }));
  let maxCenterDriftPx = 0;
  let positionAtMax = 0;

  for (let pos = 0; pos < trackLength; pos += cfg.segL) {
    const startPos = Math.floor(pos / cfg.segL) % cfg.lineCount;
    let x = 0;
    let dx = 0;

    for (let n = startPos; n < startPos + cfg.lineCount; n++) {
      const line = lines[n % cfg.lineCount];
      const worldZ = line.z + pos;
      const camZ = startPos * cfg.segL - (n >= cfg.lineCount ? cfg.lineCount * cfg.segL : 0);
      const scale = cfg.camD / (line.z - camZ);
      const centerX = (1 + scale * x) * halfWidth;
      const drift = Math.abs(centerX - halfWidth);

      if (drift > maxCenterDriftPx) {
        maxCenterDriftPx = drift;
        positionAtMax = pos;
      }

      let curve = getTrackCurveAt(track, worldZ);
      curve = Math.abs(curve) < cfg.curveDeadzone ? 0 : curve;
      curve = Math.max(-cfg.curveClamp, Math.min(cfg.curveClamp, curve));
      x += dx;
      dx += curve;
    }
  }

  return {
    maxCenterDriftPx: Number(maxCenterDriftPx.toFixed(2)),
    positionAtMax: Math.round(positionAtMax),
  };
}

export function getTrackShapeReport(trackOrKey = 'TROPICAL', options = {}) {
  const track = resolveTrack(trackOrKey);
  const cfg = { ...TRACK_SHAPE_DEFAULTS, ...options };
  const trackLength = calculateTrackLength(track);
  let currentDistance = 0;
  let maxAbsCurve = 0;
  let maxCurve = -Infinity;
  let minCurve = Infinity;
  let maxAbsHeight = 0;
  let maxHeight = -Infinity;
  let minHeight = Infinity;
  let visibleCurveSamples = 0;
  let totalSamples = 0;
  let positiveCurveSamples = 0;
  let negativeCurveSamples = 0;
  let maxCurveDeltaPerSample = 0;

  const segments = track.segments.map((segment, index) => {
    const samples = Math.max(24, Math.ceil(segment.length / 200));
    let segmentMaxAbsCurve = 0;
    let segmentMaxAbsHeight = 0;
    let segmentVisibleCurveSamples = 0;
    let segmentPositiveCurveSamples = 0;
    let segmentNegativeCurveSamples = 0;
    let segmentMaxCurveDeltaPerSample = 0;
    let previousCurve = null;

    for (let i = 0; i <= samples; i++) {
      const local = segment.length * (i / samples);
      const curve = segment.curve ? segment.curve(local) : 0;
      const height = segment.height ? segment.height(local) : 0;

      maxAbsCurve = Math.max(maxAbsCurve, Math.abs(curve));
      maxCurve = Math.max(maxCurve, curve);
      minCurve = Math.min(minCurve, curve);
      maxAbsHeight = Math.max(maxAbsHeight, Math.abs(height));
      maxHeight = Math.max(maxHeight, height);
      minHeight = Math.min(minHeight, height);
      segmentMaxAbsCurve = Math.max(segmentMaxAbsCurve, Math.abs(curve));
      segmentMaxAbsHeight = Math.max(segmentMaxAbsHeight, Math.abs(height));
      if (previousCurve != null) {
        const curveDelta = Math.abs(curve - previousCurve);
        maxCurveDeltaPerSample = Math.max(maxCurveDeltaPerSample, curveDelta);
        segmentMaxCurveDeltaPerSample = Math.max(segmentMaxCurveDeltaPerSample, curveDelta);
      }
      previousCurve = curve;

      if (Math.abs(curve) >= cfg.curveDeadzone) {
        visibleCurveSamples++;
        segmentVisibleCurveSamples++;
      }
      if (curve > cfg.curveDeadzone) {
        positiveCurveSamples++;
        segmentPositiveCurveSamples++;
      }
      if (curve < -cfg.curveDeadzone) {
        negativeCurveSamples++;
        segmentNegativeCurveSamples++;
      }
      totalSamples++;
    }

    const summary = {
      index: index + 1,
      type: segment.type,
      start: currentDistance,
      end: currentDistance + segment.length,
      length: segment.length,
      maxAbsCurve: Number(segmentMaxAbsCurve.toFixed(2)),
      maxAbsHeight: Number(segmentMaxAbsHeight.toFixed(2)),
      maxCurveDeltaPerSample: Number(segmentMaxCurveDeltaPerSample.toFixed(2)),
      visibleCurvePercent: Number(((segmentVisibleCurveSamples / (samples + 1)) * 100).toFixed(1)),
      hasPositiveCurve: segmentPositiveCurveSamples > 0,
      hasNegativeCurve: segmentNegativeCurveSamples > 0,
    };

    currentDistance += segment.length;
    return summary;
  });

  return {
    name: track.name,
    trackLength,
    horizonDistance: cfg.lineCount * cfg.segL,
    horizonRatio: Number((trackLength / (cfg.lineCount * cfg.segL)).toFixed(2)),
    maxAbsCurve: Number(maxAbsCurve.toFixed(2)),
    minCurve: Number(minCurve.toFixed(2)),
    maxCurve: Number(maxCurve.toFixed(2)),
    maxAbsHeight: Number(maxAbsHeight.toFixed(2)),
    minHeight: Number(minHeight.toFixed(2)),
    maxHeight: Number(maxHeight.toFixed(2)),
    maxCurveDeltaPerSample: Number(maxCurveDeltaPerSample.toFixed(2)),
    visibleCurvePercent: Number(((visibleCurveSamples / totalSamples) * 100).toFixed(1)),
    hasPositiveCurve: positiveCurveSamples > 0,
    hasNegativeCurve: negativeCurveSamples > 0,
    estimatedScreenDrift: estimateTrackScreenDrift(track, cfg),
    segments,
  };
}

// Compatibility helper for old minimap/debug callers. Gameplay does not use it.
export function getWorldPositionAtDistance(track, distance) {
  if (track?.pathData) {
    return getPositionAtDistance(track.pathData, distance);
  }
  return { x: distance, y: 0 };
}

// Export TRACKS to window for minimap access
if (typeof window !== 'undefined') {
  window.TRACKS = TRACKS;
}

// Browser debug helpers for the live segment tracks
if (typeof window !== 'undefined') {
  window.testTrackLengths = () => {
    console.log('=== LIVE TRACK LENGTHS ===');
    Object.entries(TRACKS).forEach(([levelName, track]) => {
      console.log(`${levelName}: ${calculateTrackLength(track)} units (${track.name})`);
    });
  };

  window.debugTrackShape = (levelIndex = 0) => {
    const report = getTrackShapeReport(levelIndex, {
      width: window.innerWidth,
      height: window.innerHeight,
      lineCount: window.innerWidth > 768 ? 70 : 50,
    });
    console.log('=== LIVE TRACK SHAPE ===');
    console.log(report);
    console.table(report.segments);
    return report;
  };
  
  // Quick level switching for testing
  window.switchToLevel = (levelIndex) => {
    if (window.game) {
      window.game.selectLevel(levelIndex);
      console.log(`Switched to level ${levelIndex}`);
    }
  };
}
