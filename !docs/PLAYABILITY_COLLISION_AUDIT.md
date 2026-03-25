# Freeway Escape — Playability & Collision Audit

**Scope:** Full player journey, collision flow, and why "nothing is right after" a crash.

---

## 1. Per-frame game loop (order)

```
update(step)
├── [if inGame] steering, accel, boost → playerX, speed
├── [if inGame] pos += speed, wrap
├── [if inGame] playerX clamp (±0.95)
├── startPos = floor(pos/segL) % N
├── updateGameState(step, startPos, endPos)
│   ├── [Arcade] checkpoint spawn countdown
│   ├── super: newPos = pos + speed*step, pos = newPos % roadLen
│   ├── super: _trafficRespawn(playerSeg)
│   ├── [Arcade] timer -= step, game over check
│   └── [Arcade] checkpoint pass detection
├── drawRoad(startPos, endPos)
│   └── cars drawn when carSegment === lineSegment; wasDrawnThisFrame = true
├── _trafficRowHits(startPos, rowPhys)  ← collision / near-miss
└── updateUI
```

---

## 2. Critical bug: double position update

**Outer loop (update):** `this.pos += this.speed` (line ~697)  
**Inner loop (updateGameState):** `newPos = this.pos + this.speed * step`; `this.pos = newPos % roadLen`

- `pos` is advanced twice per frame: once by `speed`, once by `speed * step`.
- `startPos` is derived from the outer update; `rowPhys` from the inner.
- Result: `startPos` and `rowPhys` can disagree; collision rows may not match what’s drawn.

**Fix:** Use a single position update. Either remove the outer `pos += speed` and derive `startPos` after `updateGameState`, or remove the inner update and keep only the outer (with `pos += speed * step`).

---

## 3. Collision flow (_trafficRowHits)

| Step | Logic |
|------|-------|
| Rows | `rows = {startPos±1, rowPhys±1}` (up to 6 segment indices) |
| Eligible cars | `carSeg in rows` |
| Crash | `|playerX*1.8 - car.lane| <= 1.12` → honk, speed→hitSpeed, combo break, onCollision(), _trafficRecoverAfterCrash |
| Near-miss | Else if not passed: PERFECT/CLOSE/NICE bands → score, `passed=true` |
| Wide | Else → `trafficWideCleared=true` only |

---

## 4. Post-crash recovery (_trafficRecoverAfterCrash)

| Action | Target |
|--------|--------|
| Teleport | Hit car → `anchor + drawDistance + 12..33` segments ahead, random lane/vehicle |
| Reset flags | **All** cars: `passed`, `trafficWideCleared`, `_trafficCrashApplied` |

**Issue:** Resetting `_trafficCrashApplied` on all cars makes cars still in the same row as the player eligible for crash again on the next frame. The player is still in the same lane; nearby cars are still there. Result: immediate second crash, then possibly more.

---

## 5. "Nothing is right after" — likely causes

1. **Chain crashes:** Recovery clears `_trafficCrashApplied` on nearby cars → next frame hits another car → repeated crashes.
2. **Double pos update:** `startPos` vs `rowPhys` mismatch → collision checks wrong rows or misses hits.
3. **Traffic respawn:** After recovery, flags are cleared; cars that were behind no longer have `passed`/`trafficWideCleared`, so respawn logic changes and traffic can feel wrong.

---

## 6. Fixes applied

### A. Single position update (DONE)
- Removed `pos += speed` from the outer loop.
- `updateGameState` is the only place that updates `pos`.
- `startPos` is computed after `updateGameState`; `_trafficRowHits(startPos, startPos)` uses the same segment.

### B. Safer recovery (DONE)
- Cars within 3 segments of the player row get `_trafficCrashApplied = true` so they don't trigger chain crashes.
- Cars further away get flags reset as before (for respawn).

---

## 7. Lane / segment alignment

- `car.pos` = segment index (0..N-1).
- `playerX` = lateral position (-0.95..0.95).
- Crash: `|playerX*1.8 - car.lane| <= 1.12`.
- Lanes: A=-0.75, B=0, C=0.75.

---

## 8. Verification checklist

- [ ] Single pos update; no double advance.
- [ ] startPos and rowPhys consistent.
- [ ] No chain crashes after recovery.
- [ ] Honk + speed drop on first crash.
- [ ] Hit car teleports ahead; others stay put.
- [ ] Traffic respawn still works after crash.
