import { mapLength, N } from '../config/constants.js';
import { getRand } from '../utils/helpers.js';
import { getTrackForLevel, calculateTrackLength } from '../config/tracks.js';
import { getCurrentLevel } from '../config/levels.js';
import { ASSETS } from '../config/assets.js';

export function genMap(levelIndex = 0) {
  let map = [];
  let totalLength = 0;

  // Get the current level configuration
  const currentLevel = getCurrentLevel(levelIndex);
  const track = getTrackForLevel(currentLevel.id);
  
  console.log(`Generating track: ${track.name} for level: ${currentLevel.name}`);

  // Build map from predefined track segments
  for (let segmentDef of track.segments) {
    let section = {
      from: totalLength,
      to: totalLength + segmentDef.length,
      type: segmentDef.type,
      curve: segmentDef.curve,  // Use the original curve function directly
      height: segmentDef.height  // Use the original height function directly
    };

    map.push(section);
    totalLength += segmentDef.length;
  }

  // Add finish line section at the end
  map.push({
    from: totalLength,
    to: totalLength + N,
    type: 'finish',
    curve: (_) => 0,
    height: (_) => 0,
    special: ASSETS.IMAGE.FINISH
  });

  const trackLength = calculateTrackLength(track);
  
  console.log(`Track generated: ${track.name}`);
  console.log(`- Total length: ${trackLength} units`);
  console.log(`- Segments: ${track.segments.length}`);
  console.log(`- Level theme: ${currentLevel.name}`);
  
  // Debug: Log all map sections
  console.log('Map sections:');
  map.forEach((section, index) => {
    console.log(`  Section ${index}: type=${section.type}, from=${section.from}, to=${section.to}, special=${section.special ? 'YES' : 'NO'}`);
  });
  
  // Store the actual track length for this specific map
  map.trackLength = trackLength;
  map.levelIndex = levelIndex;
  map.levelName = currentLevel.name;
  map.trackName = track.name;

  // Single intelligent checkpoint: place at mid-point of core track
  // Core excludes the initial and final finish segments (size N each)
  const coreStart = N;
  const coreEnd = totalLength - N;
  const midCore = Math.floor((coreStart + coreEnd) / 2);
  // Clamp to avoid being too close to finish sections
  const buffer = Math.max(30, Math.floor(N * 0.25));
  const singleCheckpoint = Math.min(coreEnd - buffer, Math.max(coreStart + buffer, midCore));

  map.checkpoints = [singleCheckpoint];

  return map;
}

// Helper function to generate map for specific level (useful for level selection)
export function genMapForLevel(levelIndex) {
  return genMap(levelIndex);
}

// Debug function to preview track layout
export function debugTrackLayout(levelIndex = 0) {
  const currentLevel = getCurrentLevel(levelIndex);
  const track = getTrackForLevel(currentLevel.id);
  
  console.log(`\n=== TRACK LAYOUT DEBUG: ${track.name} ===`);
  
  let currentPos = 0;
  track.segments.forEach((segment, index) => {
    const segmentName = segment.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`${index + 1}. ${segmentName} (${segment.length} units) - Position: ${currentPos}-${currentPos + segment.length}`);
    currentPos += segment.length;
  });
  
  console.log(`Total Track Length: ${currentPos} units`);
  console.log(`Estimated Lap Time: ~${Math.round(currentPos / 300)}s at average speed`);
  console.log(`=================================\n`);
  
  return {
    name: track.name,
    totalLength: currentPos,
    segmentCount: track.segments.length,
    segments: track.segments.map((seg, i) => ({
      index: i + 1,
      type: seg.type,
      length: seg.length
    }))
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
