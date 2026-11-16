/* VELOX Kerntests — ausführen mit: node tests/core.test.js  (keine Abhängigkeiten) */
"use strict";
const assert = require("node:assert/strict");
const Core = require("../ride-core.js");
const Elev = require("../elevation-core.js");

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const LAT = 51.05, M_LON = 1 / (111320 * Math.cos(LAT * Math.PI / 180)), M_LAT = 1 / 110574;

/* Strecke nach Osten; Höhe: 2 km +5 % (100 m), 1 km flach, 2 km −5 %, Rest flach. */
function trueAlt(d) {
  if (d < 2000) return 200 + d * 0.05;
  if (d < 3000) return 300;
  if (d < 5000) return 300 - (d - 3000) * 0.05;
  return 200;
}
function makeRide(o) {
  o = Object.assign({ lengthM: 8000, speed: 5, hNoise: 0.8, vNoise: 3, accuracy: 8, stopAtM: null, stopSeconds: 0, gapAtM: null, gapSeconds: 0, doppler: true }, o);
  const pts = []; let d = 0, t = 1700000000000;
  const push = (dist, moving) => pts.push({
    lat: LAT + gauss() * o.hNoise * M_LAT, lon: 13.7 + (dist + gauss() * o.hNoise) * M_LON, t,
    accuracy: 5, alt: trueAlt(dist) + gauss() * o.vNoise, altAccuracy: o.accuracy,
    speed: o.doppler ? (moving ? o.speed : 0) : undefined
  });
  let stopped = false, gapped = false;
  while (d < o.lengthM) {
    if (o.stopAtM !== null && !stopped && d >= o.stopAtM) { stopped = true; for (let i = 0; i < o.stopSeconds; i++) { t += 1000; push(d, false); } t += 1000; }
    if (o.gapAtM !== null && !gapped && d >= o.gapAtM) { gapped = true; t += o.gapSeconds * 1000; d += o.gapSeconds * o.speed * 0.5; }
    push(d, true); d += o.speed; t += 1000;
  }
  return { id: "t", startedAt: pts[0].t, endedAt: pts[pts.length - 1].t, pausedMs: 0, points: pts };
}
const near = (actual, expected, tol, label) => assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(2)} statt ${expected} ±${tol}`);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

test("classify: Fahrt, Stillstand, Lücken", () => {
  const a = { lat: LAT, lon: 13.7, t: 0, accuracy: 5 };
  const at = (m, s, extra) => Object.assign({ lat: LAT, lon: 13.7 + m * M_LON, t: s * 1000, accuracy: 5 }, extra);
  assert.equal(Core.classify(a, at(5, 1)).kind, "moving");
  assert.equal(Core.classify(a, at(0.3, 1)).kind, "stopped");
  assert.equal(Core.classify(a, at(5, 31)).reason, "gap");
  assert.equal(Core.classify(a, at(5, 0)).reason, "clock");
  assert.equal(Core.classify(a, at(200, 20)).reason, "jump");
  assert.equal(Core.classify(a, at(5, 1, { accuracy: 120 })).reason, "accuracy");
  assert.equal(Core.classify(a, at(40, 1)).reason, "speed");           // 144 km/h
  assert.equal(Core.classify(a, at(3, 1, { speed: 0.05 })).kind, "stopped"); // Doppler sagt: steht (GPS-Rauschen)
});

test("Kaputter Doppler (dauerhaft speed=0) darf Fahrt nicht in Stillstand verwandeln", () => {
  const ride = makeRide({ lengthM: 2000, hNoise: 0.3, doppler: false });
  ride.points.forEach((p) => { p.speed = 0; });
  near(Core.analyze(ride).distanceM, 2000, 60, "Distanz trotz speed=0");
});

test("Doppler erkennt GPS-Rauschen im Stand (Sprünge von 3 m bei speed 0)", () => {
  const pts = []; let t = 1.7e12;
  for (let i = 0; i < 60; i++) { t += 1000; pts.push({ lat: LAT + gauss() * 1.5 * M_LAT, lon: 13.7 + gauss() * 1.5 * M_LON, t, accuracy: 6, speed: 0 }); }
  for (let i = 0; i < 60; i++) { t += 1000; pts.push({ lat: LAT, lon: 13.7 + (i + 1) * 5 * M_LON, t, accuracy: 6, speed: 5 }); }
  const withDoppler = Core.analyze({ points: pts }).distanceM;
  near(withDoppler, 295, 30, "nur die echte Fahrt zählt");
});

test("Zickzack-Filter zählt nur echte Bewegungen", () => {
  assert.deepEqual(Elev.zigzag([0, 2, 0, 2, 0, 2], 3), { gain: 0, loss: 0 });
  const z = Elev.zigzag([0, 10, 5, 15], 3);
  assert.equal(z.gain, 20); assert.equal(z.loss, 5);
  const up = Elev.zigzag([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
  assert.equal(up.gain, 10);                                           // gleichmäßiger Anstieg: nichts geht verloren
});

test("Distanz stimmt (8 km saubere Fahrt)", () => {
  const r = Core.analyze(makeRide({ hNoise: 0.3 }));
  near(r.distanceM, 8000, 8000 * 0.02, "Distanz");
  near(r.movingSeconds, 1600, 20, "Fahrzeit");
});

test("Höhenmeter und Steigung bei realistischem Rauschen (σ 3 m)", () => {
  const r = Core.analyze(makeRide());
  near(r.elevationGain, 100, 25, "Aufstieg");
  near(r.elevationLoss, 100, 25, "Abstieg");
  near(r.elevationMax, 300, 8, "Höchster Punkt");
  near(r.elevationMin, 200, 8, "Tiefster Punkt");
  assert.ok(r.gradeMax > 3.5 && r.gradeMax < 8.5, "Max-Steigung " + r.gradeMax);
  assert.ok(Math.abs(r.gradeAverage) < 0.8, "Ø-Steigung ~0 bei Netto 0: " + r.gradeAverage);
  assert.ok(r.longestClimb, "längster Anstieg gefunden");
  near(r.longestClimb.distanceM, 2000, 350, "Anstiegslänge");
  near(r.longestClimb.gainM, 100, 25, "Anstieg Höhe");
  near(r.longestClimb.averageGrade, 5, 1.2, "Anstieg Ø");
  assert.ok(r.gradeSamples > 100, "Steigungsproben vorhanden: " + r.gradeSamples);
});

test("Stopp unterbricht das Höhenprofil NICHT und zählt keine Strecke", () => {
  const r = Core.analyze(makeRide({ stopAtM: 1000, stopSeconds: 60, hNoise: 0.3 }));
  const segs = new Set(r.elevationProfile.samples.map((s) => s.segment));
  assert.equal(segs.size, 1, "ein einziges Höhensegment");
  near(r.distanceM, 8000, 160, "Distanz trotz Stopp");
  assert.equal(r.stops.count, 1);
  near(r.stops.longestSeconds, 60, 3, "Stopplänge");
  assert.ok(r.routeStraightness !== null && r.routeStraightness > 95, "Geradlinigkeit trotz Stopp: " + r.routeStraightness);
  near(r.straightDistanceM, 8000, 200, "Luftlinie");
});

test("GPS-Lücke: kein Strecken-Bridging, neues Segment, Geradlinigkeit nicht verfügbar", () => {
  const r = Core.analyze(makeRide({ gapAtM: 3000, gapSeconds: 40 }));
  assert.ok(r.rejected.gap >= 1);
  assert.ok(r.gapSeconds >= 39);
  assert.equal(r.routeStraightness, null);
  assert.ok(new Set(r.elevationProfile.samples.map((s) => s.segment)).size >= 2);
});

test("Langsame Fahrt (3,6 km/h) wird als Fahrt gewertet", () => {
  const r = Core.analyze(makeRide({ lengthM: 500, speed: 1, hNoise: 0.1 }));
  near(r.distanceM, 500, 25, "Distanz langsam");
});

test("Alte Fehlerklasse: bei 1 Hz und 18 km/h sind Profilpunkte nie ≥ 8 m auseinander — neues Profil schon", () => {
  const ride = makeRide({ hNoise: 0.3 });
  let rawPairs8 = 0, d = 0;
  for (let i = 1; i < ride.points.length; i++) {
    const c = Core.classify(ride.points[i - 1], ride.points[i]);
    if (c.kind === "moving" && c.distanceM >= 8) rawPairs8++;
  }
  assert.equal(rawPairs8, 0, "Rohpunkte: 0 Paare ≥ 8 m (daher fielen alle Steigungen weg)");
  const r = Core.analyze(ride);
  const steps = r.elevationProfile.samples.slice(1).filter((s, i) => s.segment === r.elevationProfile.samples[i].segment);
  assert.ok(steps.length > 250);
  assert.equal(r.gradeSeries.length > 250, true);
});

test("Splits über kumulierte Strecke", () => {
  const r = Core.analyze(makeRide({ lengthM: 10500, hNoise: 0.3 }));
  const s = Core.splits(r.intervals, 5000);
  assert.equal(s.length, 3);
  assert.ok(s[0].complete && s[1].complete && !s[2].complete);
  near(s[0].distanceM, 5000, 1, "Split 1");
  near(s[0].averageSpeed, 18, 0.6, "Split-Tempo");
});

test("Höhen-Ausreißer werden verworfen", () => {
  const raw = [];
  for (let i = 0; i < 60; i++) raw.push({ distanceM: i * 5, altitude: 250 + (i === 30 ? 60 : 0), time: i * 1000, segment: 0, accuracy: 6 });
  const p = Elev.process(raw);
  assert.equal(p.spikesRejected, 1);
  assert.ok(p.gain < 3 && p.loss < 3, `kein Phantom-Anstieg: +${p.gain} −${p.loss}`);
});

test("leere und kaputte Eingaben stürzen nicht ab", () => {
  const r = Core.analyze({ points: [] });
  assert.equal(r.distanceM, 0);
  assert.equal(Core.analyze({ points: [{ lat: NaN, lon: 0, t: 1 }] }).distanceM, 0);
  assert.equal(Core.analyze({}).distanceM, 0);
});

console.log(`\n${passed} Tests bestanden`);
