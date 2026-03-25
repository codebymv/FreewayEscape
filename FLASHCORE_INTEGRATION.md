# Freeway Escape - FlashCore Integration Guide

## ✅ Integration Complete!

Freeway Escape is now fully integrated into FlashCore using the same iframe pattern as Void Runner.

---

## 🎮 How to Deploy Freeway Escape to FlashCore

### Quick Deploy (One Command)
```bash
cd C:/Users/roxas/OneDrive/Desktop/PROJECTS/FlashCore/Prototype1
npm run update:freeway-escape
```

This will:
1. Build Freeway Escape (`npm run build` in Freeway Escape project)
2. Copy the build to `FlashCore/public/games/freeway-escape/`
3. Notify you when complete

### Manual Deploy
```powershell
.\scripts\update-game.ps1 freeway-escape "C:/Users/roxas/OneDrive/Desktop/PROJECTS/FreewayEscape/Prototype3/client"
```

---

## 📋 What Was Changed

### 1. FlashCore Configuration

#### `src/config/games.config.ts`
Added Freeway Escape manifest:
```typescript
{
  id: "freeway-escape",
  name: "Freeway Escape",
  version: "3.0.0",
  thumbnail: freewayEscapeTile,
  description: "Race through tropical paradise highways! Weave through traffic, score near-miss points, and chase the ultimate high score in this retro arcade racer.",
  genre: ["Racing", "Arcade"],
  aspectRatio: "16:9",
  minResolution: { width: 1280, height: 720 },
}
```

#### `src/utils/gameStats.ts`
Added high score tracking:
```typescript
'freeway-escape': {
  highScore: 'freewayHighScore',
  achievements: () => {
    const achievements = [
      { check: () => highScore >= 10000 },   // First Mile
      { check: () => highScore >= 50000 },   // Speed Demon
      { check: () => highScore >= 100000 },  // Highway Legend
      { check: () => highScore >= 250000 },  // Road Warrior
      { check: () => highScore >= 500000 },  // Ultimate Racer
    ];
    // Returns highScore, achievementsUnlocked, achievementsTotal
  }
}
```

#### `package.json`
Added update script:
```json
"update:freeway-escape": "powershell -ExecutionPolicy Bypass -File ./scripts/update-game.ps1 freeway-escape \"C:/Users/roxas/OneDrive/Desktop/PROJECTS/FreewayEscape/Prototype3/client\""
```

### 2. Freeway Escape Configuration

#### `client/vite.config.js`
Added `base: './'` for relative paths in iframe:
```javascript
export default defineConfig({
  base: './', // ← CRITICAL for FlashCore iframe embedding
  // ... rest of config
})
```

#### `client/src/core/game.backup.js`
Changed localStorage key to match FlashCore:
```javascript
// BEFORE:
localStorage.getItem('freewayEscapeHighScore')
localStorage.setItem('freewayEscapeHighScore', ...)

// AFTER:
localStorage.getItem('freewayHighScore')
localStorage.setItem('freewayHighScore', ...)
```

---

## 🖼️ Assets Used

- **Tile Image**: `src/assets/freeway-escape-tile.webp` (for game card)
- **Logo**: `src/assets/freeway-escape-logo.png` (for header in launcher)

---

## 🏃 Development Workflow

### Option 1: Standalone Development
```bash
cd FreewayEscape/Prototype3/client
npm run dev
# Work on game, see changes at http://localhost:5173
```

### Option 2: Test in FlashCore
```bash
# Terminal 1 - FlashCore
cd FlashCore/Prototype1
npm run dev
# Portal at http://localhost:5173

# Terminal 2 - Update game
cd FlashCore/Prototype1
npm run update:freeway-escape
# Refresh browser to see changes
```

---

## 🌐 Access Points

After deploying:
- **FlashCore Home**: `http://localhost:5173/`
- **Direct Game Link**: `http://localhost:5173/game/freeway-escape`
- **Library**: `http://localhost:5173/library`

---

## 🎯 High Score & Achievements

FlashCore automatically tracks:
- ✅ High Score (from `localStorage.freewayHighScore`)
- ✅ 5 Achievements based on score milestones
- ✅ Displays on game card and in launcher header

---

## 🔧 How the Integration Works

### iframe Embedding
```typescript
// GameLauncher.tsx loads the game
<iframe
  src={`/games/freeway-escape/index.html`}
  className="absolute inset-0 w-full h-full border-0"
  title="Freeway Escape"
  allow="autoplay; fullscreen"
/>
```

### File Structure in FlashCore
```
FlashCore/Prototype1/
├── public/
│   └── games/
│       └── freeway-escape/        ← Built game goes here
│           ├── index.html
│           ├── assets/
│           │   ├── audio/
│           │   ├── images/
│           │   └── *.js
│           └── *.css
└── src/
    └── assets/
        ├── freeway-escape-tile.webp  ← Game card image
        └── freeway-escape-logo.png   ← Launcher header logo
```

### Build Output (from Freeway Escape)
```
FreewayEscape/Prototype3/client/
└── dist/                  ← This gets copied to FlashCore
    ├── index.html
    ├── assets/
    │   ├── audio/
    │   ├── images/
    │   └── *.js
    └── *.css
```

---

## ✨ Features Included

✅ Retro arcade racing gameplay  
✅ Near-miss scoring system  
✅ Speed-based bonus multipliers  
✅ 2 themed levels (Tropical Paradise, Coastal)  
✅ 30-second timed checkpoint progression  
✅ Boost mechanic  
✅ High score persistence  
✅ Sound effects & music  
✅ Smooth 60 FPS rendering  

---

## 🐛 Troubleshooting

### Build fails
```bash
cd FreewayEscape/Prototype3/client
npm install
npm run build
```

### Game doesn't appear in FlashCore
1. Check `public/games/freeway-escape/` exists
2. Verify `index.html` is present
3. Hard refresh browser (Ctrl+Shift+R)
4. Check browser console for errors

### Assets not loading (404 errors)
- Ensure `base: './'` in `vite.config.js`
- Check that assets are in `assets/` subdirectory in build output

### High score not tracking
- Check localStorage key is `freewayHighScore`
- Open browser DevTools → Application → Local Storage
- Verify key exists after playing

---

## 🎉 Success!

Freeway Escape is now part of the FlashCore game portal, just like Void Runner! 🏎️💨

