// Number prototype extensions
Number.prototype.pad = function (numZeros, char = 0) {
  let n = Math.abs(this);
  let zeros = Math.max(0, numZeros - Math.floor(n).toString().length);
  let zeroString = Math.pow(10, zeros)
    .toString()
    .substr(1)
    .replace(0, char);
  return zeroString + n;
};

Number.prototype.clamp = function (min, max) {
  return Math.max(min, Math.min(this, max));
};

// Utility functions
// Monotonic high-resolution clock. All call sites use this as a delta, so the
// non-epoch base is irrelevant; performance.now() avoids a per-frame Date allocation
// and is immune to system-clock changes.
export const timestamp = () => performance.now();
export const accelerate = (v, accel, dt) => v + accel * dt;
export const isCollide = (x1, w1, x2, w2) => (x1 - x2) ** 2 <= (w2 + w1) ** 2;

export function getRand(min, max) {
  return (Math.random() * (max - min) + min) | 0;
}

export function randomProperty(obj) {
  let keys = Object.keys(obj);
  return obj[keys[(keys.length * Math.random()) << 0]];
}

export function drawQuad(element, layer, color, x1, y1, w1, x2, y2, w2) {
  if (
    !element ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(w1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(w2) ||
    w1 <= 0 ||
    w2 <= 0 ||
    y1 <= y2 + 0.5
  ) {
    if (element) element.style.display = 'none';
    return false;
  }

  element.style.display = 'block';
  element.style.zIndex = layer;
  element.style.background = color;
  element.style.top = y2 + `px`;
  element.style.left = x1 - w1 / 2 - w1 + `px`;
  element.style.width = w1 * 3 + `px`;
  element.style.height = y1 - y2 + `px`;

  let leftOffset = w1 + x2 - x1 + Math.abs(w2 / 2 - w1 / 2);
  element.style.clipPath = `polygon(${leftOffset}px 0, ${
    leftOffset + w2
  }px 0, 66.66% 100%, 33.33% 100%)`;
  return true;
}

export function sleep(ms) {
  return new Promise(function (resolve, reject) {
    setTimeout((_) => resolve(), ms);
  });
}
