/* VELOX ANALYZE contract regressions — node tests/analysis-contract.test.js */
"use strict";
const assert = require("node:assert/strict");
const Core = require("../ride-core.js");

const base = 1_700_000_000_000;
const latitude = 51;
const metersPerLongitudeDegree = 6_371_000 * Math.PI / 180 * Math.cos(latitude * Math.PI / 180);
const point = (seconds, distanceM) => ({
  lat: latitude,
  lon: 13 + distanceM / metersPerLongitudeDegree,
  t: base + seconds * 1000,
  accuracy: 5,
  alt: 200 + distanceM * 0.05,
  altAccuracy: 5,
  altSource: "gps"
});

// 50 m steady riding, 10 s stationary, 10 m riding, a 40 s GPS gap,
// then 10 m steady riding. All moving intervals are 5 m/s (18 km/h).
const ride = {
  id: "analysis-contract-fixture",
  startedAt: base,
  endedAt: base + 64_000,
  pausedMs: 0,
  status: "completed",
  points: [
    ...Array.from({ length: 11 }, (_, i) => point(i, i * 5)),
    point(20, 50),
    point(21, 55),
    point(22, 60),
    point(62, 65),
    point(63, 70),
    point(64, 75)
  ]
};
const rawBefore = JSON.stringify(ride);
const result = Core.analyze(ride);
const near = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    label + ": expected " + expected + " ± " + tolerance + ", got " + actual);
};

near(result.distanceM, 70, 0.05, "distance includes only 14 moving intervals");
near(result.movingSeconds, 14, 1e-9, "moving time");
near(result.elapsedSeconds, 64, 1e-9, "elapsed time");
near(result.stoppedGpsSeconds, 10, 1e-9, "GPS-recognized stationary time");
near(result.gapSeconds, 40, 1e-9, "GPS gap time");
near(result.stoppedSeconds, 50, 1e-9, "combined non-moving time");
near(result.averageSpeed, 18, 0.02, "moving average speed");
near(result.overallAverage, 3.9375, 0.02, "overall average speed");

const zoneSeconds = result.speedZones.reduce((sum, zone) => sum + zone.seconds, 0);
near(zoneSeconds, result.movingSeconds, 1e-9, "speed zones partition moving time");
assert.equal(result.scan.hasGapBetween, true, "internal GPS gap is detected");
assert.equal(result.routeStraightness, null, "route straightness is withheld across an internal gap");
assert.equal(JSON.stringify(ride), rawBefore, "analysis leaves source ride data unchanged");

console.log("VELOX ANALYZE contract: all checks passed");
