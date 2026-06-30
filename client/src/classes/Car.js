export class Car {
  constructor(pos, type, lane, spawnTime = 0) {
    this.pos = pos;
    this.type = type;
    this.lane = lane;
    this.initialLane = lane;
    // DOM sprite wrapper only. TrafficWorld owns gameplay position and lifecycle.
    
    // Visual telegraph: track spawn time for fade-in (reduces snap/pop on respawn/recovery)
    this.spawnTime = spawnTime;
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
  getOpacity(nowMs = 0) {
    const elapsed = nowMs - this.spawnTime;
    if (elapsed >= this.fadeInDuration) return 1.0;
    return Math.max(0, Math.min(1.0, elapsed / this.fadeInDuration));
  }
}
