# Freeway Escape — Traffic, Spawning & Game Loop Audit

**Scope:** Player car ↔ traffic interactions, all spawn paths, full loop with scenario walkthroughs.  
**Code:** `client/src/core/game.backup.js`, `game.js`, `config/constants.js`.

---

## 1. Coordinate systems (critical context)

| Concept | Meaning |
|--------|---------|
| **`this.pos`** | Player distance along track. **Outer loop:** `+= speed` then wrap to **`map.trackLength`** (~4k tropical). **Inner (`updateGameState`):** `= (pos + speed*step) % road.length`** (~4070). Two wrap lengths can diverge slightly. |
| **`startPos`** | `floor(this.pos / segL) % N` — which **ring segment index** (0…N−1) is at the **camera / player row** for drawing. `segL = 200`, **N = 70** (desktop) or **50** (mobile). |
| **`car.pos`** | Integer **segment index** on same ring (0…N−1). Traffic is **stationary** in that ring; the world scrolls past them. |
| **`playerX`** | Lateral position (−0.95…0.95 after clamp). **Steering** updates it **before** traffic checks; **clamp runs after** `_trafficRowHits` (same frame uses pre-clamp X). |
| **Lane test** | `playerLaneScaled = playerX * 1.8` vs `car.lane` ∈ {−0.75, 0, 0.75}. **`TRAFFIC.CRASH` / PERFECT / CLOSE / NICE** are thresholds on **`|scaled − lane|`**. |

---

## 2. Per-frame game loop (order matters)

**When `inGame && !paused`, each frame:**

1. **Level select / coin** (if applicable).
2. **If `inGame`:**
   - Curve assist → **`playerX`**
   - Steer (A/D, arrows)
   - Accel / brake / coast → **`speed`** (capped, boost)
   - **`_collisionPosFrameStart`** (mostly legacy anchor; traffic no longer sweeps on it)
   - **`pos += speed`**, wrap **`trackLength`**
   - **`startPos` / `endPos`** from **`pos`**
3. **`updateGameState(step, startPos, endPos)`**
   - **Arcade (`game.js`):** timer, game-over early **return** (skips inner pos + respawn that frame), checkpoint spawn, **`super.updateGameState`**
   - **Base:** checkpoints, finish line, **`this.pos = (pos + speed*step) % road.length`**, passive score, combo, boost UI, **`_trafficRespawn(playerSeg)`** only
4. **`updateSky()`**
5. **`drawRoad(startPos, …)`** — builds pseudo-3D; sets **`car.wasDrawnThisFrame`**
6. **`_trafficRowHits(startPos, rowPhys)`** — **all crash / near-miss / wide** for traffic
7. **`updateUI`**
8. **After `inGame` block:** **`playerX.clamp(±0.95)`**, off-road speed penalty if **|playerX| > 0.75**

**Implications**

- Collision uses **pre-clamp `playerX`** (usually negligible).
- **`startPos`** is from **pre–inner-modulo `pos`**; **`rowPhys`** from **post-inner `pos`**. Rows checked = **startPos, rowPhys, each ±1** (7 segment indices max).
- **Arcade game-over frame:** no inner pos update, no respawn; draw + traffic may still run with stale state (edge).

---

## 3. Spawning — every path

### 3.1 `initCars()` (base, first-time or full re-init)

- **When:** `startGame` if `!carsInitialized`, or constructor path with `carsInitialized` false.
- **Count:** `min(AI_BASE_COUNT + levelsCompleted * AI_CARS_PER_LEVEL, AI_MAX_CARS)` → **4…10**.
- **Segment `car.pos`:** From pools **30, 38, 46, 54, 62** ± ~10 random, `% N` — **far ahead** on ring.
- **Lane:** Spread across A/B/C; avoids **duplicate lane at same base distance**; falls back to least-used in nearby distances.
- **Flags:** `passed=false`, `_trafficCrashApplied=false`, `trafficWideCleared=false`, unique `id`.

### 3.2 Arcade `_respawnCarsForNewRun()` (every new run)

- **After** `super.startGame()` → **`initCars`** then this **overwrites** positions.
- **Segments:** `8 + i*5 + rand(0–3)` — **closer** than initCars (8…~30 ahead).
- **Lane / type:** Random per car.
- **Resets** all traffic flags.

### 3.3 `_trafficRespawn()` (continuous recycle)

- **When:** `distanceFromPlayer < -6` (ring-normalized “behind” player) **and** (`passed` **or** `trafficWideCleared`).
- **New `car.pos`:** Ahead of player: **`drawDistance + 5…+35`** (tries 3 candidates), pick least conflict with other cars within **25 segments**.
- **Lane:** Prefers lanes **not** occupied nearby; **~58%** of spawns **block player’s current lane** (steer > ±0.3 → A/C/B); **~42%** allow player lane.
- **Resets** flags + new vehicle sprite.

### 3.4 Arcade `_escalateTraffic()` (checkpoint passed)

- **Adds** cars until count = `AI_BASE_COUNT + checkpointsPassed * AI_CARS_PER_LEVEL` (cap 10).
- **Spawn segment:** random **40…59** on ring.
- **Lane / type:** Random.

### 3.5 `_trafficRecoverAfterCrash(hitCar, anchorSeg)` (on crash)

- **Hit car:** Teleported to **`anchor + drawDistance + 12…33`** segments, random lane & vehicle; flags cleared.
- **All other cars:** `passed`, `trafficWideCleared`, `_trafficCrashApplied` **cleared**.

### 3.6 Level change (`nextLevel`)

- **`car.passed = false`** for all (plus wide/crash flags cleared in current code paths).

---

## 4. Player ↔ traffic interactions (`_trafficRowHits`)

**Eligible cars:** `carSeg` in **{startPos±1, rowPhys±1}** (union).

| Condition | Effect |
|-----------|--------|
| **`|playerX*1.8 − car.lane| ≤ TRAFFIC.CRASH` (1.12)** | **Crash** (max **once per frame** total): honk, speed → `hitSpeed`, combo break, shake, **`onCollision()`** (Arcade: −3s timer), then **`_trafficRecoverAfterCrash`**. |
| Else if **`car.passed`** | Skip scoring. |
| Else **≤ PERFECT (1.28)** | Near-miss PERFECT, score, combo+, **`passed=true`**. |
| Else **≤ CLOSE (1.5)** | CLOSE tier. |
| Else **≤ NICE (1.72)** | NICE tier. |
| Else | **`trafficWideCleared=true`** only (no `passed`). |

**Notes**

- **Floating popups** for near-miss use **`car.wasDrawnThisFrame`** and **`lines[carPosFloor % N]`** — can miss if line index doesn’t match draw buffer.
- **Same frame:** second crash suppressed via **`crashDoneThisFrame`** after first hit.

---

## 5. Scenario walkthroughs

### A — First launch → menu → start run (Arcade)

1. **Init:** `initCars` (4 cars, far segments) → **Arcade** `_respawnCarsForNewRun` (8…~25 ahead).
2. **Play:** Loop runs; **respawn** pulls cars behind forward when **>6 segments** back and wide/passed.
3. **Near-miss:** Thread lanes → PERFECT/CLOSE/NICE → **`passed`** until behind or recycled.

### B — Clean near-miss chain, no crash

1. Same row, lateral in NICE…PERFECT bands → score + combo.
2. Car **`passed=true`** → no re-score until respawn.
3. When player passes them on ring (**distance < -6** + passed), **respawn** ahead.

### C — Single crash

1. **CRASH** → penalties + **`_trafficRecoverAfterCrash`**.
2. **Struck car** jumps far ahead; **all others** reset flags → pack behaves “fresh.”
3. Next frames: normal traffic again.

### D — Pile-up (two cars same row)

1. **First** car in loop order triggers crash + recovery; **`crashDoneThisFrame`** blocks second crash same frame.
2. Recovery **resets** other car — may still be visually close next frame → possible **second crash** next frame (acceptable).

### E — Wide pass then re-approach

1. **Wide** → `trafficWideCleared` only.
2. **Respawn** when **>6 behind**; until then can still **crash** if steering into lane (crash checked before `passed`).

### F — Checkpoint (Arcade)

1. **`_onCheckpointPassed`:** `nextLevel`, **`pos=0`**, **`nextLevel`** resets **`passed`** on all cars, **adds** car(s), new checkpoint countdown.
2. **Traffic** denser over time (up to 10 cars).

### G — Timer hits 0

1. **`updateGameState`** returns **before** `super` → **no** inner `pos` update, **no** `_trafficRespawn` that frame.
2. **`inGame=false`**; next **`startGame`** full **init** + **`_respawnCarsForNewRun`**.

### H — Pause / menu reset

1. **`reset()`** clears **`passed` / wide / crash** on all cars (among other UI state).
2. New run from level select → fresh Arcade flow.

### I — Short track (~4k) vs N=70

1. Only **~20** distinct segment indices per lap before **track** wrap; ring has **70** slots.
2. **Respawn −6** is tuned for short laps so cars recycle instead of sticking.
3. **Risk:** ring math “ahead/behind” can feel counterintuitive at wrap boundaries.

### J — Boost + high speed

1. Near-miss points scale with speed (and 2× if boosting).
2. **Collision** still **row-based**; no extra tunneling sweep beyond ±1 segment rows.

---

## 6. Risks & gaps (audit findings)

| ID | Risk |
|----|------|
| R1 | **`trackLength` ≠ `road.length`** → occasional **segment** mismatch between **draw startPos** and **physics `pos`**. Mitigated by **±1 row** + **rowPhys**. |
| R2 | **`playerX` clamp after traffic** → boundary edge case. |
| R3 | **Near-miss popup** depends on **`wasDrawnThisFrame`** / line index — may not show even when score applies. |
| R4 | **Game-over frame** skips physics step once — one-frame inconsistency. |
| R5 | **initCars** runs **before `buildRoadFromMap`** in `startGame` — log shows `Track length: 0`; cars still valid. |
| R6 | **Escalation spawn** 40–59 **ignores** roadblock spacing (unlike `initCars`). |
| R7 | **Single crash / frame** — second overlapping car same frame no extra penalty (by design). |

---

## 7. File map

| Behavior | Location |
|----------|----------|
| Main loop | `game.backup.js` → `update()` |
| Inner pos, respawn | `updateGameState()` |
| Row collision + recovery | `_trafficRowHits`, `_trafficRecoverAfterCrash` |
| Respawn recycle | `_trafficRespawn` |
| Init spawn | `initCars` |
| Arcade run start | `game.js` → `startGame`, `_respawnCarsForNewRun` |
| Checkpoint / timer / game over | `game.js` → `updateGameState`, `_onCheckpointPassed`, `_triggerGameOver` |
| Constants | `constants.js` → `TRAFFIC`, `LANE`, `AI_*`, `ARCADE_*` |

---

## 8. Post-fix verification checklist

After implementing R1–R6, manually verify:

- [ ] **Wrap boundary:** Drive a full lap; `pos` wraps cleanly, no segment jump or traffic glitch at wrap.
- [ ] **Game-over last frame:** Let timer hit 0; physics runs that frame (no desync), results screen appears.
- [ ] **Popup on off-screen near-miss:** Near-miss when car not drawn (edge case) still shows floating score at HUD fallback.
- [ ] **Checkpoint +1 car lane spread:** Pass checkpoint; new car uses roadblock-aware lane (no triple-lane wall).
- [ ] **Clamp before traffic:** Steering to boundary; collision matches visual (no ghost overlap at ±0.95).

---

*Generated as a static audit; re-run after major traffic refactors.*
