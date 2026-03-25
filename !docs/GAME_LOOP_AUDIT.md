# Freeway Escape — Full Game Loop Audit

**Scope:** Entire game loop from init to frame, Arcade mode.  
**Code:** `game.backup.js`, `game.js`, `constants.js`, `Car.js`, `Line.js`.

---

## 1. Startup & Init Order

```
Game constructor
  → init()
    → setupGameElements()
    → initAudio()
    → initCars() [if aiEnabled] — creates cars, appends to #road
    → initRoad() — REMOVES all #road children except hero/cloud (orphans car elements)
    → initHighscore()
    → initLevelSelect()
    → reset()
    → startGameLoop()
```

**Note:** initRoad runs after initCars and removes car elements. Cars from init() are never visible. startGame re-inits cars.

---

## 2. Per-Frame Loop (requestAnimationFrame)

```
loop()
  → delta = now - lastTime, capped to 66ms (15 FPS min)
  → update(step = delta/1000)
  → screen shake update
```

---

## 3. update(step) — Full Frame Flow

### 3.1 Always (paused or not)
- Validate step (skip if NaN/negative)
- Skip rest if `isPaused`
- levelSelectCooldown -= step*1000
- handleLevelSelectInput()
- If !inGame && !inLevelSelect: coin insert → showLevelSelect, return

### 3.2 If inGame — Input & Physics
- **Curve assist:** playerX += curveAssistance (when |curve| > 15)
- **Steering:** A/D → playerX ± steerAmount (with boundary resistance)
- **Accel/brake:** W/S → speed via accelerate()
- **Boost:** Space → isBoosting, boostTimer
- **Speed clamp:** 0..maxSpeed (or boostSpeed)
- **Position:** `pos += speed`, wrap to `_getTrackWrapLength()` (road.length or map.trackLength)
- **playerX clamp:** ±0.95 before traffic
- **pos validation:** fallback to lastValidPos if NaN

### 3.3 If inGame — Game State & Render
- `startPos = floor(pos/segL) % N`
- `endPos = (startPos + drawDistance) % N`
- **updateGameState(step, startPos, endPos)** — see §4
- **updateSky()**
- **drawRoad(startPos, endPos, step)** — see §5
- **_trafficRowHits(startPos, startPos)** — collision/near-miss
- **updateUI(startPos, step)**

### 3.4 After inGame block
- Off-road penalty: if |playerX| > 0.75 → speed *= 0.96

---

## 4. updateGameState (Base + Arcade Override)

### 4.1 Arcade updateGameState Order
1. **Checkpoint spawn:** checkpointCountdown -= step; if ≤0 → _spawnCheckpoint()
2. **super.updateGameState()** — base physics, respawn, score
3. **arcadeTimer -= step**, _updateTimerHUD()
4. **Game over:** if arcadeTimer ≤ 0 → _triggerGameOver(), return
5. **Checkpoint pass:** if near checkpoint → _onCheckpointPassed()

### 4.2 Base updateGameState
- Validate pos, speed, step, totalDistance
- Base checkpoint (stopwatch) — road.checkCheckpoint
- **Finish line** — if road.finishLine exists and crossed → finishCrossed = true (Arcade: finishLine = null)
- totalDistance += speed * step
- **_trafficRespawn(playerSeg)** — recycles cars behind player
- Passive score += floor(speed/80)
- updateComboSystem(step)
- **checkLevelCompletion()** — Arcade overrides to no-op
- Boost UI

---

## 5. drawRoad Flow

- Reset `car.wasDrawnThisFrame = false` for all cars
- Hero scale: perspectiveScale * 0.78
- For n = startPos to startPos+N-1:
  - applyMapToLine(l, lineWorldZ)
  - l.project(camX, camH, camZ)
  - clearSprites
  - Draw scenery (trees, buildings, etc.)
  - Draw specials (finish, checkpoint banners)
  - **If trafficGraceUntil passed:** draw cars where carSegment === lineSegment, hide cars >20 segments behind
- Hide cars with !wasDrawnThisFrame

---

## 6. Traffic System

### 6.1 Guards (no traffic when)
- `!aiEnabled` or `!cars` or `!inGame`
- `Date.now() < crashRecoveryUntil` — no collision
- `Date.now() < trafficGraceUntil` — no draw, no collision, no respawn

### 6.2 Collision (_trafficRowHits)
- Rows: startPos, startPos±1
- `playerLaneScaled = playerX * 1.8`
- `dist = |playerLaneScaled - car.lane|`
- **CRASH** (0.55): speed drop, honk, recovery, _trafficRecoverAfterCrash
- **PERFECT** (0.65), **CLOSE** (0.85), **NICE** (1.0): near-miss score
- Else: trafficWideCleared

### 6.3 Respawn (_trafficRespawn)
- Only when `distanceFromPlayer <= -(N/2-1)` (car at back)
- 1 respawn per frame, 3.5s cooldown per car
- New pos: 25–55 segments ahead

### 6.4 Car Draw
- Skip if `carDist < -20` (hide before respawn)
- Lane offset: `car.lane * 2000 * l.scale * halfWidth`

---

## 7. Coordinate Systems

| Symbol | Meaning |
|--------|---------|
| **pos** | World distance along track, wraps at road.length |
| **startPos** | floor(pos/segL) % N — segment at camera row |
| **car.pos** | Segment index 0..N-1 (stationary) |
| **playerX** | Lateral -0.95..0.95 |
| **LANE** | A=-0.75, B=0, C=0.75 |

---

## 8. Arcade-Specific Flow

### Start Game
- carsInitialized = false, levelsCompleted = 0
- super.startGame() → buildRoadFromMap, initCars, trafficGraceUntil = now+1500
- _initArcadeState()
- _respawnCarsForNewRun() — positions 22–56
- _suppressFinishLine()

### Checkpoint Pass
- trafficGraceUntil = now+1500
- arcadeTimer += 15s
- nextLevel() → changeLevel → buildRoadFromMap, _suppressFinishLine
- pos = 0
- _escalateTraffic()
- Combo reset

### Change Level
- map = genMap(newIndex)
- buildRoadFromMap()
- _suppressFinishLine() (if exists)
- stopwatch.reset(), stopwatch.start()

---

## 9. Potential Issues / Gaps

| ID | Item | Status |
|----|------|--------|
| G1 | initRoad removes car elements from initCars | Cars recreated in startGame; init() cars orphaned but harmless |
| G2 | endPos computed but draw iterates startPos..startPos+N-1 | endPos unused in draw; drawDistance used elsewhere |
| G3 | Base updateGameState boost timer decrement | Duplicated (also in inGame block); harmless |
| G4 | countDown in updateUI | Legacy; Arcade uses arcadeTimer |
| G5 | totalDistance += speed*step in base | pos already advanced in update(); totalDistance is separate running total — correct |

---

## 10. Constants Reference

- N=70 (desktop), segL=200, drawDistance=35
- TRAFFIC: CRASH=0.55, PERFECT=0.65, CLOSE=0.85, NICE=1.0
- trafficGraceUntil: 1500ms after start/checkpoint
- crashRecoveryUntil: 1600ms after crash
