# Freeway Escape — Full Codebase Audit

**Scope:** `zGAMES/FreewayEscape/Prototype3/client`  
**Code reviewed:** `game.js`, `game.backup.js`, `constants.js`, `Car.js`, `Road.js`, `style.css`, `index.html`  
**Existing audits:** TRAFFIC_STATE_AUDIT, GAME_LOOP_AUDIT, TRAFFIC_FLOW_AUDIT

---

## 1. Traffic System

### 1.1 Spawn Paths

| Path | Location | Purpose | Notes |
|------|----------|---------|-------|
| **initCars** | game.backup.js | Initial spawn on first game start | Uses `levelsCompleted` for count; Arcade resets this before super.startGame() |
| **_respawnCarsForNewRun** | game.js | Fresh run spawn | Positions 22–56, min separation; called after startGame when carsInitialized=false |
| **_escalateTraffic** | game.js | Add cars after checkpoint | Target = AI_BASE_COUNT + checkpointsPassed; spawns at 42–62 |
| **_trafficRespawn** | game.backup.js | Recycle cars behind player | 1 respawn/frame, 5s cooldown; spawns 38–58 ahead |
| **_trafficRecoverAfterCrash** | game.backup.js | Move hit car ahead | Only marks cars in rows playerRow±1 as _trafficCrashApplied |

### 1.2 State Transitions

- **Normal:** Car ahead → pass → `passed` or `trafficWideCleared` → behind → respawn.
- **Crash:** Hit car moved ahead; cars in collision rows get `_trafficCrashApplied`; others get flags reset.
- **Checkpoint:** `_escalateTraffic` adds cars; `trafficGraceUntil` blocks traffic for 2s.

### 1.3 Edge Cases & Race Conditions

| ID | Issue | Severity | Recommendation |
|----|-------|----------|----------------|
| T1 | **_respawnCarsForNewRun** uses `baseOffsets[i % 4]` but can have 4–10 cars | Low | Extend offsets for 10 cars |
| T2 | **_escalateTraffic** fallback `pos = (50 + i * 12) % N` can overlap on N=50 | Medium | Use `_isSegmentClear` in fallback |
| T3 | **initRoad** runs after initCars in init() and removes car elements | Low | Documented; startGame re-inits cars |
| T4 | **car.pos** is segment index (0..N-1); wrap uses `% N` — correct for circular track | — | OK |
| T5 | **RESPAWN_COOLDOWN_MS = 5000** vs **TRAFFIC_GRACE_MS = 2000** | Low | Grace ends before cooldown; acceptable |

### 1.4 N = 50 vs 70

- `N = window.innerWidth > 768 ? 70 : 50`
- `drawDistance = floor(N/2)` → 35 (desktop) or 25 (mobile)
- `_trafficRespawn` uses `minBehind = -(floor(N/2) - 1)` → -34 or -24
- `_isSegmentClear` uses `minSep = 12`; on N=50, wrap distance is 25 — acceptable with current spacing

---

## 2. Game Loop

### 2.1 Update Order (per frame)

```
loop() → delta capped 66ms → update(step)
  ├── step validation (skip if NaN/negative)
  ├── [inGame] input, physics, pos += speed, wrap
  ├── startPos = floor(pos/segL) % N
  ├── updateGameState(step, startPos, endPos)
  │   ├── [Arcade] checkpoint spawn countdown
  │   ├── super: checkpoint/finish, totalDistance, _trafficRespawn, combo
  │   ├── [Arcade] arcadeTimer -= step, game over, checkpoint pass
  │   └── _escalateTraffic on checkpoint pass
  ├── updateSky()
  ├── _trafficRowHits(startPos, startPos)
  ├── drawRoad(startPos, endPos, step)
  └── updateUI()
```

### 2.2 Draw Order

1. Reset `car.wasDrawnThisFrame = false`
2. For each line: applyMapToLine → project → clearSprites → scenery → specials → checkpoint → cars
3. Hide cars with `!wasDrawnThisFrame`

### 2.3 Timing

- **step:** `cappedDelta / 1000` (max ~0.066s)
- **Date.now():** crash recovery, traffic grace, spawnTime, RESPAWN_COOLDOWN
- **timestamp():** lastTime, pauseStartTime

---

## 3. Collision & Scoring

### 3.1 _trafficRowHits Logic

- **Rows:** startPos, startPos±1 (up to 6 segments)
- **playerLaneScaled = playerX * 1.8**
- **dist = |playerLaneScaled - car.lane|**
- **TRAFFIC:** CRASH 0.42, PERFECT 0.52, CLOSE 0.70, NICE 0.85

### 3.2 Near-Miss Thresholds

- CRASH < PERFECT < CLOSE < NICE
- LANE: A=-0.75, B=0, C=0.75
- Center lane (B=0) is safe when |playerX*1.8| < 0.42 → |playerX| < 0.23

### 3.3 Combo System

- **COMBO_WINDOW:** 2.5s
- **Multipliers:** 0→1, 3→2, 6→3, 10→4, 15→6, 20→8
- Combo breaks on crash; reset on checkpoint pass

### 3.4 Crash Recovery

- **CRASH_RECOVERY_MS:** 1600
- **crashDoneThisFrame:** limits to one crash per frame
- **car._trafficCrashApplied:** only set on cars in collision rows
- Hit car teleported to `drawDistance + 18..35` ahead

---

## 4. Difficulty & Pacing

### 4.1 Checkpoint Flow

- **ARCADE_CHECKPOINT_INTERVAL:** 20s
- **ARCADE_CHECKPOINT_BONUS:** 15s
- On pass: +15s, +3000 score, nextLevel(), _escalateTraffic(), combo reset

### 4.2 Traffic Escalation

- Start: AI_BASE_COUNT (4)
- Per checkpoint: +AI_CARS_PER_LEVEL (1), cap AI_MAX_CARS (10)
- After 6 checkpoints: 10 cars

### 4.3 Timer

- **ARCADE_START_TIME:** 45s
- **CRASH_TIME_PENALTY:** 3s

---

## 5. UX & Feel

### 5.1 Hero Size

- **heroSizeAdjustment:** 0.70

### 5.2 Lane Widths

- LANE A=-0.75, B=0, C=0.75
- Lane offset: `car.lane * 2000 * l.scale * halfWidth`

### 5.3 Fade-In

- **game-fade-in:** 0.5s on road at start
- **Car fade-in:** 700ms via `car.getOpacity()`

### 5.4 Visual Feedback

- Crash: overlay, "CRASH!", recovery indicator
- Timer: warning (≤15s), critical (≤5s)
- Combo: pulse, combo-high at 10+
- Score popups: float-up, tier colors

---

## 6. Robustness

### 6.1 NaN Guards

- update(): step validation, speed reset, pos fallback
- updateGameState(): early return if pos/speed/step/totalDistance NaN
- drawRoad(): lines/startPos validation

### 6.2 Null Checks

- roadElement, arcadeTimerEl, etc. checked before use
- `this.cars || []` in _isSegmentClear, _pickLaneForNewCar

### 6.3 Wrap Logic

- **pos:** `while (pos >= trackLength) pos -= trackLength` etc.
- **car.pos / segment:** `((x % N) + N) % N`
- **Distance on ring:** `if (dist > N/2) dist = N - dist`

---

## 7. Fun Factors

### 7.1 Scoring

- Near-miss: PERFECT 500, CLOSE 200, NICE 50
- Speed bonus, boost 2x
- Combo multipliers up to 8x
- Checkpoint: 3000
- Passive: floor(speed/80) per frame

### 7.2 Risk/Reward

- Boost: 2x points, higher speed, harder control
- Close passes: higher tiers, combo building
- Crash: -3s, combo reset

### 7.3 Progression

- Checkpoints: +15s, +1 car, new environment
- Grade: S≥50k, A≥30k, B≥15k, C≥5k, D<5k

---

## 8. Prioritized Action Items

### P0 (Critical)

- None identified; existing fixes (respawn deadlock, crash recovery) are in place.

### P1 (High)

| ID | Action |
|----|--------|
| 1 | Add `_isSegmentClear` check in _escalateTraffic fallback when pos overlaps |
| 2 | Guard `ASSETS.IMAGE.VEHICLES` in spawn paths |
| 3 | Verify baseMaxSpeed is set before first near-miss |

### P2 (Medium)

| ID | Action |
|----|--------|
| 4 | Extract `_wrapSegment(x)`, `_getPlayerLane()` helpers |
| 5 | Add RESPAWN_MIN_AHEAD, RESPAWN_MAX_AHEAD, CAR_HIDE_BEHIND_SEGMENTS constants |
| 6 | Remove duplicate boost timer decrement from updateGameState |
| 7 | Extend _respawnCarsForNewRun baseOffsets for 10 cars |

### P3 (Low)

| ID | Action |
|----|--------|
| 8 | Align game-fade-in and car fade durations |
| 9 | Consider checkpoint pass transition effect |
| 10 | ~~Add "perfect sector" or streak bonuses~~ ✅ DONE: CLEAN_SECTOR_BONUS = 500 |

---

## 11. Implemented (This Audit)

- **Constants:** RESPAWN_MIN_AHEAD, RESPAWN_MAX_AHEAD, CAR_HIDE_BEHIND_SEGMENTS, PLAYER_LANE_THRESHOLD, CLEAN_SECTOR_BONUS
- **VEHICLES guard:** initCars, _escalateTraffic, _trafficRespawn
- **_escalateTraffic fallback:** Uses _isSegmentClear in fallback loop
- **_respawnCarsForNewRun:** Extended baseOffsets for 10 cars
- **Boost timer:** Removed duplicate decrement from updateGameState
- **Clean sector bonus:** +500 score when passing checkpoint without crashing

---

## 9. Code Simplification & Intent

### 9.1 Magic Numbers to Extract

| Value | Location | Suggestion |
|-------|----------|------------|
| 0.42 | _trafficRespawn player lane threshold | `PLAYER_LANE_THRESHOLD` |
| 2000 | Lane offset multiplier | `LANE_PIXEL_MULTIPLIER` |
| 38, 58 | Respawn distance range | `RESPAWN_MIN_AHEAD`, `RESPAWN_MAX_AHEAD` |
| -28 | Car hide threshold | `CAR_HIDE_BEHIND_SEGMENTS` |

### 9.2 Intentional Simplifications

- **checkLevelCompletion()** overridden as no-op in Arcade — intentional
- **endPos** unused in draw — iterate full N
- **init() cars** orphaned by initRoad — startGame re-inits; acceptable
