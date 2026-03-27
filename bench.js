const LANE = {
  A: -0.75,
  B: 0.0,
  C: 0.75,
};

const N = 70;
const constants = { N: 70, LANE };

class Game {
  constructor() {
    this.cars = [];
    for (let i = 0; i < 10; i++) {
      this.cars.push({
        pos: Math.random() * N,
        lane: [LANE.A, LANE.B, LANE.C][Math.floor(Math.random() * 3)]
      });
    }
  }

  _pickLaneForNewCarOld(targetSegment) {
    const N = constants.N;
    const allLanes = [constants.LANE.A, constants.LANE.B, constants.LANE.C];
    const nearbyRadius = 25;

    const nearbyCars = (this.cars || []).filter((c) => {
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let dist = Math.abs(cPos - targetSegment);
      if (dist > N / 2) dist = N - dist;
      return dist < nearbyRadius;
    });

    const occupiedLanes = new Set(nearbyCars.map((c) => c.lane));
    const available = allLanes.filter((l) => !occupiedLanes.has(l));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    const laneCounts = {};
    allLanes.forEach((l) => (laneCounts[l] = 0));
    nearbyCars.forEach((c) => laneCounts[c.lane]++);
    const minCount = Math.min(...Object.values(laneCounts));
    const leastUsed = allLanes.filter((l) => laneCounts[l] === minCount);
    return leastUsed[Math.floor(Math.random() * leastUsed.length)];
  }

  _pickLaneForNewCarNew(targetSegment) {
    const N = constants.N;
    const nearbyRadius = 25;

    const cars = this.cars || [];

    // Quick fast-path for empty or small arrays
    if (cars.length === 0) {
        const r = Math.random();
        return r < 0.33 ? constants.LANE.A : (r < 0.66 ? constants.LANE.B : constants.LANE.C);
    }

    let countA = 0;
    let countB = 0;
    let countC = 0;
    let hasNearby = false;

    // Single pass to calculate nearby cars and count lanes
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const cPos = ((Math.floor(c.pos) % N) + N) % N;
      let dist = Math.abs(cPos - targetSegment);
      if (dist > N / 2) dist = N - dist;

      if (dist < nearbyRadius) {
        hasNearby = true;
        if (c.lane === constants.LANE.A) countA++;
        else if (c.lane === constants.LANE.B) countB++;
        else if (c.lane === constants.LANE.C) countC++;
      }
    }

    // Fast-path: no cars nearby, pick random
    if (!hasNearby) {
      const r = Math.random();
      return r < 0.33 ? constants.LANE.A : (r < 0.66 ? constants.LANE.B : constants.LANE.C);
    }

    // Collect available (empty) lanes
    let availableCount = 0;
    let availableLanes = [];

    if (countA === 0) availableLanes[availableCount++] = constants.LANE.A;
    if (countB === 0) availableLanes[availableCount++] = constants.LANE.B;
    if (countC === 0) availableLanes[availableCount++] = constants.LANE.C;

    // If there are empty lanes, pick one randomly
    if (availableCount > 0) {
      return availableLanes[Math.floor(Math.random() * availableCount)];
    }

    // All lanes have cars, find the one with minimum cars
    const minCount = Math.min(countA, countB, countC);

    let leastUsedCount = 0;
    let leastUsedLanes = [];

    if (countA === minCount) leastUsedLanes[leastUsedCount++] = constants.LANE.A;
    if (countB === minCount) leastUsedLanes[leastUsedCount++] = constants.LANE.B;
    if (countC === minCount) leastUsedLanes[leastUsedCount++] = constants.LANE.C;

    return leastUsedLanes[Math.floor(Math.random() * leastUsedCount)];
  }
}

const g = new Game();

console.log('Warming up...');
for (let i = 0; i < 10000; i++) {
  g._pickLaneForNewCarOld(Math.random() * N);
  g._pickLaneForNewCarNew(Math.random() * N);
}

console.time('old');
for (let i = 0; i < 1000000; i++) {
  g._pickLaneForNewCarOld(Math.random() * N);
}
console.timeEnd('old');

console.time('new');
for (let i = 0; i < 1000000; i++) {
  g._pickLaneForNewCarNew(Math.random() * N);
}
console.timeEnd('new');
