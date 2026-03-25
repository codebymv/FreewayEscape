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
  }

  project(camX, camY, camZ) {
    this.scale = camD / (this.z - camZ);
    this.X = (1 + this.scale * (this.x - camX)) * halfWidth;
    this.Y = Math.ceil(((1 - this.scale * (this.y - camY)) * height) / 2);
    this.W = this.scale * roadW * halfWidth;
  }

  clearSprites() {
    // Force clear only sprite elements (8-15), not road quads (0-5)
    // Elements 6-7 are used for sidewalk/beach zones in coastal level
    for (let i = 8; i < this.elements.length; i++) {
      let e = this.elements[i];
      e.style.background = "transparent";
      e.style.backgroundImage = "none";
      e.style.display = "none";
    }
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

    let obj = layer instanceof Element ? layer : this.elements[layer + 6];
    obj.style.display = "block"; // Re-enable display when drawing
    obj.style.background = `url('${sprite.src}') no-repeat`;
    obj.style.backgroundSize = `${destW}px ${destH}px`;
    obj.style.left = destX + `px`;
    obj.style.top = destY + `px`;
    obj.style.width = destW + `px`;
    obj.style.height = destH + `px`;
    obj.style.zIndex = depth;
  }
}
