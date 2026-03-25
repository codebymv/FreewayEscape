export class Car {
  constructor(pos, type, lane) {
    this.pos = pos;
    this.type = type;
    this.lane = lane;
    this.initialLane = lane; // Lock lane for entire level (never changes)
    // Cars are STATIONARY in world space - player drives past them
    
    // Visual telegraph: track spawn time for fade-in (reduces snap/pop on respawn/recovery)
    this.spawnTime = Date.now();
    this.fadeInDuration = 700; // 700ms fade-in for smoother appearance

    const element = document.createElement("div");
    element.style.position = 'absolute';
    element.style.pointerEvents = 'none';
    element.style.display = 'none';
    const roadElement = document.getElementById('road');
    if (roadElement) {
      roadElement.appendChild(element);
    }
    this.element = element;
  }
  
  // Get current opacity based on spawn time (fade-in effect)
  getOpacity() {
    const elapsed = Date.now() - this.spawnTime;
    if (elapsed >= this.fadeInDuration) return 1.0;
    return Math.min(1.0, elapsed / this.fadeInDuration);
  }
}
