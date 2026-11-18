const assert = require("node:assert/strict");
const Steps = require("../step-counter.js");

assert.equal(Steps.estimateStepLengthM(170), 0.7055);
assert.equal(Steps.estimateStepLengthM(99), null);
assert.equal(Steps.estimateStepLengthM(231), null);

const detector = new Steps.Detector();
const sample = (timeStamp, x) => detector.process({
  timeStamp,
  acceleration: { x, y: 0, z: 0 },
  accelerationIncludingGravity: null
});
assert.equal(sample(100, 0), 0);
assert.equal(sample(150, 1.6), 1, "first clear acceleration peak is one step");
assert.equal(sample(220, 0), 0, "falling edge does not add a step");
assert.equal(sample(300, 1.7), 0, "refractory period suppresses duplicate peaks");
assert.equal(sample(340, 0), 0);
assert.equal(sample(500, 1.8), 1, "a later distinct peak is counted");
assert.equal(detector.count, 2);
assert.equal(detector.process(null), 0);
console.log("Step-counter tests passed (stride estimate + peak/refractory behavior).");
