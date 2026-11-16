/* VELOX Elevation Core 2.0
   Ausreißerfilter -> Glättung über Strecke (nicht über Sample-Anzahl) -> Resampling in festen
   Streckenschritten -> Hysterese (Zickzack-Filter) für Auf-/Abstieg.
   Läuft im Browser (window.VELOXElevation) und in Node (module.exports) für Tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VELOXElevation = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const finite = Number.isFinite;
  const STEP_M = 25;              // Abstand der Profilpunkte
  const SMOOTH_RADIUS_M = 50;     // Medianfenster ±50 m
  const SMOOTH_MAX_AGE_MS = 45000;
  const SMOOTH_MAX_SIDE = 40;     // höchstens 40 Samples je Seite

  const median = (values) => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };

  function screenSpikes(valid) {
    const screened = [];
    let spikesRejected = 0;
    for (let i = 0; i < valid.length; i++) {
      const s = valid[i], neighborhood = [];
      for (let j = Math.max(0, i - 2); j <= Math.min(valid.length - 1, i + 2); j++) {
        const n = valid[j];
        if (n.segment === s.segment && Math.abs(n.distanceM - s.distanceM) <= 90 &&
          Math.abs(n.time - s.time) <= 45000) neighborhood.push(n.altitude);
      }
      const center = median(neighborhood);
      const tolerance = Math.max(8, finite(s.accuracy) ? s.accuracy * 1.8 : 8);
      if (neighborhood.length >= 3 && Math.abs(s.altitude - center) > tolerance) { spikesRejected++; continue; }
      screened.push(s);
    }
    return { screened, spikesRejected };
  }

  function smoothAt(list, i) {
    const s = list[i], values = [s.altitude];
    for (let j = i - 1, n = 0; j >= 0 && n < SMOOTH_MAX_SIDE; j--, n++) {
      const o = list[j];
      if (o.segment !== s.segment || s.distanceM - o.distanceM > SMOOTH_RADIUS_M || s.time - o.time > SMOOTH_MAX_AGE_MS) break;
      values.push(o.altitude);
    }
    for (let j = i + 1, n = 0; j < list.length && n < SMOOTH_MAX_SIDE; j++, n++) {
      const o = list[j];
      if (o.segment !== s.segment || o.distanceM - s.distanceM > SMOOTH_RADIUS_M || o.time - s.time > SMOOTH_MAX_AGE_MS) break;
      values.push(o.altitude);
    }
    return values.length >= 3 ? median(values) : s.altitude;
  }

  function interpolate(a, b, d) {
    const span = b.distanceM - a.distanceM;
    const f = span > 0 ? Math.max(0, Math.min(1, (d - a.distanceM) / span)) : 0;
    const mix = (x, y) => (finite(x) && finite(y) ? x + (y - x) * f : (finite(x) ? x : finite(y) ? y : null));
    return {
      distanceM: d, elevationM: mix(a.elevationM, b.elevationM), time: mix(a.time, b.time),
      segment: a.segment, lat: mix(a.lat, b.lat), lon: mix(a.lon, b.lon), source: a.source
    };
  }

  function resampleSegment(rows, seg) {
    const pts = [];
    for (const s of seg) {
      if (pts.length && s.distanceM <= pts[pts.length - 1].distanceM + 1e-9) pts[pts.length - 1] = s;
      else pts.push(s);
    }
    if (pts.length < 2) { rows.push(interpolate(pts[0], pts[0], pts[0].distanceM)); return; }
    const start = pts[0].distanceM, end = pts[pts.length - 1].distanceM;
    let k = 0;
    for (let d = start; d < end - 1e-6; d += STEP_M) {
      while (k < pts.length - 2 && pts[k + 1].distanceM <= d) k++;
      rows.push(interpolate(pts[k], pts[k + 1], d));
    }
    const last = rows[rows.length - 1];
    if (!last || last.segment !== seg[0].segment || end - last.distanceM > 1) {
      rows.push(interpolate(pts[pts.length - 2], pts[pts.length - 1], end));
    }
  }

  /* Zweite, leichte Glättung des gleichmäßig abgetasteten Profils ((1,2,1)/4, zweimal) – das dämpft
     das verbleibende GPS-Höhenrauschen, ohne echte Anstiege zu verschleifen. Segmentgrenzen bleiben erhalten. */
  function smoothRows(rows, passes) {
    let cur = rows.map((r) => r.elevationM);
    for (let p = 0; p < passes; p++) {
      const next = cur.slice();
      for (let i = 1; i < cur.length - 1; i++) {
        if (rows[i - 1].segment === rows[i].segment && rows[i + 1].segment === rows[i].segment) {
          next[i] = (cur[i - 1] + 2 * cur[i] + cur[i + 1]) / 4;
        }
      }
      cur = next;
    }
    return rows.map((r, i) => ({ ...r, elevationM: cur[i] }));
  }

  /* Zickzack-Filter: zählt nur Bewegungen, die vom letzten Extrem mindestens `thr` abweichen. */
  function zigzag(values, thr) {
    let gain = 0, loss = 0;
    if (values.length < 2) return { gain, loss };
    let dir = 0, pivot = values[0], ext = values[0], lo = values[0], hi = values[0];
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      if (dir === 0) {
        if (v > hi) hi = v;
        if (v < lo) lo = v;
        if (v - lo >= thr) { dir = 1; pivot = lo; ext = v; }
        else if (hi - v >= thr) { dir = -1; pivot = hi; ext = v; }
      } else if (dir === 1) {
        if (v > ext) ext = v;
        else if (ext - v >= thr) { gain += ext - pivot; pivot = ext; dir = -1; ext = v; }
      } else {
        if (v < ext) ext = v;
        else if (v - ext >= thr) { loss += pivot - ext; pivot = ext; dir = 1; ext = v; }
      }
    }
    if (dir === 1) gain += ext - pivot; else if (dir === -1) loss += pivot - ext;
    return { gain, loss };
  }

  function process(input, options) {
    const opts = options || {};
    const maxAccuracy = finite(opts.maxAccuracyM) ? opts.maxAccuracyM : 35;
    const valid = (input || []).filter((s) => s && finite(s.distanceM) && finite(s.altitude) &&
      finite(s.time) && finite(s.segment) && s.altitude >= -1000 && s.altitude <= 10000 &&
      (!finite(s.accuracy) || (s.accuracy >= 0 && s.accuracy <= maxAccuracy)));
    const { screened, spikesRejected } = screenSpikes(valid);
    const smoothed = screened.map((s, i) => ({ ...s, elevationM: smoothAt(screened, i) }));

    const rows = [];
    for (let i = 0; i < smoothed.length;) {
      let j = i;
      while (j + 1 < smoothed.length && smoothed[j + 1].segment === smoothed[i].segment) j++;
      resampleSegment(rows, smoothed.slice(i, j + 1));
      i = j + 1;
    }

    const profileRows = smoothRows(rows, 2);
    const accuracies = screened.filter((s) => finite(s.accuracy)).map((s) => s.accuracy);
    const medianAccuracy = median(accuracies);
    const barometerCount = screened.filter((s) => String(s.source || "").includes("barometer")).length;
    const quality = screened.length < 5 ? "low" :
      medianAccuracy === null ? (barometerCount > 0 ? "medium" : "unrated") :
        medianAccuracy <= 8 ? "high" : medianAccuracy <= 18 ? "medium" : "low";
    const climbThreshold = medianAccuracy !== null ? Math.max(2.5, Math.min(6, medianAccuracy * 0.35)) : 3;

    let gain = 0, loss = 0;
    for (let i = 0; i < profileRows.length;) {
      let j = i;
      while (j + 1 < profileRows.length && profileRows[j + 1].segment === profileRows[i].segment) j++;
      const z = zigzag(profileRows.slice(i, j + 1).map((r) => r.elevationM), climbThreshold);
      gain += z.gain; loss += z.loss;
      i = j + 1;
    }
    let min = null, max = null;
    for (const r of profileRows) {
      if (min === null || r.elevationM < min) min = r.elevationM;
      if (max === null || r.elevationM > max) max = r.elevationM;
    }
    return {
      samples: profileRows, gain, loss, min, max, medianAccuracy, validCount: screened.length,
      totalCount: (input || []).length, spikesRejected, barometerCount, quality,
      climbThresholdM: climbThreshold, stepM: STEP_M
    };
  }

  return { process, zigzag, median, STEP_M };
});
