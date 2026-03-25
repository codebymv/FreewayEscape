# Traffic Flow & Memory Audit

**Scope:** Traffic lifecycle, DOM management, state across runs.  
**Finding:** "Starts different than ends" — traffic density and DOM leak.

---

## 1. Traffic Flow Lifecycle

| Phase | Action | Car count | DOM |
|-------|--------|-----------|-----|
| **init()** | initCars → initRoad | 4 cars created | initRoad **removes** car elements |
| **startGame (run 1)** | initCars (carsInitialized=false) | 4 cars | New elements appended |
| **Checkpoint pass** | _escalateTraffic | +1 car (up to 10) | New element per car |
| **Game over** | _triggerGameOver | — | No cleanup |
| **startGame (run 2)** | initCars (carsInitialized=false) | **levelsCompleted** from run 1 | **LEAK:** old elements stay, new appended |

---

## 2. Issues Found

### L1: DOM memory leak
- **Cause:** `initCars` does `this.cars = []` but never removes old car elements from the DOM.
- **Effect:** Each new run appends 4–10 new elements. Old elements stay in `#road`. Ghost cars + memory growth.
- **Fix:** Remove existing car elements from DOM before clearing the array.

### L2: levelsCompleted persists across Arcade runs
- **Cause:** `levelsCompleted` is never reset on game over. Used in `initCars` for `carCount`.
- **Effect:** Run 1: 4 cars → 10 after checkpoints. Run 2: starts with 10 cars (levelsCompleted=6). Traffic density increases across runs.
- **Fix:** Reset `levelsCompleted` (or equivalent) in Arcade `_initArcadeState` or startGame.

### L3: initRoad removes car elements at startup
- **Cause:** `init()` runs initCars then initRoad. initRoad removes all children except hero/cloud.
- **Effect:** First-run car elements are orphaned. startGame’s initCars creates fresh cars, so this only affects the pre-start state.
- **Note:** Not a leak (no accumulation) but cars from init() are never visible.

### L4: carIdCounter never resets
- **Cause:** `carIdCounter++` on each new car; never reset.
- **Effect:** Unbounded growth (4→14→24… per run). Minor; IDs only need uniqueness within a run.
- **Fix (optional):** Reset in startGame for cleaner state.

---

## 3. Traffic Count Logic

```
initCars: carCount = AI_BASE_COUNT + levelsCompleted * AI_CARS_PER_LEVEL
_escalateTraffic: targetCount = AI_BASE_COUNT + checkpointsPassed * AI_CARS_PER_LEVEL
```

- **levelsCompleted** = base class, incremented by nextLevel() on checkpoint.
- **checkpointsPassed** = Arcade-specific, reset in _initArcadeState.
- **Bug:** levelsCompleted is not reset, so carCount grows across runs.

---

## 4. Fixes Applied

- [x] **initCars:** Remove old car elements from DOM before `this.cars = []`.
- [x] **Arcade startGame:** Reset `levelsCompleted = 0` before super so initCars uses correct count.
- [x] **startGame:** Reset `carIdCounter = 0` per run.
