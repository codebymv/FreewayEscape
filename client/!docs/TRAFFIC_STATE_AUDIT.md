# Traffic State & Flow Audit

## Problem
After collision: traffic stops being dynamic, repeats on loop, no cars can be passed.

## Root Cause: Respawn Deadlock

### The Bug
1. **On crash**, `_trafficRecoverAfterCrash` sets `_trafficCrashApplied = true` on ALL cars within 3 segments of the player.
2. **Collision check** only processes cars in rows (playerRow, playerRow±1) — 3 segments.
3. **Cars behind** (playerRow-2, playerRow-3) get `_trafficCrashApplied` but are NEVER in the collision check — we only check rows as we move forward.
4. **We never set** `passed` or `trafficWideCleared` for those cars.
5. **Respawn requires** `(car.passed || car.trafficWideCleared)` — so we NEVER respawn those cars.
6. **Result**: Cars accumulate "stuck" behind the player. Pool of respawnable cars shrinks. Traffic becomes sparse/repeating.

### State Variables
| Variable | Set When | Cleared When | Purpose |
|----------|----------|--------------|---------|
| `car.passed` | Near-miss scored (PERFECT/CLOSE/NICE) | Respawn, crash recovery (other cars) | Car was scored, can respawn when behind |
| `car.trafficWideCleared` | dist > NICE (too far to score) | Respawn, crash recovery | Car was "passed" wide, can respawn |
| `car._trafficCrashApplied` | Crash into car, or car in nearbyRadius during crash | Respawn only | Prevents chain crash; BLOCKS respawn if never cleared |
| `crashRecoveryUntil` | On crash | After CRASH_RECOVERY_MS | No collision during recovery |
| `trafficGraceUntil` | Start game, checkpoint pass | After TRAFFIC_GRACE_MS | No traffic draw/collision/respawn |

### Flow
1. **Normal**: Car ahead → player passes → `passed` or `trafficWideCleared` → car goes behind → respawn
2. **Crash**: Hit car moved ahead; nearby cars get `_trafficCrashApplied`; cars BEHIND never get `passed`/`trafficWideCleared` → stuck forever

## Fix
- **Respawn**: When `distanceFromPlayer <= minBehind` (34+ segments behind), respawn regardless of `passed`/`trafficWideCleared`. Car is definitely behind us.
- **Recovery**: Only set `_trafficCrashApplied` on cars in the actual collision rows (playerRow, playerRow±1), not the wider 3-segment radius.
