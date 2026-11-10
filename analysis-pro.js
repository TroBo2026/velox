/* VELOX Pro Analysis 0.7.0 — read-only ride analytics */
(() => {
  "use strict";
  const DB_NAME = "velox-local";
  const STORE = "rides";
  const MIN_SEGMENT_M = 0.8;
  const MAX_SEGMENT_M = 150;
  const MAX_GAP_S = 30;
  const MAX_SPEED_KMH = 100;
  const MIN_MOVING_KMH = 1.5;
  const $ = (id) => document.getElementById(id);
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const fmtTime = (seconds) => {
    const total = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function quantile(values, fraction) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }
  function haversine(a, b) {
    const radius = 6371000;
    const radians = (degrees) => degrees * Math.PI / 180;
    const lat1 = radians(a.lat), lat2 = radians(b.lat);
    const dLat = lat2 - lat1, dLon = radians(b.lon - a.lon);
    const value = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
  }
  function validCoordinate(point) {
    return point && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
      Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180 &&
      Number.isFinite(point.t);
  }
  function profileFromPoints(points, pointMeta) {
    const raw = [];
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const metadata = pointMeta[index];
      const accuracy = Number.isFinite(point.altAccuracy) ? point.altAccuracy : null;
      if (!metadata || metadata.useAltitude === false || !Number.isFinite(point.alt) || point.alt < -1000 || point.alt > 10000) continue;
      if (accuracy !== null && (accuracy < 0 || accuracy > 35)) continue;
      raw.push({
        distanceM: metadata.distanceM,
        altitude: point.alt,
        time: point.t,
        segment: metadata.segment,
        accuracy
      });
    }
    const smooth = raw.map((sample, index) => {
      const nearby = [];
      for (let offset = -2; offset <= 2; offset++) {
        const candidate = raw[index + offset];
        if (candidate && candidate.segment === sample.segment &&
            Math.abs(candidate.distanceM - sample.distanceM) <= 100 &&
            Math.abs(candidate.time - sample.time) <= 60000) nearby.push(candidate.altitude);
      }
      return Object.assign({}, sample, {
        elevationM: median(nearby.length >= 3 ? nearby : [sample.altitude])
      });
    });
    let gain = 0, loss = 0, anchor = null, lastSegment = null;
    for (const sample of smooth) {
      if (sample.segment !== lastSegment) {
        lastSegment = sample.segment;
        anchor = sample.elevationM;
        continue;
      }
      const delta = sample.elevationM - anchor;
      if (delta >= 4) {
        gain += delta;
        anchor = sample.elevationM;
      } else if (delta <= -4) {
        loss += -delta;
        anchor = sample.elevationM;
      }
    }
    const accuracyValues = smooth.filter((sample) => sample.accuracy !== null).map((sample) => sample.accuracy);
    const elevations = smooth.map((sample) => sample.elevationM);
    const grades = [];
    for (let index = 1; index < smooth.length; index++) {
      const first = smooth[index - 1], last = smooth[index];
      const distance = last.distanceM - first.distanceM;
      const elapsed = (last.time - first.time) / 1000;
      if (first.segment !== last.segment || distance < 8 || distance > 120 || elapsed <= 0 || elapsed > 90) continue;
      const grade = (last.elevationM - first.elevationM) / distance * 100;
      if (Number.isFinite(grade) && Math.abs(grade) <= 35) grades.push({ grade, distance });
    }
    let weightedGrade = 0, weightedDistance = 0;
    const gradeBands = [
      { label: "Starke Abfahrt (< −6 %)", min: -35, max: -6, distance: 0 },
      { label: "Leichte Abfahrt (−6 bis −2 %)", min: -6, max: -2, distance: 0 },
      { label: "Flach (−2 bis +2 %)", min: -2, max: 2, distance: 0 },
      { label: "Leichter Anstieg (+2 bis +6 %)", min: 2, max: 6, distance: 0 },
      { label: "Steiler Anstieg (> +6 %)", min: 6, max: 35, distance: 0 }
    ];
    grades.forEach((item) => {
      weightedGrade += item.grade * item.distance;
      weightedDistance += item.distance;
      let band = gradeBands.find((candidate) => item.grade >= candidate.min &&
        (item.grade < candidate.max || (candidate.max === 35 && item.grade <= 35)));
      if (band) band.distance += item.distance;
    });
    return {
      samples: smooth,
      gain,
      loss,
      min: elevations.length ? elevations.reduce((value, current) => Math.min(value, current), Infinity) : null,
      max: elevations.length ? elevations.reduce((value, current) => Math.max(value, current), -Infinity) : null,
      medianAccuracy: median(accuracyValues),
      validCount: raw.length,
      totalPoints: points.length,
      averageGrade: weightedDistance ? weightedGrade / weightedDistance : null,
      gradeBands,
      gradeDistance: weightedDistance
    };
  }
  function splitSegments(segments, splitLengthM) {
    const splits = new Map();
    let distanceCursor = 0;
    segments.forEach((segment) => {
      let remainingDistance = segment.distanceM;
      let remainingTime = segment.moving ? segment.durationS : 0;
      while (remainingDistance > 0.0001) {
        const splitIndex = Math.floor((distanceCursor + 0.000001) / splitLengthM);
        const offset = distanceCursor - splitIndex * splitLengthM;
        const portion = Math.min(remainingDistance, splitLengthM - offset);
        const timePortion = segment.distanceM ? remainingTime * portion / remainingDistance : 0;
        let split = splits.get(splitIndex);
        if (!split) {
          split = { number: splitIndex + 1, distanceM: 0, movingSeconds: 0, speeds: [] };
          splits.set(splitIndex, split);
        }
        split.distanceM += portion;
        split.movingSeconds += timePortion;
        if (segment.moving) split.speeds.push(segment.speedKmh);
        distanceCursor += portion;
        remainingDistance -= portion;
        remainingTime -= timePortion;
      }
    });
    return Array.from(splits.values()).map((split) => Object.assign({}, split, {
      averageSpeed: split.movingSeconds > 0 ? split.distanceM / split.movingSeconds * 3.6 : 0
    }));
  }
  function analyzeRide(ride, splitKm) {
    const points = Array.isArray(ride.points) ? ride.points : [];
    const segments = [], pointMeta = new Array(points.length).fill(null);
    const rejected = { invalid: 0, clock: 0, gap: 0, jump: 0, speed: 0, accuracy: 0 };
    let distanceM = 0, movingSeconds = 0, stoppedGpsSeconds = 0, gapSeconds = 0, acceptedIntervalCount = 0;
    const speedValues = [], speedZones = [
      { label: "0–10 km/h", min: 0, max: 10, seconds: 0 },
      { label: "10–20 km/h", min: 10, max: 20, seconds: 0 },
      { label: "20–30 km/h", min: 20, max: 30, seconds: 0 },
      { label: "Über 30 km/h", min: 30, max: Infinity, seconds: 0 }
    ];
    let segmentNumber = 0;
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!validCoordinate(point)) {
        rejected.invalid++;
        segmentNumber++;
        continue;
      }
      if (index === 0 || !validCoordinate(points[index - 1])) {
        pointMeta[index] = { distanceM, segment: segmentNumber, useAltitude: true };
        continue;
      }
      const previous = points[index - 1];
      const durationS = (point.t - previous.t) / 1000;
      if (!Number.isFinite(durationS) || durationS <= 0) {
        rejected.clock++;
        segmentNumber++;
        pointMeta[index] = { distanceM, segment: segmentNumber };
        continue;
      }
      if (durationS > MAX_GAP_S) {
        rejected.gap++;
        gapSeconds += durationS;
        segmentNumber++;
        pointMeta[index] = { distanceM, segment: segmentNumber };
        continue;
      }
      const horizontalAccuracy = [previous.accuracy, point.accuracy].filter(Number.isFinite);
      if (horizontalAccuracy.some((value) => value > 80 || value < 0)) {
        rejected.accuracy++;
        segmentNumber++;
        pointMeta[index] = { distanceM, segment: segmentNumber };
        continue;
      }
      const segmentDistance = haversine(previous, point);
      if (!Number.isFinite(segmentDistance) || segmentDistance > MAX_SEGMENT_M) {
        rejected.jump++;
        segmentNumber++;
        pointMeta[index] = { distanceM, segment: segmentNumber };
        continue;
      }
      if (segmentDistance < MIN_SEGMENT_M) {
        acceptedIntervalCount++;
        stoppedGpsSeconds += durationS;
        pointMeta[index] = { distanceM, segment: segmentNumber, useAltitude: false };
        continue;
      }
      const speed = segmentDistance / durationS * 3.6;
      if (!Number.isFinite(speed) || speed > MAX_SPEED_KMH) {
        rejected.speed++;
        segmentNumber++;
        pointMeta[index] = { distanceM, segment: segmentNumber, useAltitude: true };
        continue;
      }
      acceptedIntervalCount++;
      const moving = speed >= MIN_MOVING_KMH;
      if (!moving) {
        stoppedGpsSeconds += durationS;
        pointMeta[index] = { distanceM, segment: segmentNumber, useAltitude: false };
        continue;
      }
      segments.push({
        distanceM: segmentDistance,
        durationS,
        speedKmh: speed,
        moving: true,
        fromIndex: index - 1,
        toIndex: index
      });
      distanceM += segmentDistance;
      movingSeconds += durationS;
      speedValues.push(speed);
      const zone = speedZones.find((item) => speed >= item.min && speed < item.max);
      if (zone) zone.seconds += durationS;
      pointMeta[index] = { distanceM, segment: segmentNumber, useAltitude: true };
    }
    const start = Number.isFinite(ride.startedAt) ? ride.startedAt : (points[0] && points[0].t) || Date.now();
    const end = Number.isFinite(ride.endedAt) ? ride.endedAt : (points[points.length - 1] && points[points.length - 1].t) || start;
    const paused = Math.max(0, Number(ride.pausedMs) || 0);
    const elapsedSeconds = Math.max(0, (end - start - paused) / 1000);
    const stoppedSeconds = Math.max(0, elapsedSeconds - movingSeconds);
    const elevation = profileFromPoints(points, pointMeta);
    const splitLengthM = Math.max(500, (Number(splitKm) || 5) * 1000);
    const splits = splitSegments(segments.filter((segment) => segment.moving), splitLengthM);
    const acceptedSegments = segments.length;
    const intervalCount = Math.max(0, points.length - 1);
    const acceptedRatio = intervalCount ? acceptedIntervalCount / intervalCount : 0;
    const accuracyValues = points.map((point) => point && point.accuracy).filter((value) => Number.isFinite(value) && value >= 0);
    const goodAccuracyRatio = accuracyValues.length
      ? accuracyValues.filter((value) => value <= 20).length / accuracyValues.length
      : null;
    let quality = "Nicht ausreichend";
    if (acceptedRatio >= 0.8 && goodAccuracyRatio !== null && goodAccuracyRatio >= 0.7) quality = "Gut";
    else if (acceptedRatio >= 0.6 && (goodAccuracyRatio === null || goodAccuracyRatio >= 0.4)) quality = "Mittel";
    else if (acceptedSegments > 0) quality = "Eingeschränkt";
    const movingAverage = movingSeconds ? distanceM / movingSeconds * 3.6 : 0;
    const overallAverage = elapsedSeconds ? distanceM / elapsedSeconds * 3.6 : 0;
    return {
      ride,
      points,
      segments,
      distanceM,
      movingSeconds,
      elapsedSeconds,
      stoppedSeconds,
      stoppedGpsSeconds,
      gapSeconds,
      averageSpeed: movingAverage,
      overallAverage,
      maxSpeed: speedValues.length ? speedValues.reduce((value, current) => Math.max(value, current), 0) : 0,
      p95Speed: quantile(speedValues, 0.95),
      medianSpeed: median(speedValues),
      speedZones,
      elevation,
      splits,
      quality,
      acceptedSegments,
      acceptedIntervalCount,
      intervalCount,
      acceptedRatio,
      rejected,
      goodAccuracyRatio,
      speedValues
    };
  }
  function readRides() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onerror = () => reject(request.error || new Error("Lokale Tourdatenbank nicht erreichbar."));
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction(STORE, "readonly");
        const read = transaction.objectStore(STORE).getAll();
        read.onsuccess = () => resolve((read.result || []).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)));
        read.onerror = () => reject(read.error || new Error("Touren konnten nicht gelesen werden."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error("Lesetransaktion fehlgeschlagen."));
        };
      };
    });
  }
  function dateLabel(timestamp) {
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "Unbekanntes Datum";
  }
  function card(label, value, note) {
    return '<article class="vx-pro-card"><span>' + label + '</span><strong>' + value + '</strong><small>' + (note || "") + '</small></article>';
  }
  function progressRow(label, value, total, note) {
    const percent = total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
    return '<div class="vx-pro-bar-row"><div><span>' + label + '</span><strong>' + fmt(value / 60, 1) + ' min · ' + fmt(percent, 0) + ' %</strong></div><div class="vx-pro-track"><i style="width:' + percent + '%"></i></div>' + (note ? '<small>' + note + '</small>' : '') + '</div>';
  }
  function renderSingle(result, splitKm) {
    const e = result.elevation;
    const qualityNote = result.goodAccuracyRatio === null
      ? "GPS-Genauigkeit wurde vom Gerät nicht für alle Punkte gemeldet."
      : fmt(result.goodAccuracyRatio * 100, 0) + " % der gemeldeten Positionsgenauigkeiten liegen bei höchstens 20 m.";
    const cards = [
      card("Strecke", fmt(result.distanceM / 1000) + " km", result.acceptedSegments + " Bewegungsabschnitte"),
      card("Bewegungszeit", fmtTime(result.movingSeconds), "Nur gültige Fahrintervalle"),
      card("Gesamtzeit", fmtTime(result.elapsedSeconds), "Aufzeichnungszeit abzüglich Pausen"),
      card("Stand- / Lückenzeit", fmtTime(result.stoppedSeconds), "Nicht als Fahrzeit gewertet"),
      card("Ø während der Fahrt", fmt(result.averageSpeed) + " km/h", "Distanz ÷ Bewegungszeit"),
      card("Ø über Gesamtzeit", fmt(result.overallAverage) + " km/h", "Distanz ÷ Gesamtzeit"),
      card("Max. gültiges Tempo", fmt(result.maxSpeed) + " km/h", "Ausreißer oberhalb 100 km/h ausgeschlossen"),
      card("95. Perzentil", result.p95Speed === null ? "–" : fmt(result.p95Speed) + " km/h", "Robuster Vergleichswert des Tempos"),
      card("Aufstieg / Abstieg", "+" + Math.round(e.gain) + " / −" + Math.round(e.loss) + " m", e.validCount + " gültige Höhenpunkte"),
      card("Höchster / tiefster Punkt", e.max === null ? "–" : Math.round(e.max) + " / " + Math.round(e.min) + " m", "Aus geglätteten GPS-Höhenwerten"),
      card("Höhenqualität", e.medianAccuracy === null ? "Nicht bewertet" : fmt(e.medianAccuracy) + " m", "Median der gemeldeten vertikalen Ungenauigkeit"),
      card("Ø Steigung", e.averageGrade === null ? "–" : fmt(e.averageGrade) + " %", "Nur ausreichend lange Höhenabschnitte")
    ].join("");
    const zoneRows = result.speedZones.map((zone) =>
      progressRow(zone.label, zone.seconds, result.movingSeconds, "Anteil an der erkannten Bewegungszeit")
    ).join("");
    const gradeRows = e.gradeBands.map((band) =>
      '<div class="vx-pro-grade-row"><span>' + band.label + '</span><strong>' +
      fmt(band.distance / 1000, 2) + ' km</strong></div>'
    ).join("");
    const splitRows = result.splits.length
      ? result.splits.map((split) =>
        '<tr><td>' + split.number + '</td><td>' + fmt(split.distanceM / 1000, 2) + ' km</td><td>' +
        fmtTime(split.movingSeconds) + '</td><td>' + fmt(split.averageSpeed) + ' km/h</td></tr>'
      ).join("")
      : '<tr><td colspan="4">Nicht genügend gültige GPS-Daten für Splits.</td></tr>';
    const rejected = result.rejected;
    const rejectionRows = [
      ["Zeitstempel ungültig", rejected.clock],
      ["GPS-Lücke über 30 Sekunden", rejected.gap],
      ["Positionssprung über 150 m", rejected.jump],
      ["Unplausibles Tempo über 100 km/h", rejected.speed],
      ["Positionsgenauigkeit schlechter als 80 m", rejected.accuracy],
      ["Ungültiger GPS-Punkt", rejected.invalid]
    ].map((row) => '<div class="vx-pro-audit-row"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>').join("");
    return '<div class="vx-pro-cards">' + cards + '</div>' +
      '<div class="vx-pro-columns"><section class="vx-pro-subpanel"><h4>Tempoverteilung</h4>' + zoneRows +
      '</section><section class="vx-pro-subpanel"><h4>Steigungsverteilung</h4>' + gradeRows +
      '<p class="vx-pro-note">Aus GPS-Höhenwerten; ohne echte Höhenmessdaten werden keine Steigungen ergänzt.</p></section></div>' +
      '<section class="vx-pro-subpanel"><div class="vx-pro-heading-row"><h4>' + fmt(splitKm, 0) + '-km-Splits</h4><span>Bewegungszeit je Abschnitt</span></div>' +
      '<div class="vx-pro-table-wrap"><table class="vx-pro-table"><thead><tr><th>Split</th><th>Distanz</th><th>Zeit</th><th>Ø Tempo</th></tr></thead><tbody>' + splitRows +
      '</tbody></table></div></section>' +
      '<section class="vx-pro-subpanel"><h4>GPS-Datenprüfung</h4><div class="vx-pro-quality"><strong>' + result.quality +
      '</strong><span>' + fmt(result.acceptedRatio * 100, 0) + ' % der Zeit-/Punktintervalle akzeptiert · ' + qualityNote +
      '</span></div><div class="vx-pro-audit-grid">' + rejectionRows + '</div><p class="vx-pro-note">' +
      result.acceptedIntervalCount + ' gültige Intervalle von ' + result.intervalCount + '. GPS-Lücken: ' +
      fmt(result.gapSeconds / 60, 1) + ' min. Erkannte Standzeit aus kurzen GPS-Schritten: ' +
      fmt(result.stoppedGpsSeconds / 60, 1) + ' min.</p></section>';
  }
  function renderArchive(rides, analyses) {
    const total = analyses.reduce((sum, item) => ({
      distance: sum.distance + item.distanceM,
      moving: sum.moving + item.movingSeconds,
      elapsed: sum.elapsed + item.elapsedSeconds,
      gain: sum.gain + item.elevation.gain,
      loss: sum.loss + item.elevation.loss
    }), { distance: 0, moving: 0, elapsed: 0, gain: 0, loss: 0 });
    const longest = analyses.slice().sort((a, b) => b.distanceM - a.distanceM)[0];
    const fastest = analyses.slice().sort((a, b) => b.averageSpeed - a.averageSpeed)[0];
    const climbing = analyses.slice().sort((a, b) => b.elevation.gain - a.elevation.gain)[0];
    const records = [
      ["Längste Tour", longest, longest ? fmt(longest.distanceM / 1000) + " km" : "–"],
      ["Höchster Aufstieg", climbing, climbing ? "+" + Math.round(climbing.elevation.gain) + " m" : "–"],
      ["Höchstes Ø-Fahrtempo", fastest, fastest ? fmt(fastest.averageSpeed) + " km/h" : "–"]
    ].map((row) => '<div class="vx-pro-record"><span>' + row[0] + '</span><strong>' + row[2] +
      '</strong><small>' + (row[1] ? escapeHtml(row[1].ride.name || "Fahrradtour") + " · " + dateLabel(row[1].ride.startedAt) : "Noch keine Tour") +
      '</small></div>').join("");
    return '<div class="vx-pro-cards">' +
      card("Touren", rides.length, "Lokal gespeicherte Fahrten") +
      card("Gesamtdistanz", fmt(total.distance / 1000) + " km", "Nur plausible GPS-Abschnitte") +
      card("Bewegungszeit", fmtTime(total.moving), "Summe der erkannten Fahrintervalle") +
      card("Aufstieg / Abstieg", "+" + Math.round(total.gain) + " / −" + Math.round(total.loss) + " m", "Gefilterte GPS-Höhenwerte") +
      card("Ø Fahrtempo", fmt(total.moving ? total.distance / total.moving * 3.6 : 0) + " km/h", "Gesamtdistanz ÷ Bewegungszeit") +
      card("Gesamtzeit", fmtTime(total.elapsed), "Pausen abgezogen") +
      '</div><section class="vx-pro-subpanel"><h4>Deine Archiv-Rekorde</h4><div class="vx-pro-record-grid">' + records +
      '</div></section><p class="vx-pro-note">Die Archivsumme wird aus allen gespeicherten Touren neu berechnet. Fehlende oder unplausible GPS-Abschnitte werden nicht als Strecke gezählt.</p>';
  }
  function init() {
    const page = $("page-stats");
    if (!page || $("veloxProAnalysis")) return;
    const style = document.createElement("style");
    style.textContent = [
      ".vx-pro-panel{margin-top:14px}",
      ".vx-pro-controls{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}",
      ".vx-pro-controls label{display:flex;flex:1;min-width:170px;flex-direction:column;gap:6px;color:var(--muted);font-size:10px;font-weight:700}",
      ".vx-pro-controls select,.vx-pro-refresh{min-height:42px;padding:0 12px;border:1px solid var(--line);border-radius:11px;background:#0b1925;color:var(--text);font:inherit;font-size:12px}",
      ".vx-pro-refresh{font-weight:700;cursor:pointer;min-height:44px;touch-action:manipulation}",
      ".vx-pro-controls select{min-height:44px;touch-action:manipulation}",
      ".vx-pro-controls select:focus-visible,.vx-pro-refresh:focus-visible{outline:3px solid var(--teal);outline-offset:3px}",
      ".vx-pro-table-wrap{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}",
      ".vx-pro-table{width:100%;min-width:390px;border-collapse:collapse;font-variant-numeric:tabular-nums}",
      ".vx-pro-table th,.vx-pro-table td{padding:9px 7px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}",
      "@media(prefers-reduced-motion:reduce){.vx-pro-panel *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}",
      ".vx-pro-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:13px 0}",
      ".vx-pro-card{min-width:0;padding:13px;border:1px solid var(--line);border-radius:14px;background:#0b1925}",
      ".vx-pro-card>span,.vx-pro-card>small{display:block;color:var(--muted);font-size:10px;line-height:1.45}",
      ".vx-pro-card>strong{display:block;margin:7px 0 4px;font-family:Manrope,sans-serif;font-size:clamp(18px,4vw,25px);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}",
      ".vx-pro-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}",
      ".vx-pro-subpanel{min-width:0;margin-top:12px;padding:14px;border:1px solid var(--line);border-radius:15px;background:#0b1925}",
      ".vx-pro-subpanel h4{margin:0 0 12px;font-family:Manrope,sans-serif;font-size:14px}",
      ".vx-pro-heading-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}",
      ".vx-pro-heading-row span,.vx-pro-note{color:var(--muted);font-size:10px;line-height:1.55}",
      ".vx-pro-bar-row{margin:10px 0}",
      ".vx-pro-bar-row>div:first-child{display:flex;justify-content:space-between;gap:6px;color:var(--muted);font-size:10px}",
      ".vx-pro-bar-row strong{color:var(--text);white-space:nowrap}",
      ".vx-pro-track{height:7px;margin-top:6px;border-radius:9px;background:#203546;overflow:hidden}",
      ".vx-pro-track i{display:block;height:100%;border-radius:9px;background:var(--teal)}",
      ".vx-pro-grade-row,.vx-pro-audit-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:10px}",
      ".vx-pro-grade-row span,.vx-pro-audit-row span{color:var(--muted)}",
      ".vx-pro-grade-row strong,.vx-pro-audit-row strong{font-variant-numeric:tabular-nums}",
      ".vx-pro-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}",
      ".vx-pro-table{width:100%;min-width:340px;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}",
      ".vx-pro-table th,.vx-pro-table td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}",
      ".vx-pro-table th:first-child,.vx-pro-table td:first-child{text-align:left}",
      ".vx-pro-table thead th{color:var(--teal);font-size:10px}",
      ".vx-pro-quality{display:flex;flex-direction:column;gap:5px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#102131}",
      ".vx-pro-quality strong{color:var(--teal);font-family:Manrope,sans-serif;font-size:15px}",
      ".vx-pro-quality span{color:var(--muted);font-size:10px;line-height:1.55}",
      ".vx-pro-audit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px;margin-top:8px}",
      ".vx-pro-record-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".vx-pro-record{display:flex;flex-direction:column;gap:5px;padding:10px;border:1px solid var(--line);border-radius:11px}",
      ".vx-pro-record span,.vx-pro-record small{color:var(--muted);font-size:9px;line-height:1.4}",
      ".vx-pro-record strong{font-size:18px;font-family:Manrope,sans-serif}",
      ".vx-pro-empty{padding:18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px;line-height:1.6}",
      "@media(max-width:520px){.vx-pro-columns{grid-template-columns:1fr}.vx-pro-record-grid{grid-template-columns:1fr}.vx-pro-audit-grid{grid-template-columns:1fr}}"
    ].join("");
    document.head.appendChild(style);
    page.insertAdjacentHTML("beforeend",
      '<section class="panel vx-pro-panel" id="veloxProAnalysis" aria-labelledby="vxProHeading">' +
      '<span class="eyebrow">VELOX PRO ANALYSE</span><h3 id="vxProHeading">Touren im Detail</h3>' +
      '<p>Zusätzliche Auswertung aus deinen lokal gespeicherten GPS-Daten. Die Analyse verändert keine Tour.</p>' +
      '<div class="vx-pro-controls"><label>TOUR AUSWÄHLEN<select id="vxProRide" aria-label="Tour für die Analyse auswählen"><option value="all">Alle Touren · Archiv</option></select></label>' +
      '<label>SPLIT-LÄNGE<select id="vxProSplit" aria-label="Länge der Streckenabschnitte"><option value="1">1 Kilometer</option><option value="5" selected>5 Kilometer</option><option value="10">10 Kilometer</option></select></label>' +
      '<button class="vx-pro-refresh" id="vxProRefresh" type="button" aria-label="Tourenanalyse neu berechnen">Neu berechnen</button></div>' +
      '<div id="vxProResult" role="status" aria-live="polite" aria-atomic="true"><div class="vx-pro-empty">Tourdaten werden lokal eingelesen …</div></div>' +
      '<p class="vx-pro-note">Messgrenzen: GPS-Lücken über 30 s, Positionssprünge über 150 m, Genauigkeit schlechter als 80 m und Geschwindigkeiten über 100 km/h werden nicht für die Distanz gewertet. Bewegungszeit zählt gültige Abschnitte ab 1,5 km/h. Das sind nachvollziehbare Filter, keine Garantie für perfekte GPS-Messungen.</p>' +
      '</section>'
    );
    $("vxProRefresh").addEventListener("click", loadAndRender);
    $("vxProRide").addEventListener("change", renderSelected);
    $("vxProSplit").addEventListener("change", renderSelected);
    document.addEventListener("click", (event) => {
      if (event.target.closest('[data-page="stats"]')) setTimeout(loadAndRender, 250);
    });
    loadAndRender();
  }
  let ridesCache = [];
  let analysesCache = [];
  async function loadAndRender() {
    const host = $("vxProResult");
    if (!host) return;
    host.innerHTML = '<div class="vx-pro-empty">Tourdaten werden lokal ausgewertet …</div>';
    try {
      ridesCache = await readRides();
      const select = $("vxProRide");
      const previous = select.value;
      select.innerHTML = '<option value="all">Alle Touren · Archiv</option>' +
        ridesCache.map((ride) => '<option value="' + escapeHtml(String(ride.id)) + '">' +
          escapeHtml(ride.name || "Fahrradtour") + " · " + dateLabel(ride.startedAt) + '</option>').join("");
      if (ridesCache.some((ride) => String(ride.id) === previous)) select.value = previous;
      renderSelected();
    } catch (error) {
      console.error(error);
      host.innerHTML = '<div class="vx-pro-empty">Die lokale Tourendatenbank konnte nicht gelesen werden. Bitte VELOX neu laden. Deine gespeicherten Touren wurden nicht verändert.</div>';
    }
  }
  function renderSelected() {
    const host = $("vxProResult");
    if (!host) return;
    const splitKm = Number($("vxProSplit").value) || 5;
    analysesCache = ridesCache.map((ride) => analyzeRide(ride, splitKm));
    const selectedId = $("vxProRide").value;
    if (selectedId === "all") {
      host.innerHTML = ridesCache.length
        ? renderArchive(ridesCache, analysesCache)
        : '<div class="vx-pro-empty">Noch keine Touren gespeichert. Nach deiner ersten Fahrt erscheinen hier Splits, Tempoverteilung, Höhenwerte und Datenqualität.</div>';
      return;
    }
    const index = ridesCache.findIndex((ride) => String(ride.id) === selectedId);
    if (index < 0) {
      host.innerHTML = '<div class="vx-pro-empty">Diese Tour ist nicht mehr im Archiv vorhanden. Bitte die Auswahl neu laden.</div>';
      return;
    }
    host.innerHTML = renderSingle(analysesCache[index], splitKm);
  }
  window.VELOXProAnalysis = Object.freeze({ version: "0.7.0", analyzeRide });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();