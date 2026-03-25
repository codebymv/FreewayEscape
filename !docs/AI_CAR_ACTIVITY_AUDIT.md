# AI Car Activity & Interaction Audit

**Purpose:** Identify causes of car snapping/jumping and improve traffic UX.  
**Code:** `game.backup.js`, `game.js`, `Car.js`, `Line.js`, `constants.js`.

---

## 1. Car Position Model

| Concept | Value | Notes |
|---------|-------|-------|
| **car.pos** | Integer segment index 0..N-1 | Circular buffer; cars are stationary in segment space |
| **Player pos** | World units (continuous) | Wraps at road.length |
| **startPos** | floor(pos/segL) % N | Segment at camera row |
| **Visible range** | startPos to startPos+N-1 | All N segments drawn each frame |

**Cars do not move** — the player drives past them. Screen position comes from the line they're drawn on.

---

## 2. All AI Car Touchpoints

### 2.1 Spawning
| Path | When | car.pos | UX risk |
|------|------|---------|---------|
| `initCars()` | First game start | 30–62 ±variation, % N | Far ahead; no snap |
| `_respawnCarsForNewRun()` | Arcade run start | 18–58 band | Overwrites; cars appear immediately |
| `_trafficRespawn()` | Continuous (car behind) | 20–55 ahead | **Snap:** car jumps from behind to ahead |
| `_escalateTraffic()` | Checkpoint passed | 40–59 | **Snap:** new car pops in |
| `_trafficRecoverAfterCrash()` | On crash | anchor+12–34 ahead | **Snap:** hit car teleports |

### 2.2 Drawing
| Step | Location | Logic |
|------|----------|-------|
| Reset | drawRoad start | `car.wasDrawnThisFrame = false` |
| Match | Per-line loop | `carSegment === lineSegment` → draw |
| carSegment | `Math.floor(car.pos) % N` | **Bug:** can be negative if pos negative |
| lineSegment | `n % N` | Always 0..N-1 |
| Position | l.X + laneOffset | Line's projected X/Y + lane |
| Hide | drawRoad end | `!wasDrawnThisFrame` → display:none |

### 2.3 Collision / Near-Miss
| Step | Location | Logic |
|------|----------|-------|
| Rows | `_trafficRowHits` | startPos, startPos±1 |
| carSeg | `(car.pos\|0) % N + N) % N` | Correctly normalized |
| Recovery grace | Before collision | `Date.now() < crashRecoveryUntil` → skip |

### 2.4 Respawn / Recovery
| Action | Effect |
|--------|--------|
| Respawn | car.pos = new segment, spawnTime = now |
| Recovery | hitCar.pos = far ahead, nearby cars get _trafficCrashApplied |
| Fade-in | getOpacity() over 500ms from spawnTime |

---

## 3. Snapping Root Causes

1. **Respawn jump:** Car at segment 5 (behind) → respawn to segment 35 (ahead). Player sees car pop into view.
2. **Recovery jump:** Hit car teleports from player row to far ahead. Visible teleport.
3. **Escalation pop:** New car added at segment 40–59. Appears without fade if spawnTime not set.
4. **carSegment negative:** `Math.floor(car.pos) % N` can be negative in JS; draw uses different normalization than collision.
5. **Line position jitter:** Curve/height smoothing may be too slow; abrupt road changes could cause micro-jumps.

---

## 4. Fixes Implemented

- [x] **F1:** Normalize carSegment in draw: `((Math.floor(car.pos) % N) + N) % N`
- [x] **F2:** Car element: explicit `position:absolute`, `pointer-events:none`, `display:none` init
- [x] **F3:** Respawn band 25–55 ahead; spawnTime set → 700ms fade-in
- [x] **F4:** Recovery: hit car spawns drawDistance+18–38 ahead; spawnTime set
- [x] **F5:** Escalation: new Car() sets spawnTime in constructor
- [x] **F6:** Arcade run start: spawn band 22–56, ±3 variation

---

## 5. Best UX Practices

- **Spawn off-screen:** Respawn/recovery positions should be beyond visible edge when possible.
- **Fade-in:** All new/teleported cars use spawnTime → 500ms fade reduces pop.
- **Consistent segment math:** Use `((x % N) + N) % N` everywhere for segment indices.
- **Single respawn per frame:** Already in place; prevents bunching.
- **Recovery grace:** Prevents chain crashes; player can steer away.
