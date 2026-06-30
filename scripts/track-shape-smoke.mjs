import { TRACKS, getTrackShapeReport } from '../client/src/config/tracks.js';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function curveSegments(report) {
  return report.segments.filter((segment) => segment.maxAbsCurve > 0.5);
}

function validateCurveSegments(report, label) {
  const segments = curveSegments(report);
  assert(segments.length > 0, `${label} has no visible curve segments`);

  for (const segment of segments) {
    assert(
      segment.visibleCurvePercent >= 25,
      `${label} ${segment.type} at ${segment.start}-${segment.end} is mostly erased (${segment.visibleCurvePercent}%)`
    );
    assert(
      segment.length >= 5000,
      `${label} ${segment.type} at ${segment.start}-${segment.end} is too short for high-speed comfort (${segment.length})`
    );
  }

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    const next = segments[(i + 1) % segments.length];
    const currentSign = current.hasPositiveCurve ? 1 : -1;
    const nextSign = next.hasPositiveCurve ? 1 : -1;
    const gap = i === segments.length - 1
      ? report.trackLength - current.end + next.start
      : next.start - current.end;

    if (currentSign !== nextSign) {
      assert(
        gap >= report.horizonDistance * 0.9,
        `${label} has opposite curve deviations too close together: ${current.type} -> ${next.type} gap ${gap}`
      );
    }
  }
}

const tropical = getTrackShapeReport(TRACKS.TROPICAL);
const coastal = getTrackShapeReport(TRACKS.COASTAL);

for (const [label, report] of [['Tropical', tropical], ['Coastal', coastal]]) {
  assert(
    report.horizonRatio >= 3,
    `${label} track is too short relative to the visible horizon: ${report.horizonRatio}x`
  );
  validateCurveSegments(report, label);
}

assert(
  tropical.trackLength >= 50000 && tropical.trackLength <= 53000,
  `Tropical length out of budget: ${tropical.trackLength}`
);
assert(
  coastal.trackLength >= 67000 && coastal.trackLength <= 71000,
  `Coastal length out of budget: ${coastal.trackLength}`
);

assert(
  tropical.maxAbsCurve >= 20 && tropical.maxAbsCurve <= 28,
  `Tropical curve budget out of range: ${tropical.maxAbsCurve}`
);
assert(
  tropical.maxAbsHeight >= 90 && tropical.maxAbsHeight <= 130,
  `Tropical hill budget out of range: ${tropical.maxAbsHeight}`
);
assert(
  tropical.hasPositiveCurve && tropical.hasNegativeCurve,
  'Tropical should include both right and left visual curve movement'
);

assert(
  coastal.maxAbsCurve >= 32 && coastal.maxAbsCurve <= 42,
  `Coastal curve budget out of range: ${coastal.maxAbsCurve}`
);
assert(
  coastal.maxAbsHeight >= 135 && coastal.maxAbsHeight <= 195,
  `Coastal hill budget out of range: ${coastal.maxAbsHeight}`
);
assert(
  coastal.hasPositiveCurve && coastal.hasNegativeCurve,
  'Coastal should include both right and left visual curve movement'
);

assert(
  tropical.maxCurveDeltaPerSample <= 3.1,
  `Tropical curve changes too sharply per road sample: ${tropical.maxCurveDeltaPerSample}`
);
assert(
  coastal.maxCurveDeltaPerSample <= 4.0,
  `Coastal curve changes too sharply per road sample: ${coastal.maxCurveDeltaPerSample}`
);

assert(
  tropical.estimatedScreenDrift.maxCenterDriftPx >= 80,
  `Tropical screen drift too subtle: ${tropical.estimatedScreenDrift.maxCenterDriftPx}px`
);
assert(
  tropical.estimatedScreenDrift.maxCenterDriftPx <= 205,
  `Tropical screen drift too aggressive: ${tropical.estimatedScreenDrift.maxCenterDriftPx}px`
);
assert(
  coastal.estimatedScreenDrift.maxCenterDriftPx >= tropical.estimatedScreenDrift.maxCenterDriftPx * 1.15,
  `Coastal should read stronger than Tropical (${coastal.estimatedScreenDrift.maxCenterDriftPx}px vs ${tropical.estimatedScreenDrift.maxCenterDriftPx}px)`
);
assert(
  coastal.estimatedScreenDrift.maxCenterDriftPx <= 330,
  `Coastal screen drift too aggressive: ${coastal.estimatedScreenDrift.maxCenterDriftPx}px`
);

console.log('Track shape smoke passed');
console.table({
  Tropical: {
    length: tropical.trackLength,
    horizonRatio: tropical.horizonRatio,
    maxCurve: tropical.maxAbsCurve,
    maxCurveDelta: tropical.maxCurveDeltaPerSample,
    maxHeight: tropical.maxAbsHeight,
    driftPx: tropical.estimatedScreenDrift.maxCenterDriftPx,
    visibleCurvePercent: tropical.visibleCurvePercent,
  },
  Coastal: {
    length: coastal.trackLength,
    horizonRatio: coastal.horizonRatio,
    maxCurve: coastal.maxAbsCurve,
    maxCurveDelta: coastal.maxCurveDeltaPerSample,
    maxHeight: coastal.maxAbsHeight,
    driftPx: coastal.estimatedScreenDrift.maxCenterDriftPx,
    visibleCurvePercent: coastal.visibleCurvePercent,
  },
});
