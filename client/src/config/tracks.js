// Predefined track layouts for each level
// Each track is defined as a series of segments with specific curves and elevations

console.log('TRACKS.JS LOADED - Testing curve functions...');

export const TRACK_SEGMENTS = {
  // Straight segment - no curve, flat
  STRAIGHT: (length) => ({
    type: 'straight',
    length,
    curve: () => 0,
    height: () => 0
  }),

  // Natural gentle curves with variation
  CURVE_GENTLE_LEFT: (length, intensity = -60, variation = 0.3) => ({
    type: 'curve_gentle_left', 
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      // Add natural variation to make curves less uniform
      const baseIntensity = intensity * (1 + Math.sin(progress * Math.PI * 3) * variation);
      return baseIntensity * Math.sin(progress * Math.PI);
    },
    height: () => 0
  }),

  CURVE_GENTLE_RIGHT: (length, intensity = 60, variation = 0.3) => ({
    type: 'curve_gentle_right',
    length, 
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const baseIntensity = intensity * (1 + Math.sin(progress * Math.PI * 3) * variation);
      return baseIntensity * Math.sin(progress * Math.PI);
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
      const intensityAtPoint = startIntensity + (endIntensity - startIntensity) * progress;
      return intensityAtPoint * Math.sin(progress * Math.PI);
    },
    height: () => 0
  }),

  CURVE_PROGRESSIVE_RIGHT: (length, startIntensity = 40, endIntensity = 80) => ({
    type: 'curve_progressive_right', 
    length,
    curve: (t) => {
      if (t < 0 || t > length) return 0; // Return 0 for out of bounds
      const progress = t / length;
      const intensityAtPoint = startIntensity + (endIntensity - startIntensity) * progress;
      return intensityAtPoint * Math.sin(progress * Math.PI);
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
      // Create asymmetric S-curve that feels more natural
      const leftPart = Math.sin(progress * Math.PI * 2) * intensity;
      const rightPart = Math.sin((progress + asymmetry) * Math.PI * 2) * intensity * 0.7;
      return (leftPart + rightPart) * 0.6;
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

// Test curve functions immediately
console.log('Testing TRACK_SEGMENTS...');
const testStraight = TRACK_SEGMENTS.STRAIGHT(100);
const testCurve = TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(100, 180, 0.1);

console.log('Straight at t=50:', testStraight.curve(50)); // Should be 0
console.log('Curve at t=50:', testCurve.curve(50)); // Should be 180
console.log('Curve at t=25:', testCurve.curve(25)); // Should be ~127
console.log('Curve at t=75:', testCurve.curve(75)); // Should be ~127

// Test actual track generation (moved to after initialization)
function testTrackGeneration() {
  console.log('Testing track generation...');
  const coastalTrack = TRACKS.COASTAL;
  console.log('Coastal track segments:', coastalTrack.segments.length);
  coastalTrack.segments.slice(0, 5).forEach((seg, i) => {
    console.log(`Segment ${i}: ${seg.type} length=${seg.length} curve(50)=${seg.curve(50)}`);
  });
}

// NEW APPROACH: Pre-calculated track paths for perfect minimap sync
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

// Legacy track system - kept for reference but not used
export const TRACKS_V2 = {
  // This is no longer used - the main TRACKS object handles everything now
};

// Minimap helpers removed

// Debug function to test the new system
window.testPathSystem = () => {
  console.log('=== TESTING NEW PATH SYSTEM ===');
  
  const pathData = createDistanceLookup(TRACK_PATHS.SIMPLE_OVAL.points);
  console.log(`Total path length: ${pathData.totalDistance.toFixed(1)} units`);
  
  // Test positions at various distances
  for (let dist = 0; dist < pathData.totalDistance; dist += pathData.totalDistance / 8) {
    const pos = getPositionAtDistance(pathData, dist);
    const curve = getCurveFromPath(pathData, dist);
    console.log(`Distance ${dist.toFixed(0)}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) curve: ${curve.toFixed(1)}`);
  }
};

// Simplified track layouts
// Only Tropical and Coastal remain
export const TRACKS = {
  TROPICAL: {
    name: 'Tropical Paradise Highway',
    segments: [
      // Target ~60s at ~65u/s average speed => ~3900-4200 units
      // Keep tropical mostly straight for cruising feel
      TRACK_SEGMENTS.STRAIGHT(2200),
      TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(400, 12, 0.12),
      TRACK_SEGMENTS.STRAIGHT(1400),
    ]
  },

  COASTAL: {
    name: 'Pacific Coast Highway',
    segments: [
      // Target ~90s at ~65u/s => ~5850-6200 units
      // Keep coastal varied but compact
      TRACK_SEGMENTS.STRAIGHT(800),
      TRACK_SEGMENTS.CURVE_GENTLE_RIGHT(500, 12, 0.12),
      TRACK_SEGMENTS.STRAIGHT(400),

      TRACK_SEGMENTS.HILL_UP(600, 20),
      TRACK_SEGMENTS.STRAIGHT(600),
      TRACK_SEGMENTS.CURVE_GENTLE_LEFT(500, -15, 0.1),

      TRACK_SEGMENTS.STRAIGHT(900),
      TRACK_SEGMENTS.HILL_DOWN(600, -15),
      TRACK_SEGMENTS.S_CURVE_NATURAL(500, 12, 0.1),
      TRACK_SEGMENTS.STRAIGHT(700)
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

// Helper function to get world position at distance for any track
export function getWorldPositionAtDistance(track, distance) {
  // Simplified for straight-line tracks - no complex path calculations needed
  return { x: 0, y: 0 };
}

// Export TRACKS to window for minimap access
if (typeof window !== 'undefined') {
  window.TRACKS = TRACKS;
}

// Simplified debug functions for straight-line tracks
if (typeof window !== 'undefined') {
  // Debug function to test track lengths
  window.testTrackLengths = () => {
    console.log('=== SIMPLIFIED TRACK LENGTHS ===');
    Object.entries(TRACKS).forEach(([levelName, track]) => {
      console.log(`${levelName}: ${calculateTrackLength(track)} units (${track.name})`);
    });
  };
  
  // Quick level switching for testing
  window.switchToLevel = (levelIndex) => {
    if (window.game) {
      window.game.selectLevel(levelIndex);
      console.log(`Switched to level ${levelIndex}`);
    }
  };
}