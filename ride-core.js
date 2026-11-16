/* VELOX Ride Core 1.0 — eine gemeinsame, testbare Rechenlogik für Distanz, Zeiten, Tempo,
   Höhenprofil, Steigungen, Anstiege, Stopps und Splits. Browser: window.VELOXCore, Node: module.exports. */
(function (root, factory) {
  const elevation = (typeof module === "object" && module.exports) ? require("./elevation-core.js") : root.VELOXElevation;
  const api = factory(elevation);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VELOXCore = api;
})(typeof self !== "undefined" ? self : this, function (elevation) {
  "use strict";
  const finite = Number.isFinite;
  const FILTERS = Object.freeze({
    minDistanceM: 0.8, maxDistanceM: 150, maxGapSeconds: 30, minMovingSpeedKmh: 1.5,
    maxSpeedKmh: 100, maxHorizontalAccuracyM: 80, stationaryDopplerMps: 0.3, dopplerNoiseMaxKmh: 20
  });
  const GRADE = Object.freeze({ baseM: 50, flatPct: 1.5, maxAbsPct: 35, climbMergeM: 100, climbMinDistanceM: 150, climbMinGainM: 8 });

  function haversine(a, b) {
    const R = 6371000, rad = (d) => d * Math.PI / 180;
    const lat1 = rad(a.lat), lat2 = rad(b.lat), dLat = lat2 - lat1, dLon = rad(b.lon - a.lon);
    const v = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1 - v)));
  }
  const validPoint = (p) => !!p && finite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
    finite(p.lon) && p.lon >= -180 && p.lon <= 180 && finite(p.t);

  /* Jedes Intervall zwischen zwei GPS-Punkten ist genau eins von:
     gap     – nicht verwertbar (Lücke, Sprung, schlechte Genauigkeit …): zählt weder Strecke noch Fahrzeit
     stopped – Stillstand / GPS-Rauschen: zählt Zeit als Standzeit, aber keine Strecke
     moving  – gültige Fahrt */
  function classify(prev, cur, useDoppler) {
    if (!validPoint(prev) || !validPoint(cur)) return { kind: "gap", reason: "invalid", durationS: 0 };
    const durationS = (cur.t - prev.t) / 1000;
    if (!finite(durationS) || durationS <= 0) return { kind: "gap", reason: "clock", durationS: 0 };
    if (durationS > FILTERS.maxGapSeconds) return { kind: "gap", reason: "gap", durationS };
    const acc = [prev.accuracy, cur.accuracy].filter(finite);
    if (acc.some((v) => v < 0 || v > FILTERS.maxHorizontalAccuracyM)) return { kind: "gap", reason: "accuracy", durationS };
    const distanceM = haversine(prev, cur);
    if (!finite(distanceM) || distanceM > FILTERS.maxDistanceM) return { kind: "gap", reason: "jump", durationS };
    const speedKmh = distanceM / durationS * 3.6;
    if (!finite(speedKmh) || speedKmh > FILTERS.maxSpeedKmh) return { kind: "gap", reason: "speed", durationS };
    // Doppler-Stillstand nur bei plausibel kleinem Positionstempo (GPS-Rauschen) und wenn Doppler-Werte verlässlich sind.
    const dopplerStill = useDoppler !== false && finite(cur.speed) && cur.speed >= 0 &&
      cur.speed < FILTERS.stationaryDopplerMps && speedKmh < FILTERS.dopplerNoiseMaxKmh;
    const moving = distanceM >= FILTERS.minDistanceM && speedKmh >= FILTERS.minMovingSpeedKmh && !dopplerStill;
    return { kind: moving ? "moving" : "stopped", distanceM, durationS, speedKmh };
  }

  function scan(points) {
    const cls = new Array(points.length).fill(null), intervals = [], speedValues = [];
    const rejected = { invalid: 0, clock: 0, gap: 0, jump: 0, speed: 0, accuracy: 0 };
    let run = 0, distanceM = 0, movingSeconds = 0, gapSeconds = 0, stoppedGpsSeconds = 0, acceptedIntervals = 0;
    let firstGapAfterFirst = Infinity, hasMoving = false, lastMovingIndex = -1;
    // Liefert das Gerät nie eine Doppler-Geschwindigkeit ≥ 1 m/s, sind die Werte (z. B. dauerhaft 0) nicht vertrauenswürdig.
    const dopplerUsable = points.some((p) => p && finite(p.speed) && p.speed >= 1);
    for (let i = 0; i < points.length; i++) {
      if (!validPoint(points[i])) { rejected.invalid++; run++; continue; }
      if (i === 0 || !validPoint(points[i - 1])) continue;
      const c = classify(points[i - 1], points[i], dopplerUsable);
      cls[i] = c;
      if (c.kind === "gap") {
        rejected[c.reason] = (rejected[c.reason] || 0) + 1;
        if (c.reason === "gap") gapSeconds += c.durationS;
        run++;
        if (hasMoving && firstGapAfterFirst === Infinity) firstGapAfterFirst = i;
        continue;
      }
      acceptedIntervals++;
      if (c.kind === "stopped") { stoppedGpsSeconds += c.durationS; continue; }
      intervals.push({ distanceM: c.distanceM, durationS: c.durationS, speedKmh: c.speedKmh,
        from: points[i - 1], to: points[i], fromIndex: i - 1, toIndex: i, run });
      distanceM += c.distanceM; movingSeconds += c.durationS; speedValues.push(c.speedKmh);
      hasMoving = true; lastMovingIndex = i;
    }
    const hasGapBetween = firstGapAfterFirst < lastMovingIndex;
    return { cls, intervals, speedValues, rejected, distanceM, movingSeconds, gapSeconds,
      stoppedGpsSeconds, acceptedIntervals, intervalCount: Math.max(0, points.length - 1), hasGapBetween };
  }

  /* Rohhöhen für die Höhen-Engine. Stillstands-Samples werden ausgelassen (stehende GPS-Höhe
     ist nur Rauschen), echte Lücken beginnen ein neues Segment. */
  function buildElevation(points, cls) {
    const raw = [];
    let distance = 0, segment = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!validPoint(p)) { segment++; continue; }
      if (i > 0 && cls[i]) {
        const c = cls[i];
        if (c.kind === "gap") segment++;
        else if (c.kind === "moving") distance += c.distanceM;
        else continue;
      }
      const hasAcc = p.altAccuracy !== undefined && p.altAccuracy !== null;
      const acc = finite(p.altAccuracy) ? p.altAccuracy : null;
      const ok = finite(p.alt) && p.alt >= -1000 && p.alt <= 10000 && (!hasAcc || (acc !== null && acc >= 0 && acc <= 35));
      if (!ok) continue;
      raw.push({ distanceM: distance, altitude: p.alt, time: p.t, segment, accuracy: acc,
        source: p.altSource || "gps", lat: p.lat, lon: p.lon });
    }
    const processed = elevation.process(raw);
    return {
      samples: processed.samples, gain: processed.gain, loss: processed.loss, distanceM: distance,
      validCount: processed.validCount, totalCount: points.length, minimum: processed.min, maximum: processed.max,
      medianAccuracy: processed.medianAccuracy, quality: processed.quality, spikesRejected: processed.spikesRejected,
      climbThresholdM: processed.climbThresholdM, barometerCount: processed.barometerCount, stepM: processed.stepM
    };
  }

  /* Steigung je Profilpunkt über mindestens 50 m Basis (nachlaufend), zugeordnet zur Mitte der Basis. */
  function gradeSeries(samples) {
    const items = [];
    for (let i = 1; i < samples.length; i++) {
      const b = samples[i], prev = samples[i - 1];
      if (prev.segment !== b.segment) continue;
      let j = i - 1;
      while (j > 0 && samples[j - 1].segment === b.segment && b.distanceM - samples[j].distanceM < GRADE.baseM) j--;
      const a = samples[j], span = b.distanceM - a.distanceM;
      if (span < GRADE.baseM * 0.6) continue;
      const grade = (b.elevationM - a.elevationM) / span * 100;
      if (!finite(grade) || Math.abs(grade) > GRADE.maxAbsPct) continue;
      items.push({ distanceM: (a.distanceM + b.distanceM) / 2, endM: b.distanceM, weightM: b.distanceM - prev.distanceM,
        grade, elevationM: b.elevationM, time: b.time, segment: b.segment });
    }
    return items;
  }

  function gradeStats(items) {
    const terrain = { uphill: 0, flat: 0, downhill: 0 };
    let weighted = 0, total = 0, max = null, min = null;
    let climb = null, pending = 0, best = null;
    const finish = () => {
      if (climb && climb.distanceM >= GRADE.climbMinDistanceM && climb.gainM >= GRADE.climbMinGainM &&
        (!best || climb.distanceM > best.distanceM)) {
        best = { ...climb, averageGrade: climb.gainM / climb.distanceM * 100 };
      }
      climb = null; pending = 0;
    };
    for (const it of items) {
      if (!(it.weightM > 0)) continue;
      weighted += it.grade * it.weightM; total += it.weightM;
      if (max === null || it.grade > max) max = it.grade;
      if (min === null || it.grade < min) min = it.grade;
      if (it.grade >= GRADE.flatPct) terrain.uphill += it.weightM;
      else if (it.grade <= -GRADE.flatPct) terrain.downhill += it.weightM;
      else terrain.flat += it.weightM;
      if (climb && it.segment !== climb.segment) finish();
      if (it.grade >= GRADE.flatPct) {
        if (!climb) climb = { segment: it.segment, distanceM: 0, gainM: 0, maxGrade: 0, startM: it.endM - it.weightM, endM: it.endM };
        climb.distanceM += pending + it.weightM; pending = 0;
        climb.gainM += it.grade / 100 * it.weightM;
        climb.maxGrade = Math.max(climb.maxGrade, it.grade); climb.endM = it.endM;
      } else if (climb) {
        pending += it.weightM;
        if (pending > GRADE.climbMergeM || it.grade < -3) finish();
      }
    }
    finish();
    return {
      average: total ? weighted / total : null, max, min, distanceM: total, terrain, longestClimb: best,
      distribution: total ? { uphill: terrain.uphill / total * 100, flat: terrain.flat / total * 100, downhill: terrain.downhill / total * 100 } : null
    };
  }

  function quantile(values, q) {
    if (!values.length) return null;
    const s = values.slice().sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  function fastestKilometer(intervals) {
    let best = null, d = 0, t = 0, start = 0;
    for (let i = 0; i < intervals.length; i++) {
      if (i > 0 && (intervals[i].fromIndex !== intervals[i - 1].toIndex || intervals[i].run !== intervals[i - 1].run)) { d = 0; t = 0; start = i; }
      d += intervals[i].distanceM; t += intervals[i].durationS;
      while (d - intervals[start].distanceM >= 1000) { d -= intervals[start].distanceM; t -= intervals[start].durationS; start++; }
      if (d >= 1000 && (best === null || t < best)) best = t;
    }
    return best;
  }

  /* Stopps: zusammenhängende Stillstands-Intervalle ab 10 s; Pausen der App beenden einen Stopp. */
  function stopStats(points, cls, pauses) {
    const list = Array.isArray(pauses) ? pauses : [];
    const overlapsPause = (t0, t1) => list.some((p) => {
      const a = p && (finite(p.start) ? p.start : p.startedAt), b = p && (finite(p.end) ? p.end : p.endedAt);
      return finite(a) && Math.max(t0, a) < Math.min(t1, finite(b) ? b : Infinity);
    });
    let count = 0, total = 0, longest = 0, current = 0, valid = 0;
    const finish = () => { if (current >= 10) { count++; total += current; longest = Math.max(longest, current); } current = 0; };
    for (let i = 1; i < points.length; i++) {
      const c = cls[i];
      if (!c) { finish(); continue; }
      if (c.kind === "gap" || overlapsPause(points[i - 1].t, points[i].t)) { finish(); continue; }
      valid++;
      if (c.kind === "stopped") current += c.durationS; else finish();
    }
    finish();
    return valid ? { count, longestSeconds: longest, totalSeconds: total } : { count: null, longestSeconds: null, totalSeconds: null };
  }

  /* Splits über die kumulierte gültige Fahrstrecke (ein Split = genau splitM Meter, der letzte ggf. kürzer). */
  function splits(intervals, splitM) {
    const out = new Map();
    let cursor = 0;
    for (const seg of intervals) {
      let rem = seg.distanceM;
      while (rem > 1e-4) {
        const idx = Math.floor((cursor + 1e-6) / splitM), offset = cursor - idx * splitM;
        const portion = Math.min(rem, splitM - offset), time = seg.durationS * portion / seg.distanceM;
        let s = out.get(idx);
        if (!s) { s = { number: idx + 1, distanceM: 0, movingSeconds: 0 }; out.set(idx, s); }
        s.distanceM += portion; s.movingSeconds += time; cursor += portion; rem -= portion;
      }
    }
    return Array.from(out.values()).map((s) => ({ ...s, complete: s.distanceM >= splitM - 1,
      averageSpeed: s.movingSeconds > 0 ? s.distanceM / s.movingSeconds * 3.6 : 0 }));
  }

  const ZONES = [{ label: "0–10 km/h", min: 0, max: 10 }, { label: "10–20 km/h", min: 10, max: 20 },
    { label: "20–30 km/h", min: 20, max: 30 }, { label: "Über 30 km/h", min: 30, max: Infinity }];

  function analyze(ride, options) {
    const opts = options || {};
    const points = Array.isArray(ride && ride.points) ? ride.points : [];
    const s = scan(points);
    const profile = buildElevation(points, s.cls);
    const series = gradeSeries(profile.samples);
    const grades = gradeStats(series);

    const last = points[points.length - 1];
    const start = finite(ride && ride.startedAt) ? ride.startedAt : (points[0] && points[0].t) || 0;
    const end = finite(ride && ride.endedAt) ? ride.endedAt : (last && last.t) || start;
    const elapsedSeconds = finite(opts.elapsedSeconds) ? opts.elapsedSeconds : Math.max(0, (end - start - (Number(ride && ride.pausedMs) || 0)) / 1000);
    const movingSeconds = s.movingSeconds;
    const stoppedSeconds = Math.max(0, elapsedSeconds - movingSeconds);

    const zones = ZONES.map((z) => ({ ...z, seconds: 0 }));
    for (const it of s.intervals) {
      const z = zones.find((x) => it.speedKmh >= x.min && it.speedKmh < x.max);
      if (z) z.seconds += it.durationS;
    }
    const samples = profile.samples;
    const net = samples.length > 1 ? samples[samples.length - 1].elevationM - samples[0].elevationM : null;

    let maxFromStartM = null, straightDistanceM = null, routeStraightness = null;
    if (s.intervals.length) {
      const origin = s.intervals[0].from;
      maxFromStartM = s.intervals.reduce((m, it) => Math.max(m, haversine(origin, it.to)), 0);
      if (!s.hasGapBetween && s.distanceM > 0) {
        straightDistanceM = haversine(origin, s.intervals[s.intervals.length - 1].to);
        routeStraightness = Math.min(100, straightDistanceM / s.distanceM * 100);
      }
    }
    return {
      points, intervals: s.intervals, scan: s, distanceM: s.distanceM,
      elapsedSeconds, movingSeconds, stoppedSeconds,
      movingRatio: elapsedSeconds > 0 ? Math.min(1, movingSeconds / elapsedSeconds) : null,
      averageSpeed: movingSeconds > 0 ? s.distanceM / movingSeconds * 3.6 : 0,
      overallAverage: elapsedSeconds > 0 ? s.distanceM / elapsedSeconds * 3.6 : 0,
      maxSpeed: s.speedValues.reduce((m, v) => Math.max(m, v), 0),
      medianSpeed: elevation.median(s.speedValues), p95Speed: quantile(s.speedValues, 0.95),
      speedZones: zones, fastestKilometerSeconds: fastestKilometer(s.intervals),
      elevationProfile: profile, elevationGain: profile.gain, elevationLoss: profile.loss,
      elevationMin: profile.minimum, elevationMax: profile.maximum,
      elevationRange: profile.minimum === null ? null : profile.maximum - profile.minimum,
      netElevationChange: net, elevationQuality: profile.quality, elevationAccuracy: profile.medianAccuracy,
      gradeSeries: series, gradeAverage: grades.average, gradeMax: grades.max, gradeMin: grades.min,
      gradeSamples: series.length, gradeDistribution: grades.distribution, gradeTerrain: grades.terrain,
      gradeDistanceM: grades.distanceM, longestClimb: grades.longestClimb,
      /* Höhengewinn je Fahrstunde (kein klassisches VAM, das nur Anstiege zählt). */
      climbPerHour: movingSeconds > 0 ? profile.gain / (movingSeconds / 3600) : null,
      maxFromStartM, straightDistanceM, routeStraightness,
      stops: stopStats(points, s.cls, opts.pauses || (ride && (ride.pauses || ride.pauseIntervals))),
      rejected: s.rejected, gapSeconds: s.gapSeconds, stoppedGpsSeconds: s.stoppedGpsSeconds
    };
  }

  return { FILTERS, GRADE, haversine, validPoint, classify, scan, buildElevation, gradeSeries, gradeStats,
    fastestKilometer, stopStats, splits, analyze, calcRide: analyze, quantile };
});
