/* VELOX Charts 1.1 — responsive, accessible SVG profiles without external dependencies.
   Keeps GPS gaps separate, preserves local extrema when reducing dense series, and supports touch + keyboard inspection. */
(function (root) {
  "use strict";
  const finite = Number.isFinite;
  const fmt = (n, d) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uid = 0;

  function niceStep(range, target) {
    const raw = Math.max(range, 1e-9) / target;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const factor = raw / pow;
    return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * pow;
  }
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const mixRgb = (a, b, t) => "rgb(" + lerp(a[0], b[0], t) + "," + lerp(a[1], b[1], t) + "," + lerp(a[2], b[2], t) + ")";
  function gradeColor(grade) {
    if (grade >= 1.5) return mixRgb([233, 178, 96], [222, 84, 80], Math.min(1, (grade - 1.5) / 8.5));
    if (grade <= -1.5) return mixRgb([118, 178, 228], [58, 108, 204], Math.min(1, (-grade - 1.5) / 8.5));
    return "#8fa6b8";
  }

  // Min/max bucket reduction retains sharp climbs and descents that uniform sampling can miss.
  function thin(rows, max) {
    if (rows.length <= max) return rows;
    const segments = [];
    rows.forEach((row, index) => {
      const key = row.segment === undefined ? "__continuous__" : String(row.segment);
      let group = segments[segments.length - 1];
      if (!group || group.key !== key) segments.push(group = { key, rows: [] });
      group.rows.push({ row, index });
    });
    const total = rows.length, budget = Math.max(2, Math.floor(max / segments.length));
    const out = [];
    segments.forEach((segment, segmentIndex) => {
      const source = segment.rows;
      if (source.length <= budget) {
        source.forEach(item => out.push(item.row));
        return;
      }
      const bucketCount = Math.max(1, Math.floor((budget - 2) / 2));
      const bucketSize = source.length / bucketCount;
      const selected = new Set([0, source.length - 1]);
      for (let b = 0; b < bucketCount; b++) {
        const start = Math.floor(b * bucketSize);
        const end = Math.min(source.length, Math.floor((b + 1) * bucketSize));
        let min = start, maxIndex = start;
        for (let i = start + 1; i < end; i++) {
          if (source[i].row.y < source[min].row.y) min = i;
          if (source[i].row.y > source[maxIndex].row.y) maxIndex = i;
        }
        selected.add(min);
        selected.add(maxIndex);
      }
      Array.from(selected).sort((a, b) => a - b).forEach(i => out.push(source[i].row));
    });
    return out;
  }

  function nearestIndex(rows, x) {
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].x < x) lo = mid;
      else hi = mid;
    }
    return Math.abs(rows[lo].x - x) <= Math.abs(rows[hi].x - x) ? lo : hi;
  }

  function profileChart(box, cfg) {
    if (!box) return null;
    const rows = (cfg.rows || []).filter(row => finite(row.x) && finite(row.y)).slice().sort((a, b) => a.x - b.x);
    if (rows.length < 2) {
      box.innerHTML = '<div class="empty-state">' + esc(cfg.emptyText || "Nicht genügend Daten.") + "</div>";
      return null;
    }

    const W = 720, H = Math.max(168, Math.min(300, cfg.height || 210));
    const L = 54, R = 16, T = 18, B = cfg.xTitle ? 43 : 30;
    const plotW = W - L - R, plotH = H - T - B;
    const id = "vx" + (++uid), zeroBase = cfg.baseline === "zero";
    const xMax = Math.max(1, finite(cfg.xMax) ? cfg.xMax : rows[rows.length - 1].x);
    let yLo = Math.min(...rows.map(row => row.y)), yHi = Math.max(...rows.map(row => row.y));
    if (finite(cfg.yMin)) yLo = Math.min(yLo, cfg.yMin);
    if (finite(cfg.yMax)) yHi = Math.max(yHi, cfg.yMax);
    if (zeroBase) { yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0); }
    const padding = Math.max((yHi - yLo) * .12, cfg.minPad || 2);
    const step = niceStep(yHi - yLo + padding * 2, 4);
    const yMin = finite(cfg.yMin) && cfg.snapMin && !zeroBase ? cfg.yMin : Math.floor((yLo - padding) / step) * step;
    const yMax = finite(cfg.yMax) ? Math.max(cfg.yMax, Math.ceil((yHi + padding) / step) * step) : Math.ceil((yHi + padding) / step) * step;
    const safeYMax = yMax > yMin ? yMax : yMin + 1;
    const xFor = value => L + value / xMax * plotW;
    const yFor = value => T + (safeYMax - value) / (safeYMax - yMin) * plotH;
    const base = zeroBase ? yFor(0) : T + plotH;
    const yFormat = cfg.yFormat || (value => fmt(value, 0));

    let grid = "";
    for (let value = Math.ceil(yMin / step) * step; value <= safeYMax + 1e-9; value += step) {
      const y = yFor(value);
      grid += '<line class="vx-grid" x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="vx-axis-label" x="' + (L - 9) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + esc(yFormat(value)) + "</text>";
    }

    const distanceKm = xMax / 1000, xStep = niceStep(distanceKm, 5);
    const tickValues = [];
    for (let value = 0; value <= distanceKm + 1e-9; value += xStep) tickValues.push(value);
    if (!tickValues.length || distanceKm - tickValues[tickValues.length - 1] > xStep * .35) tickValues.push(distanceKm);
    let xTicks = "";
    tickValues.forEach((km, index) => {
      const x = xFor(km * 1000);
      xTicks += '<line class="vx-tick" x1="' + x.toFixed(1) + '" y1="' + (T + plotH) + '" x2="' + x.toFixed(1) + '" y2="' + (T + plotH + 4) + '"/>' +
        '<text class="vx-axis-label" x="' + x.toFixed(1) + '" y="' + (H - (cfg.xTitle ? 20 : 8)) + '" text-anchor="middle">' +
        fmt(km, xStep < 1 ? 1 : 0) + "</text>";
    });

    const shown = thin(rows, cfg.maxPoints || 640);
    const groups = [];
    shown.forEach(row => {
      const group = groups[groups.length - 1];
      if (group && group[group.length - 1].segment === row.segment) group.push(row);
      else groups.push([row]);
    });
    const area = cfg.area === false ? "" : groups.filter(group => group.length > 1).map(group =>
      '<path class="vx-area" fill="url(#' + id + 'g)" d="M ' + xFor(group[0].x).toFixed(1) + " " + base.toFixed(1) +
      " L " + group.map(row => xFor(row.x).toFixed(1) + " " + yFor(row.y).toFixed(1)).join(" L ") +
      " L " + xFor(group[group.length - 1].x).toFixed(1) + " " + base.toFixed(1) + ' Z"/>'
    ).join("");

    let lines = "";
    groups.forEach(group => {
      let run = [], color = null;
      const flush = () => {
        if (run.length > 1) lines += '<path class="vx-line" stroke="' + color + '" d="M ' + run.join(" L ") + '"/>';
        run = [];
      };
      for (let i = 1; i < group.length; i++) {
        const nextColor = cfg.colorAt ? cfg.colorAt(group[i - 1], group[i]) : "#5bd6c5";
        const p0 = xFor(group[i - 1].x).toFixed(1) + " " + yFor(group[i - 1].y).toFixed(1);
        const p1 = xFor(group[i].x).toFixed(1) + " " + yFor(group[i].y).toFixed(1);
        if (nextColor !== color) { flush(); color = nextColor; run = [p0]; }
        run.push(p1);
      }
      flush();
    });

    const bands = (cfg.bands || []).map(band => {
      const x1 = xFor(Math.max(0, band.from)), x2 = xFor(Math.min(xMax, band.to));
      return '<rect class="vx-band" x="' + x1.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, x2 - x1).toFixed(1) + '" height="' + plotH + '"/>' +
        (band.label ? '<text class="vx-band-label" x="' + (x1 + 5).toFixed(1) + '" y="' + (T + 13) + '">' + esc(band.label) + "</text>" : "");
    }).join("");
    const reference = finite(cfg.referenceLine) && cfg.referenceLine >= yMin && cfg.referenceLine <= safeYMax
      ? '<line class="vx-reference" x1="' + L + '" y1="' + yFor(cfg.referenceLine).toFixed(1) + '" x2="' + (W - R) + '" y2="' + yFor(cfg.referenceLine).toFixed(1) + '"/>' : "";

    let marks = "";
    if (cfg.extremes) {
      const high = rows.reduce((best, row) => row.y > best.y ? row : best, rows[0]);
      const low = rows.reduce((best, row) => row.y < best.y ? row : best, rows[0]);
      const mark = (row, isHigh) => {
        const x = xFor(row.x), y = yFor(row.y);
        const anchor = x > W - 82 ? "end" : x < L + 58 ? "start" : "middle";
        return '<circle class="vx-mark" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.8"/>' +
          '<text class="vx-mark-label" x="' + x.toFixed(1) + '" y="' + (isHigh ? y - 8 : y + 15).toFixed(1) + '" text-anchor="' + anchor + '">' +
          esc(yFormat(row.y)) + " " + esc(cfg.unit || "") + "</text>";
      };
      marks = mark(high, true) + (high === low ? "" : mark(low, false));
    }
    const first = rows[0], last = rows[rows.length - 1];
    const ends = '<circle class="vx-end vx-start" cx="' + xFor(first.x).toFixed(1) + '" cy="' + yFor(first.y).toFixed(1) + '" r="4"/>' +
      '<circle class="vx-end vx-finish" cx="' + xFor(last.x).toFixed(1) + '" cy="' + yFor(last.y).toFixed(1) + '" r="4"/>';
    const zero = zeroBase ? '<line class="vx-zero" x1="' + L + '" y1="' + base.toFixed(1) + '" x2="' + (W - R) + '" y2="' + base.toFixed(1) + '"/>' : "";

    box.innerHTML = '<div class="vx-chart"><svg class="vx-svg" viewBox="0 0 ' + W + " " + H +
      '" tabindex="0" role="img" aria-label="' + esc(cfg.ariaLabel || "Profil") +
      ' Mit Pfeiltasten oder Berührung Messwerte ansehen.">' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' +
      esc(cfg.areaColor || "#5bd6c5") + '" stop-opacity=".30"/><stop offset="100%" stop-color="' +
      esc(cfg.areaColor || "#5bd6c5") + '" stop-opacity=".015"/></linearGradient></defs>' +
      (cfg.yTitle ? '<text class="vx-axis-title" x="' + L + '" y="10">' + esc(cfg.yTitle) + "</text>" : "") +
      grid + bands + area + reference + zero +
      '<line class="vx-axis" x1="' + L + '" y1="' + (T + plotH) + '" x2="' + (W - R) + '" y2="' + (T + plotH) + '"/>' +
      xTicks + lines + marks + ends +
      (cfg.xTitle ? '<text class="vx-axis-title vx-x-axis-title" x="' + (L + plotW / 2) + '" y="' + (H - 3) + '" text-anchor="middle">' + esc(cfg.xTitle) + "</text>" : "") +
      '<g class="vx-cursor" hidden><line class="vx-cross" y1="' + T + '" y2="' + (T + plotH) + '"/><circle class="vx-dot" r="5"/></g>' +
      '</svg><div class="vx-tip" role="status" aria-live="polite" hidden></div></div>' +
      (cfg.caption ? '<p class="vx-chart-caption">' + esc(cfg.caption) + "</p>" : "");

    const svg = box.querySelector(".vx-svg"), tip = box.querySelector(".vx-tip"), cursor = box.querySelector(".vx-cursor");
    if (!svg || !tip || !cursor) return { rows };
    const cross = cursor.querySelector(".vx-cross"), dot = cursor.querySelector(".vx-dot");
    let hideTimer = null, activePointer = null, index = 0;
    function showAt(nextIndex) {
      index = Math.max(0, Math.min(rows.length - 1, nextIndex));
      const row = rows[index], x = xFor(row.x), y = yFor(row.y);
      cursor.removeAttribute("hidden");
      cross.setAttribute("x1", x); cross.setAttribute("x2", x);
      dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      dot.setAttribute("fill", cfg.colorAt && index > 0 ? cfg.colorAt(rows[index - 1], row) : "#5bd6c5");
      const values = cfg.tooltip ? cfg.tooltip(row) : [["Distanz", fmt(row.x / 1000, 2) + " km"], [cfg.yTitle || "Wert", yFormat(row.y)]];
      tip.innerHTML = values.map(item => "<span>" + esc(item[0]) + "</span><strong>" + esc(item[1]) + "</strong>").join("");
      tip.style.left = Math.max(12, Math.min(88, x / W * 100)) + "%";
      tip.removeAttribute("hidden");
      if (cfg.onHover) cfg.onHover(row);
    }
    function hide() {
      cursor.setAttribute("hidden", "");
      tip.setAttribute("hidden", "");
      if (cfg.onHover) cfg.onHover(null);
    }
    function fromClient(clientX) {
      const rect = svg.getBoundingClientRect();
      const viewX = (clientX - rect.left) / rect.width * W;
      return nearestIndex(rows, (viewX - L) / plotW * xMax);
    }
    svg.addEventListener("pointerdown", event => {
      clearTimeout(hideTimer);
      activePointer = event.pointerId;
      try { svg.setPointerCapture(event.pointerId); } catch (_) {}
      showAt(fromClient(event.clientX));
    });
    svg.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse" || event.pointerId === activePointer) {
        clearTimeout(hideTimer);
        showAt(fromClient(event.clientX));
      }
    });
    svg.addEventListener("pointerup", event => {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      if (event.pointerType !== "mouse") {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 5000);
      }
    });
    svg.addEventListener("pointercancel", () => { activePointer = null; hide(); });
    svg.addEventListener("pointerleave", event => { if (event.pointerType === "mouse") hide(); });
    svg.addEventListener("keydown", event => {
      const jump = Math.max(1, Math.round(rows.length / 70));
      if (event.key === "ArrowRight") { event.preventDefault(); showAt(index + jump); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); showAt(index - jump); }
      else if (event.key === "Home") { event.preventDefault(); showAt(0); }
      else if (event.key === "End") { event.preventDefault(); showAt(rows.length - 1); }
      else if (event.key === "Escape") hide();
    });
    svg.addEventListener("blur", hide);
    return { rows, showAt, hide };
  }

  root.VELOXCharts = Object.freeze({ profileChart, gradeColor, nearestIndex, niceStep, thin });
})(typeof self !== "undefined" ? self : this);
