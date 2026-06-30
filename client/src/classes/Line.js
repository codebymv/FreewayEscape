import { height, halfWidth, roadW, camD } from '../config/constants.js';

export class Line {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;

    this.X = 0;
    this.Y = 0;
    this.W = 0;

    this.curve = 0;
    this.scale = 0;

    this.elements = [];
    this.special = null;

    // Sprite-slot indices (8+) drawn since the last clearSprites(), so we only reset
    // what was actually used instead of all 8 slots every frame.
    this.dirtySprites = [];
    this.drawnSprites = new Set();
    this.spriteFrameId = 0;

    // Screen-Y of the nearest hill crest occluding this row (set per-row by drawRoad).
    // Sprites are clipped/hidden at this line so distant scenery can't show through a hill.
    this.spriteClipY = Infinity;
  }

  project(camX, camBaseH, camZ, camElevation = 0, heightGain = 1) {
    this.scale = camD / (this.z - camZ);
    this.X = (1 + this.scale * (this.x - camX)) * halfWidth;
    // Elevation is measured relative to the camera's own row and amplified by heightGain,
    // so the road *ahead* visibly climbs/descends while the row under the camera stays put
    // (and camBaseH — the eye height — never swings). With camElevation=0 and heightGain=1
    // this reduces exactly to the original `this.y - camBaseH` projection.
    const elevation = (this.y - camElevation) * heightGain;
    // Keep Y sub-pixel (no rounding). At slow speed the road's vertical position changes by
    // a fraction of a pixel per frame; rounding to whole pixels makes it sit still then jump
    // ("increments"), worst on inclines where the height gain amplifies it. Fractional Y lets
    // the browser sub-pixel-position the road quads so the surface glides. Sprites round their
    // own destX/destY in drawSprite(), so they stay crisp.
    this.Y = ((1 - this.scale * (elevation - camBaseH)) * height) / 2;
    this.W = this.scale * roadW * halfWidth;
  }

  beginSpriteFrame(frameId) {
    this.spriteFrameId = frameId;
    this.drawnSprites.clear();
  }

  clearSprites() {
    // End-of-row cleanup: hide sprite slots that were active on prior frames but
    // were not redrawn this frame. Keep image URLs cached so scenery does not
    // flicker from clearing/reloading background images every frame.
    const stillActive = [];
    for (let k = 0; k < this.dirtySprites.length; k++) {
      const slot = this.dirtySprites[k];
      if (this.drawnSprites.has(slot)) {
        if (!stillActive.includes(slot)) stillActive.push(slot);
        continue;
      }
      const e = this.elements[slot];
      if (!e) continue;
      e.style.display = "none";
    }
    this.dirtySprites = stillActive;
  }

  drawSprite(depth, layer, sprite, offset) {
    let destX = this.X + this.scale * halfWidth * offset;
    let destY = this.Y + 4;
    let destW = (sprite.width * this.W) / 265;
    let destH = (sprite.height * this.W) / 265;

    // Center-anchor support for wide sprites (e.g., finish line banner)
    if (sprite.centered || sprite.anchor === 'center') {
      destX -= destW / 2;
    } else {
      destX += destW * offset;
    }
    destY += destH * -1;
    destX = Math.round(destX);
    destY = Math.round(destY);
    destW = Math.max(1, Math.round(destW));
    destH = Math.max(1, Math.round(destH));

    const slot = layer instanceof Element ? null : layer + 6;
    let obj = layer instanceof Element ? layer : this.elements[slot];
    if (!obj) return;

    // Horizon occlusion: clip the sprite at the nearest hill crest (spriteClipY). destY is
    // the sprite TOP; its base sits on the road at destY+destH. Anything below the crest line
    // is hidden behind the hill — fully if the whole sprite is below it, otherwise show only
    // the portion poking above (clip the bottom by shrinking the element height).
    let renderH = destH;
    const clipY = this.spriteClipY;
    if (Number.isFinite(clipY) && destY + destH > clipY) {
      if (destY >= clipY) {
        obj.style.display = "none";
        return; // entirely behind the crest
      }
      renderH = Math.max(1, Math.round(clipY - destY));
    }

    // Track sprite-slot use so clearSprites() only resets what was drawn. Banner
    // elements passed as an Element are managed by the caller, so don't track them.
    if (slot != null) {
      this.drawnSprites.add(slot);
      if (!this.dirtySprites.includes(slot)) this.dirtySprites.push(slot);
    }
    obj.style.display = "block"; // Re-enable display when drawing
    if (obj.dataset.spriteSrc !== sprite.src) {
      obj.style.backgroundImage = `url('${sprite.src}')`;
      obj.style.backgroundRepeat = 'no-repeat';
      // Vector (SVG) sprites re-rasterize every frame as they scale; nearest-neighbor
      // (#road * uses image-rendering:pixelated) makes their smooth edges crawl/shimmer.
      // Let SVGs scale smoothly so they stay stable; keep PNG pixel art crisp.
      obj.style.imageRendering = sprite.src.endsWith('.svg') ? 'auto' : 'pixelated';
      obj.dataset.spriteSrc = sprite.src;
    }
    obj.style.backgroundSize = `${destW}px ${destH}px`;
    obj.style.left = `${destX}px`;
    obj.style.top = `${destY}px`;
    obj.style.width = `${destW}px`;
    obj.style.height = `${renderH}px`; // clipped to the visible portion above the crest
    obj.style.zIndex = depth;
  }
}
