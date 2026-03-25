// Track Preview Utility
// Generates visual representations of track layouts for UI display

import { getTrackForLevel } from '../config/tracks.js';
import { getCurrentLevel } from '../config/levels.js';

/**
 * Generate an SVG path representation of a track layout
 * @param {number} levelIndex - The level index to generate preview for
 * @param {number} width - Preview width in pixels
 * @param {number} height - Preview height in pixels
 * @returns {string} SVG path string
 */
export function generateTrackPreviewSVG(levelIndex = 0, width = 200, height = 150) {
  const currentLevel = getCurrentLevel(levelIndex);
  const track = getTrackForLevel(currentLevel.id);
  
  let currentX = width * 0.1; // Start 10% from left
  let currentY = height * 0.5; // Start in middle
  let currentAngle = 0; // Direction in radians
  
  const segments = [];
  const pathCommands = [`M ${currentX} ${currentY}`];
  
  // Scale factor to fit track in preview area
  const scale = Math.min(width, height) / Math.max(track.segments.reduce((sum, seg) => sum + seg.length, 0) / 10, 1000);
  
  for (let i = 0; i < track.segments.length; i++) {
    const segment = track.segments[i];
    const segmentLength = segment.length * scale * 0.01; // Scale down for preview
    
    // Determine turn characteristics
    let turnAmount = 0;
    let segmentSteps = Math.max(3, Math.floor(segmentLength / 2));
    
    if (segment.type.includes('curve') || segment.type.includes('turn')) {
      // Sample the curve function to get average turn intensity
      const midPoint = segment.length / 2;
      turnAmount = segment.curve(midPoint) * 0.01; // Scale down turn intensity
    } else if (segment.type.includes('s_curve')) {
      // S-curves need special handling - alternate turns
      segmentSteps = Math.max(6, Math.floor(segmentLength / 2));
    }
    
    // Draw segment in steps for smooth curves
    for (let step = 0; step < segmentSteps; step++) {
      const stepProgress = step / segmentSteps;
      const stepLength = segmentLength / segmentSteps;
      
      // Calculate turn for this step
      let stepTurn = 0;
      if (segment.type.includes('s_curve')) {
        const t = stepProgress * segment.length;
        stepTurn = segment.curve(t) * 0.005; // Much smaller for preview
      } else if (turnAmount !== 0) {
        stepTurn = turnAmount * Math.sin(stepProgress * Math.PI) * 0.5;
      }
      
      currentAngle += stepTurn;
      
      // Calculate next position
      const nextX = currentX + Math.cos(currentAngle) * stepLength;
      const nextY = currentY + Math.sin(currentAngle) * stepLength;
      
      // Keep track within bounds
      const boundedX = Math.max(5, Math.min(width - 5, nextX));
      const boundedY = Math.max(5, Math.min(height - 5, nextY));
      
      pathCommands.push(`L ${boundedX} ${boundedY}`);
      
      currentX = boundedX;
      currentY = boundedY;
    }
    
    segments.push({
      type: segment.type,
      length: segmentLength,
      endX: currentX,
      endY: currentY
    });
  }
  
  const pathData = pathCommands.join(' ');
  
  return {
    path: pathData,
    viewBox: `0 0 ${width} ${height}`,
    segments: segments,
    trackName: track.name
  };
}

/**
 * Create a complete SVG element for track preview
 * @param {number} levelIndex - Level index
 * @param {object} options - Styling options
 * @returns {string} Complete SVG HTML string
 */
export function createTrackPreviewHTML(levelIndex = 0, options = {}) {
  const {
    width = 200,
    height = 150,
    strokeColor = '#ffffff',
    strokeWidth = 3,
    backgroundColor = 'rgba(0,0,0,0.5)',
    startPointColor = '#00ff00',
    className = 'track-preview'
  } = options;
  
  const preview = generateTrackPreviewSVG(levelIndex, width, height);
  
  return `
    <div class="${className}" style="
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background: ${backgroundColor};
      border-radius: 8px;
      padding: 10px;
      margin: 5px;
    ">
      <div style="
        position: absolute;
        top: 5px;
        left: 10px;
        color: white;
        font-size: 10px;
        font-family: 'Press Start 2P', monospace;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      ">${preview.trackName}</div>
      
      <svg width="${width}" height="${height}" viewBox="${preview.viewBox}" style="
        position: absolute;
        top: 0;
        left: 0;
      ">
        <!-- Track path -->
        <path
          d="${preview.path}"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.9"
        />
        
        <!-- Start/Finish line indicator -->
        <circle
          cx="${width * 0.1}"
          cy="${height * 0.5}"
          r="4"
          fill="${startPointColor}"
          stroke="white"
          stroke-width="1"
        />
      </svg>
    </div>
  `;
}

/**
 * Generate track previews for all levels (useful for level select screen)
 * @param {object} options - Styling options
 * @returns {Array} Array of preview HTML strings
 */
export function generateAllTrackPreviews(options = {}) {
  const previews = [];
  for (let i = 0; i < 5; i++) { // 5 levels total
    previews.push(createTrackPreviewHTML(i, {
      ...options,
      className: `track-preview level-${i}`
    }));
  }
  return previews;
}

/**
 * Insert track previews into level select UI
 * @param {HTMLElement} container - Container element to insert previews into
 * @param {object} options - Styling options
 */
export function insertTrackPreviewsIntoLevelSelect(container, options = {}) {
  if (!container) return;
  
  const previews = generateAllTrackPreviews(options);
  
  previews.forEach((previewHTML, index) => {
    const previewElement = document.createElement('div');
    previewElement.innerHTML = previewHTML;
    previewElement.style.display = 'inline-block';
    previewElement.setAttribute('data-level', index);
    
    // Add click handler for level selection
    previewElement.addEventListener('click', () => {
      const event = new CustomEvent('levelSelected', { detail: { levelIndex: index } });
      container.dispatchEvent(event);
    });
    
    container.appendChild(previewElement.firstChild);
  });
}

// Debug function for console testing
export function debugTrackPreview(levelIndex = 1) {
  const preview = generateTrackPreviewSVG(levelIndex);
  console.log(`\n=== TRACK PREVIEW DEBUG: Level ${levelIndex} ===`);
  console.log(`Track: ${preview.trackName}`);
  console.log(`SVG Path: ${preview.path}`);
  console.log(`Segments: ${preview.segments.length}`);
  preview.segments.forEach((seg, i) => {
    console.log(`  ${i + 1}. ${seg.type} - ends at (${seg.endX.toFixed(1)}, ${seg.endY.toFixed(1)})`);
  });
  console.log('=================================\n');
  return preview;
} 