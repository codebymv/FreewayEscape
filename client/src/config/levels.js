// Level/Environment configuration for FreewayEscape
export const LEVELS = {
  // Level 1: Tropical Paradise (Current)
  TROPICAL: {
    id: 'tropical',
    name: 'Tropical Paradise',
    
    // Sky/Background
    sky: ['images/cloud.jpg', 'images/cloud_2.jpg', 'images/cloud_3.jpg'],
    
    // Road Colors
    colors: {
      // Match Coastal road palette for consistency
      TAR: ["#2C2C2C", "#1A1A1A"],      // Dark asphalt
      RUMBLE: ["#FFFF00", "#FFFFFF"],   // Yellow/White lane markers
      GRASS: ["#00FFA3", "#00FFFF"],    // Bright green/cyan grass (right side)
      // Add left-side ocean/beach scheme to mirror coastal but on the left
      GRASS_LEFT: ["#1E90FF", "#4169E1"], // Ocean blue (far left)
      BEACH: ["#F4E4BC", "#E6D3A3"],      // Sandy beach (left transition)
      // Add grey sidewalk next to road and white beyond it
      SIDEWALK: ["#808080", "#696969"],   // Grey sidewalk (right transition)
      SIDEWALK_WHITE: ["#FFFFFF", "#F0F0F0"], // White area beyond sidewalk
    },
    
    // Roadside Objects
    scenery: {
      primary: {
        src: "images/tree.png",         // Palm trees
        width: 80,
        height: 120,
        spacing: 10,                     // Every 10 segments
        // Place palms on left side only for Tropical
        sides: [-3.0]
      }
    },
    
    // Optional: Level-specific music
    music: {
      driving: 'audio/menu.mp3',        // Placeholder for now
      menu: 'audio/menu.mp3'
    }
  },

  // Level 2: Coastal Highway
  COASTAL: {
    id: 'coastal',
    name: 'Coastal Highway',
    
    sky: [
      'images/coastal_sky.jpg',        // Morning/dawn sky
      'images/coastal_sky_midday.jpg', // Midday sky
      'images/coastal_sky_night.jpg'   // Night sky
    ],
    
    colors: {
      TAR: ["#2C2C2C", "#1A1A1A"],     // Realistic asphalt
      RUMBLE: ["#FFFF00", "#FFFFFF"],   // Yellow/White lane markers
      GRASS: ["#1E90FF", "#4169E1"],    // Ocean blue (far right)
      GRASS_LEFT: ["#228B22", "#32CD32"], // City green (far left)
      // New transition zones
      BEACH: ["#F4E4BC", "#E6D3A3"],    // Sandy beach area (right transition)
      SIDEWALK: ["#808080", "#696969"], // Concrete sidewalk (left transition)
    },
    
    scenery: {
      // Grassy mountains in the far background for California highway feel
      mountains: {
        src: "images/grassy_mountain.png",
        width: 500,   // Wider for better horizon coverage
        height: 140,  // Lower for better proportion with buildings
        spacing: 15,  // More frequent for continuous backdrop
        sides: [-4.2] // Further back for better depth layering
      },
      // City buildings on left side only (inland side) - closer for packed beachfront city feel
      primary: {
        src: "images/city_buildings.png", 
        width: 250,   // Larger for more prominent presence
        height: 180,  // Taller for city skyline effect
        spacing: 12,  // More frequent placement
        sides: [-2.1] // Much closer to road for beachfront city vibe
      },
      // City buildings variant for variety on left side
      buildings_variant: {
        src: "images/city_buildings2.png", 
        width: 220,   // Slightly different size for variety
        height: 160,
        spacing: 14,
        sides: [-2.4] // Alternate position for depth
      },
      // Street lamps now handled in game.js with tree alternation
      // secondary: {
      //   src: "images/street_lamp.png",   
      //   width: 50,
      //   height: 120,
      //   spacing: 8,
      //   sides: [-1.5] // Positioned on sidewalk area between city and road
      // }
      // Right side (ocean side) intentionally left empty for ocean view
    }
  }
};

// Level progression system
export const LEVEL_PROGRESSION = [
  'tropical',
  'coastal'
];

// Helper to get current level config
export function getCurrentLevel(levelIndex = 0) {
  const levelId = LEVEL_PROGRESSION[levelIndex % LEVEL_PROGRESSION.length];
  return LEVELS[Object.keys(LEVELS).find(key => LEVELS[key].id === levelId)];
}