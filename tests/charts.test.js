/* VELOX Chart tests — dependency-free SVG chart engine. Run: node tests/charts.test.js */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = {};
context.self = context;
vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "..", "charts.js"), "utf8"), context);
const Charts = context.VELOXCharts;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

test("Min/max reduction retains sharp peaks and valleys", () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ x: i * 10, y: Math.sin(i / 20), segment: 1 }));
  rows[517].y = 80;
  rows[518].y = -65;
  const reduced = Charts.thin(rows, 80);
  assert.ok(reduced.length < rows.length, "series reduced");
  assert.ok(reduced.includes(rows[517]), "local maximum retained");
  assert.ok(reduced.includes(rows[518]), "adjacent local minimum retained");
  assert.equal(reduced[0], rows[0]);
  assert.equal(reduced[reduced.length - 1], rows[rows.length - 1]);
});

test("GPS segments remain separate during reduction", () => {
  const rows = [
    ...Array.from({ length: 80 }, (_, i) => ({ x: i * 10, y: i, segment: 1 })),
    ...Array.from({ length: 80 }, (_, i) => ({ x: (i + 80) * 10, y: 100 - i, segment: 2 }))
  ];
  const reduced = Charts.thin(rows, 24);
  assert.deepEqual(Array.from(new Set(reduced.map(row => row.segment))), [1, 2]);
  assert.ok(reduced.some(row => row.segment === 1));
  assert.ok(reduced.some(row => row.segment === 2));
});

test("SVG output contains labelled axes and zero reference line", () => {
  const box = { innerHTML: "", querySelector: () => null };
  Charts.profileChart(box, {
    rows: [{ x: 0, y: 2, segment: 1 }, { x: 1000, y: 5, segment: 1 }, { x: 2000, y: -1, segment: 2 }, { x: 3000, y: 1, segment: 2 }],
    xMax: 3000, xTitle: "DISTANZ (KM)", yTitle: "STEIGUNG (%)",
    yMin: -8, yMax: 8, baseline: "zero", referenceLine: 0, area: false
  });
  assert.match(box.innerHTML, /DISTANZ \(KM\)/);
  assert.match(box.innerHTML, /STEIGUNG \(%\)/);
  assert.match(box.innerHTML, /vx-reference/);
  assert.equal((box.innerHTML.match(/class="vx-line"/g) || []).length, 2, "GPS gap rendered as two independent paths");
});

test("Invalid points are excluded and empty profiles are handled", () => {
  const box = { innerHTML: "", querySelector: () => null };
  const result = Charts.profileChart(box, { rows: [{ x: 0, y: 1 }, { x: 10, y: NaN }, { x: 20, y: 3 }] });
  assert.equal(result.rows.length, 2);
  const empty = { innerHTML: "" };
  Charts.profileChart(empty, { rows: [{ x: 0, y: 1 }, { x: Infinity, y: 2 }] });
  assert.match(empty.innerHTML, /Nicht genügend Daten/);
});

test("Distance lookup and grade colour helpers are deterministic", () => {
  const rows = [{ x: 0 }, { x: 100 }, { x: 200 }];
  assert.equal(Charts.nearestIndex(rows, 145), 1);
  assert.equal(Charts.nearestIndex(rows, 180), 2);
  assert.notEqual(Charts.gradeColor(5), Charts.gradeColor(-5));
});

console.log("\n" + passed + " Chart-Tests bestanden");
