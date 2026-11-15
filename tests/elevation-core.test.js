"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

global.window = global;
require("../elevation-core.js");

const processElevation = global.VELOXElevation.process;
const sample = (distanceM, altitude, time, segment = 0, accuracy = 5) => ({
  distanceM, altitude, time, segment, accuracy, source: "gps"
});

test("rejects isolated altitude spikes before smoothing", () => {
  const result = processElevation([
    sample(0, 100, 0),
    sample(20, 100, 10),
    sample(40, 140, 20),
    sample(60, 100, 30),
    sample(80, 100, 40)
  ]);
  assert.equal(result.spikesRejected, 1);
  assert.equal(result.validCount, 4);
  assert.equal(result.gain, 0);
  assert.equal(result.loss, 0);
});

test("does not connect elevation totals across route segments", () => {
  const result = processElevation([
    sample(0, 100, 0, 0),
    sample(20, 104, 10, 0),
    sample(20, 200, 100, 1),
    sample(40, 204, 110, 1)
  ]);
  assert.equal(result.gain, 8);
  assert.equal(result.loss, 0);
});

test("accumulates gradual climbs against a stable altitude anchor", () => {
  const result = processElevation([
    sample(0, 100, 0),
    sample(10, 101, 10),
    sample(20, 102, 20),
    sample(30, 103, 30)
  ]);
  assert.equal(result.gain, 3);
  assert.equal(result.loss, 0);
});

test("resets elevation accumulation after a long observation gap", () => {
  const result = processElevation([
    sample(0, 100, 0),
    sample(10, 101, 10),
    sample(20, 200, 100),
    sample(30, 201, 110)
  ]);
  assert.equal(result.gain, 0);
  assert.equal(result.loss, 0);
});

test("rejects impossible vertical accuracy but keeps missing accuracy unrated", () => {
  const invalid = processElevation([
    sample(0, 100, 0, 0, 5),
    sample(10, 101, 10, 0, 5),
    sample(20, 102, 20, 0, 40)
  ]);
  assert.equal(invalid.validCount, 2);

  const missing = processElevation([
    sample(0, 100, 0, 0, undefined),
    sample(10, 101, 10, 0, undefined),
    sample(20, 102, 20, 0, undefined),
    sample(30, 103, 30, 0, undefined),
    sample(40, 104, 40, 0, undefined)
  ]);
  assert.equal(missing.validCount, 5);
  assert.equal(missing.quality, "unrated");
  assert.equal(missing.medianAccuracy, null);
});

test("application profile and Pro analysis use consistent movement and time fields", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const pro = fs.readFileSync(path.join(__dirname, "..", "analysis-pro.js"), "utf8");
  const chartStart = app.indexOf("  function renderElevation(points){");
  const chartEnd = app.indexOf("  function renderGradeProfile(points){", chartStart);
  assert.ok(chartStart >= 0 && chartEnd > chartStart);
  const chart = app.slice(chartStart, chartEnd);
  assert.match(chart, /g\[i\]\.time/);
  assert.doesNotMatch(chart, /g\[i\]\.t/);
  assert.match(app, /speed<RIDE_INTERVAL_FILTERS\.minMovingSpeedKmh/);
  assert.match(app, /elevation\.samples\[0\]\.segment===elevation\.samples\[elevation\.samples\.length-1\]\.segment/);
  assert.match(pro, /pointMeta\[index - 1\] = \{ distanceM, segment: segmentNumber, useAltitude: true \}/);
});

test("offline shell includes every local analysis module", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.ok(html.indexOf("elevation-core.js") < html.indexOf("app.js"));
  for (const file of ["./elevation-core.js", "./analysis-pro.js", "./app.js"]) {
    assert.ok(sw.includes('"'+file+'"'), "offline shell missing "+file);
  }
});
