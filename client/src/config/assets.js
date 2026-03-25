import { getCurrentLevel } from './levels.js';

// Base assets that are always available
export const BASE_ASSETS = {
  IMAGE: {
    HERO: {
      src: "images/hero.png",
      width: 110,
      height: 56,
    },
    CAR: {
      src: "images/car04.png",
      width: 50,
      height: 36,
    },
    // Multiple vehicle types for variety
    // Scaled up to ~80% of hero size (110x56) for better visibility
    VEHICLES: [
      {
        src: "images/vehicles/vehicle-0/right-0.png",
        width: 88,  // Increased from 50 (1.76x scale)
        height: 63, // Increased from 36 (1.75x scale)
      },
      {
        src: "images/vehicles/vehicle-1/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-2/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-3/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-4/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-5/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-6/right-0.png",
        width: 100, // Increased from 65 (trucks slightly larger)
        height: 72,  // Increased from 46
        isTruck: true,
      },
      {
        src: "images/vehicles/vehicle-7/right-0.png",
        width: 100,
        height: 72,
        isTruck: true,
      },
      {
        src: "images/vehicles/vehicle-8/right-0.png",
        width: 100,
        height: 72,
        isTruck: true,
      },
      {
        src: "images/vehicles/vehicle-9/right-0.png",
        width: 88,
        height: 63,
      },
      {
        src: "images/vehicles/vehicle-10/right-0.png",
        width: 88,
        height: 63,
      }
    ],
    FINISH: {
      src: "images/finish.png",
      width: 339,
      height: 180,
      offset: 0,
      anchor: 'center',
      centered: true,
    },
    // Temporary checkpoint banner (reuses finish image, smaller)
    CHECKPOINT: {
      src: "images/finish.png",
      width: 220,
      height: 120,
      offset: 0,
      anchor: 'center',
      centered: true,
    },
    SAILBOAT: {
      src: "images/sailboats.png",
      width: 80,
      height: 60,
    },
    CITY_BUILDING: {
      src: "images/city_buildings.png",
      width: 250,
      height: 200,
    },
    CITY_BUILDING2: {
      src: "images/city_buildings2.png",
      width: 220,
      height: 180,
    },
  },

  AUDIO: {
    menu: 'audio/menu.mp3',
    boost: 'audio/boost_ready.mp3',
    boost_ready: 'audio/boost_ready.mp3',
    boost_empty: 'audio/boost_empty.mp3',
    engine: "audio/engine.wav",
    honk: "audio/honk.mp3",
    beep: "https://s3-us-west-2.amazonaws.com/s.cdpn.io/155629/beep.wav",
    // Near-miss scoring sound effects - premium audio feedback
    success_perfect: "audio/overdrive.mp3", // Dramatic swell for PERFECT near-miss
    success_close: "audio/insight.mp3",     // Clear chime for CLOSE near-miss
    success_nice: "audio/flutter.mp3",      // Soft affirm for NICE near-miss
  },
};

// Dynamic assets based on current level
function createLevelAssets(levelIndex = 0) {
  const level = getCurrentLevel(levelIndex);
  
  return {
    COLOR: {
      ...level.colors,
      // Add GRASS_LEFT for asymmetric coastal level, fallback to GRASS for others
      GRASS_LEFT: level.colors.GRASS_LEFT || level.colors.GRASS,
      // Add transition zone colors for coastal level
      BEACH: level.colors.BEACH || level.colors.GRASS,
      SIDEWALK: level.colors.SIDEWALK || level.colors.GRASS_LEFT || level.colors.GRASS
    },
    
    IMAGE: {
      ...BASE_ASSETS.IMAGE,
      
      // Dynamic scenery objects (backward compatibility)
      TREE: level.scenery.primary,  
      SCENERY_SECONDARY: level.scenery.secondary || null,  
      
      // Dynamic sky backgrounds
      SKY: level.sky,
    },
    
    AUDIO: {
      ...BASE_ASSETS.AUDIO,
      // Could add level-specific music here
      driving_music: level.music?.driving || BASE_ASSETS.AUDIO.menu,
    },
    
    // Include the full level configuration for advanced rendering
    LEVEL_CONFIG: level
  };
}

// Default export for backward compatibility (uses tropical level)
export const ASSETS = createLevelAssets(0);

// Function to get assets for a specific level
export function getAssetsForLevel(levelIndex) {
  return createLevelAssets(levelIndex);
}
