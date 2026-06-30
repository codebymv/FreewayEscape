// Pure math/geometry helpers extracted from the game engine.
// No DOM, no `this`, no game state — safe to unit-test in isolation.

/** FNV-1a hash of a string → unsigned 32-bit int. Used to derive a run seed. */
export function seedFromString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic mulberry32 RNG. Returns a stateful generator so a run can be
 * reproduced from a fixed seed.
 */
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randomInt = (max) => Math.floor(random() * max);
  const pick = (items) => items[randomInt(items.length)];
  return { random, randomInt, pick, seed: state };
}

/** Shrink a rect toward its center by the given width/height factors (0..1). */
export function shrinkRect(rect, widthFactor, heightFactor) {
  const dw = (rect.width * (1 - widthFactor)) / 2;
  const dh = (rect.height * (1 - heightFactor)) / 2;
  return {
    left: rect.left + dw,
    top: rect.top + dh,
    right: rect.right - dw,
    bottom: rect.bottom - dh,
    width: rect.width * widthFactor,
    height: rect.height * heightFactor,
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizedHitbox(hitbox, fallbackWidthFactor = 1, fallbackHeightFactor = 1) {
  if (hitbox && Number.isFinite(hitbox.left) && Number.isFinite(hitbox.right)
    && Number.isFinite(hitbox.top) && Number.isFinite(hitbox.bottom)) {
    const left = clamp01(hitbox.left);
    const right = clamp01(hitbox.right);
    const top = clamp01(hitbox.top);
    const bottom = clamp01(hitbox.bottom);
    if (right > left && bottom > top) {
      return { left, right, top, bottom };
    }
  }

  const widthFactor = clamp01(fallbackWidthFactor);
  const heightFactor = clamp01(fallbackHeightFactor);
  const xInset = (1 - widthFactor) / 2;
  const yInset = (1 - heightFactor) / 2;
  return {
    left: xInset,
    right: 1 - xInset,
    top: yInset,
    bottom: 1 - yInset,
  };
}

export function rectFromNormalizedHitbox(rect, hitbox, fallbackWidthFactor = 1, fallbackHeightFactor = 1) {
  const box = normalizedHitbox(hitbox, fallbackWidthFactor, fallbackHeightFactor);
  const width = rect.width ?? (rect.right - rect.left);
  const height = rect.height ?? (rect.bottom - rect.top);
  const left = rect.left + width * box.left;
  const top = rect.top + height * box.top;
  const right = rect.left + width * box.right;
  const bottom = rect.top + height * box.bottom;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/** Axis-aligned rectangle overlap test. */
export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Rolling-terrain height offset at an absolute track position. Built from integer
 * harmonics of the track length so it's seamless across the start/finish loop and never
 * resets at segment boundaries. Returned value is added to the visual road height only.
 * @param {number} position - distance along the track
 * @param {number} trackLength - total track length (for periodicity)
 * @param {{amplitude:number, secondary?:number, harmonic1?:number, harmonic2?:number}} cfg
 */
export function terrainUndulation(position, trackLength, cfg) {
  if (!cfg || !cfg.amplitude || !trackLength) return 0;
  const nz = ((position % trackLength) + trackLength) % trackLength;
  const phase = (nz / trackLength) * Math.PI * 2;
  return cfg.amplitude * Math.sin((cfg.harmonic1 || 1) * phase)
    + (cfg.secondary || 0) * Math.sin((cfg.harmonic2 || 1) * phase + 0.7);
}
