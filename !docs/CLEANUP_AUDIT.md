# Freeway Escape — Cleanup Audit

**Purpose:** Verify all cleanups are correctly implemented and consistent with the gameplay loop.

---

## 1. Per-frame loop order (canonical)

```
update(step)
├── [if inGame] steering, accel, boost → playerX, speed
├── [if inGame] pos += speed, wrap via _getTrackWrapLength()
├── [if inGame] playerX clamp (±0.95)
├── [if inGame] startPos = floor(pos/segL) % N
├── [if inGame] updateGameState(step, startPos, endPos)
│   ├── [Arcade] checkpoint spawn countdown
│   ├── super: checkpoint/finish, totalDistance, _trafficRespawn
│   ├── [Arcade] timer -= step, game over if <= 0
│   └── [Arcade] checkpoint pass detection
├── [if inGame] drawRoad(startPos, endPos)
├── [if inGame && aiEnabled] _trafficRowHits(startPos, startPos)
└── [if inGame] updateUI
```

---

## 2. Cleanup checklist

| ID | Cleanup | Status | Verification |
|----|---------|--------|--------------|
| R1 | **_getTrackWrapLength** | OK | Outer wrap uses it; `map.trackLength` synced in buildRoadFromMap |
| R2 | **Clamp before traffic** | OK | playerX clamped at start of inGame block, before updateGameState/draw |
| R3 | **Near-miss popup fallback** | OK | Hero/roadElement rect or constants fallback when line missing |
| R4 | **Arcade game-over order** | OK | super.updateGameState first, then timer, then game over |
| R5 | **initCars after road** | OK | buildRoadFromMap → initCars in startGame |
| R6 | **_pickLaneForNewCar in escalation** | OK | _escalateTraffic uses it for lane selection |
| — | **totalTime export** | OK | constants.js exports it |
| — | **Traffic spawn spread** | OK | _respawnCarsForNewRun uses spawnBand [18,28,38,48,58,…] |
| — | **Respawn: 1/frame, cooldown, -12** | OK | respawnedThisFrame, RESPAWN_COOLDOWN_MS, distanceFromPlayer < -12 |
| — | **Recovery chain crash** | OK | Nearby cars get _trafficCrashApplied = true in _trafficRecoverAfterCrash |
| — | **Position: pos += speed** | OK | Outer adds speed; updateGameState uses newPos = this.pos (no double-add) |
| — | **Crash UX** | OK | Overlay, CRASH! text, recovery grace, RECOVERING indicator |

---

## 3. Data flow checks

### Position
- **Outer:** `pos += speed` then wrap with `_getTrackWrapLength()`
- **updateGameState:** `newPos = this.pos` (already updated); no `pos = newPos % roadLen`
- **Finish line:** `oldNorm` from `lastValidPos`, `newNorm` from `newPos` — correct crossing detection

### Segment indices
- **startPos** = `floor(pos/segL) % N` — computed after pos update
- **_trafficRowHits(startPos, startPos)** — same segment for draw and physics (no drift)

### lastValidPos
- Set to `this.pos` **before** `pos += speed` (old pos for finish-line oldNorm)
- Overwritten with new pos in validate block for next-frame recovery

---

## 4. Edge cases

| Scenario | Expected | Notes |
|----------|----------|-------|
| Game over frame | Physics runs (super first), then timer check | R4 |
| Crash during recovery | N/A — _trafficRowHits returns early | crashRecoveryUntil |
| Multiple cars same row | First crash processed; nearby get _trafficCrashApplied | Prevents chain |
| Road not built | _getTrackWrapLength falls back to map.trackLength | R1 |
| NaN pos/speed | updateGameState returns early; validate block restores | Defensive |

---

## 5. Potential issues (none critical)

1. **Recovery + near-miss:** During recovery we skip all _trafficRowHits. Near-misses in that window are not scored. Acceptable — recovery is brief.
2. **Nearby _trafficCrashApplied:** Cars within 3 segments keep it until respawn. When they respawn, they get it cleared. Correct.

---

## 6. Manual verification

- [ ] Drive forward — pos advances
- [ ] Crash — overlay, CRASH!, RECOVERING, no chain crash
- [ ] Near-miss — score popup (car or fallback)
- [ ] Checkpoint pass — +15s, traffic escalates
- [ ] Timer 0 — game over, results screen
- [ ] New run — cars spread, not bunched
