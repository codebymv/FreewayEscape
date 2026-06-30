import { ASSETS } from '../config/assets.js';
import * as constants from '../config/constants.js';
import { drawQuad } from '../utils/helpers.js';

// Static scenery sprite descriptors, hoisted to module scope so the per-segment
// render loop reuses frozen objects instead of allocating ~16 literals every frame.
// drawSprite() only reads src/width/height, so sharing these is safe.
const SPR = {
  YACHT: { src: 'images/yacht.png', width: 120, height: 80 },
  SKYRISE1: { src: 'images/skyrise1.png', width: 200, height: 220 },
  SKYRISE2: { src: 'images/skyrise2.png', width: 180, height: 200 },
  SKYRISE3: { src: 'images/skyrise3.png', width: 240, height: 260 },
  CITY_FAR: { src: 'images/city_buildings.png', width: 140, height: 120 },
  CITY2_FAR: { src: 'images/city_buildings2.png', width: 120, height: 100 },
  CITY2_MID: { src: 'images/city_buildings2.png', width: 180, height: 150 },
  CITY_HILL: { src: 'images/city_buildings.png', width: 220, height: 180 },
  CITY2_FORE: { src: 'images/city_buildings2.png', width: 160, height: 140 },
  CITY_FORE: { src: 'images/city_buildings.png', width: 150, height: 130 },
  MOUNTAIN_HIGH: { src: 'images/grassy_mountain.png', width: 500, height: 170 },
  MOUNTAIN_LOW: { src: 'images/grassy_mountain.png', width: 450, height: 150 },
  MOUNTAIN_MID: { src: 'images/grassy_mountain.png', width: 600, height: 180 },
  STREET_LAMP: { src: 'images/street_lamp.png', width: 40, height: 80 },
  PALM: { src: 'images/tree.png', width: 80, height: 120 },
  SEAGULL: { src: 'images/seagull.png', width: 30, height: 20 },
  UMBRELLA: { src: 'images/beach_umbrella.png', width: 50, height: 60 },
  LIGHTHOUSE: { src: 'images/lighthouse.png', width: 60, height: 120 },
  SAGUARO: { src: 'images/saguaro.svg', width: 80, height: 120 },
  MESA_FAR: { src: 'images/mesa.svg', width: 220, height: 130 },
  MESA_NEAR: { src: 'images/mesa.svg', width: 300, height: 175 },
};

const SPRITE_LAYER = {
  BEACH_DETAIL: 2,
  FORE_DETAIL: 3,
  OCEAN_A: 4,
  OCEAN_B: 5,
  ROADSIDE_A: 6,
  ROADSIDE_B: 7,
  FAR_A: 8,
  FAR_B: 9,
  MID_A: 10,
  MID_B: 11,
  MID_C: 12,
  MID_D: 13,
  FORE_A: 14,
  FORE_B: 15,
  SKY_ACCENT: 16,
  LANDMARK: 17,
};

// Per-segment road rendering lifted out of drawRoad()'s loop: roadside scenery
// sprites, side-terrain zones, and the road-surface/lane-marker quads. Mixed into
// GameEngine.prototype; every method runs with `this` bound to the engine instance.
export const RoadRenderMixin = {
  _drawScenery(l, n, level, worldDistance) {
    const sceneryIndex = Number.isFinite(worldDistance)
      ? Math.floor((worldDistance - 270) / constants.segL)
      : n;

    if (this.currentLevelIndex === 0) {
      // Tropical level - palms on left only, ocean/beach on left with boats
      const cfg = this.currentAssets.LEVEL_CONFIG?.scenery?.primary || {};
      const spacing = Number.isFinite(cfg.spacing) ? cfg.spacing : 15;
      const sides = Array.isArray(cfg.sides) && cfg.sides.length > 0 ? cfg.sides : [-2.5];
      // Use high sprite layers (8/9) to avoid coastal overlay slots (6/7)
      if (sceneryIndex % spacing === 0) {
        l.drawSprite(level + 100, SPRITE_LAYER.ROADSIDE_A, this.currentAssets.IMAGE.TREE, sides[0]);
      }
      // Only draw a second side if configured (keeps palms left-only)
      if (sides.length > 1 && sceneryIndex % spacing === Math.floor(spacing / 2)) {
        l.drawSprite(level + 100, SPRITE_LAYER.ROADSIDE_B, this.currentAssets.IMAGE.TREE, sides[1]);
      }

      // Add yachts on the ocean side (left), fewer than sailboats
      if (sceneryIndex % 40 === 0) {
        l.drawSprite(level + 600, SPRITE_LAYER.OCEAN_A, SPR.YACHT, -4.5);
      }
      if (sceneryIndex % 55 === 27) {
        l.drawSprite(level + 600, SPRITE_LAYER.OCEAN_B, SPR.YACHT, -5.0);
      }

      // Add skyrise buildings on the right side (opposite sand/water)
      // Match Coastal city/grassy staggering with similar intervals on this side
      if (sceneryIndex % 16 === 0) {
        l.drawSprite(level + 650, SPRITE_LAYER.FAR_A, SPR.SKYRISE1, 3.8);
      }
      if (sceneryIndex % 19 === 9) {
        l.drawSprite(level + 680, SPRITE_LAYER.FAR_B, SPR.SKYRISE2, 3.4);
      }
      // New: taller skyrise variant, appears less often
      // Place behind skyrise1 and skyrise2 by using a lower depth
      if (sceneryIndex % 11 === 4) {
        l.drawSprite(level + 640, SPRITE_LAYER.MID_A, SPR.SKYRISE3, 4.2);
      }
    } else if (this.currentLevelIndex === 1) {
      // Coastal level - Enhanced Oceanside Scenic Route
      // Dynamic scenery that changes based on track elevation and curves
      
      // Use this row's sampled road shape for scenery decisions. Using the
      // player position here makes whole background groups toggle at once.
      const elevation = Number.isFinite(l.rawHeight) ? l.rawHeight : 0;
      const curve = Number.isFinite(l.rawCurve) ? l.rawCurve : 0;
      const isHighElevation = elevation > 50; // Ocean overlook sections
      const isLowElevation = elevation < -30; // Beach run sections
      const isCurving = Math.abs(curve) > 20; // Curved sections
      
      // LAYERED CITYSCAPE SYSTEM - Buildings at multiple depths
      
      // Far background buildings (smallest, behind everything)
      if (sceneryIndex % 16 === 0) {
        l.drawSprite(level + 400, SPRITE_LAYER.FAR_A, SPR.CITY_FAR, -4.8);
      }
      if (sceneryIndex % 19 === 9) {
        l.drawSprite(level + 420, SPRITE_LAYER.FAR_B, SPR.CITY2_FAR, -4.3);
      }
      
      // Mid-background buildings (mixed with far hills)
      if (sceneryIndex % 14 === 7) {
        l.drawSprite(level + 530, SPRITE_LAYER.MID_A, SPR.CITY2_MID, -3.2);
      }
      
      // Grassy mountains layer 1 (far background)
      if (sceneryIndex % 10 === 6) {
        l.drawSprite(level + 550, SPRITE_LAYER.MID_B, isHighElevation ? SPR.MOUNTAIN_HIGH : SPR.MOUNTAIN_LOW, -2.2);
      }
      
      // Buildings at hill depth (larger, blending with hills)
      if (sceneryIndex % 11 === 4) {
        l.drawSprite(level + 590, SPRITE_LAYER.MID_C, SPR.CITY_HILL, -2.5);
      }
      
      // Grassy mountains layer 2 (mid-distance, overlapping with buildings)
      if (sceneryIndex % 8 === 0) {
        l.drawSprite(level + 600, SPRITE_LAYER.MID_D, SPR.MOUNTAIN_MID, -1.8);
      }
      
      // Foreground buildings (sparse, between hills and palm trees)
      if (sceneryIndex % 18 === 2) {
        l.drawSprite(level + 650, SPRITE_LAYER.FORE_A, SPR.CITY2_FORE, -2.0);
      }
      if (sceneryIndex % 22 === 11) {
        l.drawSprite(level + 680, SPRITE_LAYER.FORE_B, SPR.CITY_FORE, -2.3);
      }
      
      // DYNAMIC OCEAN ELEMENTS - More visible during high elevation sections
      
      // Layer 4: Sailboats in ocean (more frequent on overlooks)
      if (sceneryIndex % 25 === 0 || (isHighElevation && sceneryIndex % 15 === 0)) {
        l.drawSprite(level + 600, SPRITE_LAYER.OCEAN_A, ASSETS.IMAGE.SAILBOAT, 4.5);
      }
      
      // Layer 5: More sailboats (deeper in ocean, visible on clear stretches)
      if (sceneryIndex % 35 === 17 || (isHighElevation && sceneryIndex % 20 === 17)) {
        l.drawSprite(level + 600, SPRITE_LAYER.OCEAN_B, ASSETS.IMAGE.SAILBOAT, 5.0);
      }
      
      // COASTAL VEGETATION - Changes with elevation
      
      // Layer 6: Street lamps on left (sidewalk area) - More frequent in city approach
      if (sceneryIndex % 12 === 0 && !isLowElevation) {
        l.drawSprite(level + 650, SPRITE_LAYER.ROADSIDE_A, SPR.STREET_LAMP, -4.5); // Moved further left to sidewalk area
      }
      
      // Layer 7: Palm trees on right (beach/sand area) - Denser during beach run
      if (sceneryIndex % 14 === 7 || (isLowElevation && sceneryIndex % 8 === 3)) {
        l.drawSprite(level + 700, SPRITE_LAYER.ROADSIDE_B, SPR.PALM, 2.5);
      }
      
      // SPECIAL COASTAL EFFECTS
      
      // Seagulls flying over ocean (high elevation overlooks only)
      if (isHighElevation && sceneryIndex % 40 === 15) {
        l.drawSprite(level + 300, SPRITE_LAYER.SKY_ACCENT, SPR.SEAGULL, 3.8 + Math.sin(sceneryIndex * 0.1) * 0.5); // Animated flight pattern
      }
      
      // Beach umbrellas during low elevation beach sections
      if (isLowElevation && sceneryIndex % 30 === 10) {
        l.drawSprite(level + 750, SPRITE_LAYER.BEACH_DETAIL, SPR.UMBRELLA, 3.2);
      }
      
      // Lighthouse on distant point (curves and overlooks)
      if ((isCurving || isHighElevation) && sceneryIndex % 80 === 0) {
        l.drawSprite(level + 200, SPRITE_LAYER.LANDMARK, SPR.LIGHTHOUSE, 6.0);
      }
    } else if (this.currentLevelIndex === 2) {
      // Sonoran desert / canyon - open highway with mesas far back and saguaros roadside.
      const elevation = Number.isFinite(l.rawHeight) ? l.rawHeight : 0;
      const onRim = elevation > 40; // up on the canyon rim

      // Far mesas / buttes (both sides, staggered for a layered horizon)
      if (sceneryIndex % 17 === 0) {
        l.drawSprite(level + 420, SPRITE_LAYER.FAR_A, SPR.MESA_FAR, -4.4);
      }
      if (sceneryIndex % 23 === 11) {
        l.drawSprite(level + 440, SPRITE_LAYER.FAR_B, SPR.MESA_FAR, 4.6);
      }
      // Nearer mesa bluff, sparser, more frequent up on the rim
      if (sceneryIndex % 31 === 6 || (onRim && sceneryIndex % 19 === 6)) {
        l.drawSprite(level + 560, SPRITE_LAYER.MID_B, SPR.MESA_NEAR, -2.6);
      }

      // Saguaros lining the road, alternating sides so it never feels mirrored
      if (sceneryIndex % 9 === 0) {
        l.drawSprite(level + 660, SPRITE_LAYER.ROADSIDE_A, SPR.SAGUARO, -2.5);
      }
      if (sceneryIndex % 11 === 5) {
        l.drawSprite(level + 700, SPRITE_LAYER.ROADSIDE_B, SPR.SAGUARO, 2.6);
      }
      // Occasional closer saguaro for foreground depth
      if (sceneryIndex % 14 === 9) {
        l.drawSprite(level + 720, SPRITE_LAYER.FORE_A, SPR.SAGUARO, 3.4);
      }
    }
  },
  _drawTerrainZones(l, p, level, even, grass, grassLeft) {
    // 4-Zone coastal highway system: City -> Sidewalk -> Road -> Beach -> Ocean
    if (this.currentLevelIndex === 1) { // Coastal level only
      // Ensure coastal transition zone layers are visible for this level
      if (l.elements[6]) {
        l.elements[6].style.display = 'block';
      }
      if (l.elements[7]) {
        l.elements[7].style.display = 'block';
      }
      // Zone 1: Far left - City area (green) - wider coverage
      drawQuad(
        l.elements[0],
        level - 1,
        grassLeft,
        l.X - l.W * 2, // Closer to road
        p.Y,
        l.W * 4, // Much wider to eliminate gaps
        l.X - l.W * 2,
        l.Y,
        l.W * 4
      );
      
      // Zone 2: Left transition - Sidewalk area (gray) - overlapping
      drawQuad(
        l.elements[6],
        level - 1,
        this.currentAssets.COLOR.SIDEWALK[even * 1],
        l.X - l.W * 0.8, // Much closer to road edge
        p.Y,
        l.W * 1.5, // Wider to overlap and eliminate gaps
        l.X - l.W * 0.8,
        l.Y,
        l.W * 1.5
      );
      
      // Zone 3: Right transition - Beach area (sand) - overlapping
      drawQuad(
        l.elements[7],
        level - 1,
        this.currentAssets.COLOR.BEACH[even * 1],
        l.X + l.W * 0.8, // Much closer to road edge
        p.Y,
        l.W * 1.5, // Wider to overlap and eliminate gaps
        l.X + l.W * 0.8,
        l.Y,
        l.W * 1.5
      );
      
      // Zone 4: Far right - Ocean area (blue) - wider coverage
      drawQuad(
        l.elements[1],
        level - 1,
        grass,
        l.X + l.W * 2, // Closer to road
        p.Y,
        l.W * 4, // Much wider to eliminate gaps
        l.X + l.W * 2,
        l.Y,
        l.W * 4
      );
    } else {
      // Non-coastal levels
      if (this.currentLevelIndex === 0) {
        // Tropical: mirror coastal ocean/beach on the LEFT side
        // Show beach overlay element (left transition) and right sidewalk element
        if (l.elements[6]) l.elements[6].style.display = 'block';
        if (l.elements[7]) l.elements[7].style.display = 'block';

        // Far left: Ocean area (use GRASS_LEFT as ocean blue), wide coverage
        drawQuad(
          l.elements[0],
          level - 1,
          grassLeft,
          l.X - l.W * 2,
          p.Y,
          l.W * 4,
          l.X - l.W * 2,
          l.Y,
          l.W * 4
        );

        // Left transition: Beach area (sand), overlapping the edge
        drawQuad(
          l.elements[6],
          level - 1,
          this.currentAssets.COLOR.BEACH[even * 1],
          l.X - l.W * 0.8,
          p.Y,
          l.W * 1.5,
          l.X - l.W * 0.8,
          l.Y,
          l.W * 1.5
        );

        // Right side: sidewalk (grey) and white zone beyond
        // Sidewalk next to road (use a separate element from beach)
        if (l.elements[7]) {
          l.elements[7].style.display = 'block';
          drawQuad(
            l.elements[7],
            level - 1,
            this.currentAssets.COLOR.SIDEWALK[even * 1],
            l.X + l.W * 0.8, // Close to road edge
            p.Y,
            l.W * 1.5, // Wide enough to cover gap
            l.X + l.W * 0.8,
            l.Y,
            l.W * 1.5
          );
        }
        // White zone beyond sidewalk
        drawQuad(
          l.elements[1],
          level - 1,
          this.currentAssets.COLOR.SIDEWALK_WHITE ? this.currentAssets.COLOR.SIDEWALK_WHITE[even * 1] : '#FFFFFF',
          l.X + l.W * 2,
          p.Y,
          l.W * 4,
          l.X + l.W * 2,
          l.Y,
          l.W * 4
        );
      } else {
        // Standard 2-zone system for other levels
        if (l.elements[6]) {
          l.elements[6].style.display = 'none';
          l.elements[6].style.background = 'transparent';
        }
        if (l.elements[7]) {
          l.elements[7].style.display = 'none';
          l.elements[7].style.background = 'transparent';
        }
        drawQuad(
          l.elements[0],
          level,
          grassLeft,
          constants.width / 4,
          p.Y,
          constants.halfWidth + 2,
          constants.width / 4,
          l.Y,
          constants.halfWidth
        );
        drawQuad(
          l.elements[1],
          level,
          grass,
          (constants.width / 4) * 3,
          p.Y,
          constants.halfWidth + 2,
          (constants.width / 4) * 3,
          l.Y,
          constants.halfWidth
        );
      }
    }
  },

  _drawRoadSurface(l, p, level, even, rumble, tar) {
    // Road surface - normal z-index
    drawQuad(
      l.elements[2],
      level,
      rumble,
      p.X,
      p.Y,
      p.W * 1.15,
      l.X,
      l.Y,
      l.W * 1.15
    );
    drawQuad(
      l.elements[3],
      level,
      tar,
      p.X,
      p.Y,
      p.W,
      l.X,
      l.Y,
      l.W
    );

    if (!even) {
      drawQuad(
        l.elements[4],
        level,
        this.currentAssets.COLOR.RUMBLE[1],
        p.X,
        p.Y,
        p.W * 0.4,
        l.X,
        l.Y,
        l.W * 0.4
      );
      drawQuad(
        l.elements[5],
        level,
        tar,
        p.X,
        p.Y,
        p.W * 0.35,
        l.X,
        l.Y,
        l.W * 0.35
      );
    } else {
      if (l.elements[4]) l.elements[4].style.display = 'none';
      if (l.elements[5]) l.elements[5].style.display = 'none';
    }
  },

};
