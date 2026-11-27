/* VELOX Charts 1.0 — interaktive, barrierearme SVG-Profile ohne Abhängigkeiten.
   Berühren/Ziehen (oder Pfeiltasten) zeigt Werte; onHover erlaubt, die Position auf der Karte zu markieren. */
(function (root) {
  "use strict";
  const finite = Number.isFinite;
  const fmt = (n, d) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uid = 0;

  function niceStep(range, target) {
    const raw = Math.max(range, 1e-9) / target, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const mixRgb = (c1, c2, t) => "rgb(" + lerp(c1[0], c2[0], t) + "," + lerp(c1[1], c2[1], t) + "," + lerp(c1[2], c2[2], t) + ")";
  function gradeColor(g) {
    if (g >= 1.5) return mixRgb([233, 178, 96], [222, 84, 80], Math.min(1, (g - 1.5) / 8.5));
    if (g <= -1.5) return mixRgb([118, 178, 228], [58, 108, 204], Math.min(1, (-g - 1.5) / 8.5));
    return "#8fa6b8";
  }
  function thin(rows, max) {
    if (rows.length <= max) return rows;
    const stride = Math.ceil(rows.length / max), out = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 0 || i === rows.length - 1 || i % stride === 0 || rows[i].segment !== rows[i - 1].segment || rows[i].segment !== rows[i + 1].segment) out.push(rows[i]);
    }
    return out;
  }
  function nearestIndex(rows, x) {
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].x < x) lo = mid; else hi = mid; }
    return Math.abs(rows[lo].x - x) <= Math.abs(rows[hi].x - x) ? lo : hi;
  }

  function profileChart(box, cfg) {
    if (!box) return null;
    const rows = (cfg.rows || []).filter((r) => finite(r.x) && finite(r.y));
    if (rows.length < 2) { box.innerHTML = '<div class="empty-state">' + esc(cfg.emptyText || "Nicht genügend Daten.") + "</div>"; return null; }
    const W = Math.max(240, Math.min(640, box.clientWidth || 640)), H = cfg.height || 200, L = 46, R = 16, T = 22, B = 26, pw = W - L - R, ph = H - T - B;
    const id = "vx" + (++uid), zeroBase = cfg.baseline === "zero";
    const xMax = Math.max(1, cfg.xMax || rows[rows.length - 1].x);
    let yLo = Infinity, yHi = -Infinity;
    rows.forEach((r) => { if (r.y < yLo) yLo = r.y; if (r.y > yHi) yHi = r.y; });
    if (finite(cfg.reference)) { yLo = Math.min(yLo, cfg.reference); yHi = Math.max(yHi, cfg.reference); }
    if (cfg.yMin !== undefined) yLo = Math.min(yLo, cfg.yMin);
    if (cfg.yMax !== undefined) yHi = Math.max(yHi, cfg.yMax);
    if (zeroBase) { yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0); }
    const pad = Math.max((yHi - yLo) * 0.1, cfg.minPad || 2);
    const yStep = niceStep(yHi - yLo + pad * 2, 4);
    const yMin = cfg.yMin !== undefined && !zeroBase && cfg.snapMin ? cfg.yMin : Math.floor((yLo - pad) / yStep) * yStep;
    const yMax = Math.ceil((yHi + pad) / yStep) * yStep;
    const xFor = (v) => L + v / xMax * pw, yFor = (v) => T + (yMax - v) / (yMax - yMin) * ph;
    const base = zeroBase ? yFor(0) : T + ph;
    const yFmt = cfg.yFormat || ((v) => fmt(v, 0));

    let grid = "";
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) {
      const y = yFor(v);
      grid += '<line class="vx-grid" x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '"/><text class="vx-axis-label" x="' + (L - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + yFmt(v) + "</text>";
    }
    const kmMax = xMax / 1000, kmStep = niceStep(kmMax, Math.max(2, Math.floor(pw / 62)));
    const kmDigits = Math.max(0, Math.ceil(-Math.log10(kmStep)));
    let xTicks = "";
    for (let k = 0; k <= kmMax + 1e-9; k += kmStep) {
      const x = xFor(k * 1000);
      xTicks += '<line class="vx-tick" x1="' + x.toFixed(1) + '" y1="' + (T + ph) + '" x2="' + x.toFixed(1) + '" y2="' + (T + ph + 4) + '"/><text class="vx-axis-label" x="' + x.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + fmt(k, kmDigits) + (k === 0 ? " km" : "") + "</text>";
    }

    const shown = thin(rows, cfg.maxPoints || 480);
    const groups = [];
    shown.forEach((r) => {
      const g = groups[groups.length - 1];
      if (g && g[g.length - 1].segment === r.segment) g.push(r); else groups.push([r]);
    });
    const areas = cfg.area === false ? "" : groups.filter((g) => g.length > 1).map((g) =>
      '<path class="vx-area" fill="url(#' + id + 'g)" d="M ' + xFor(g[0].x).toFixed(1) + " " + base.toFixed(1) + " L " +
      g.map((r) => xFor(r.x).toFixed(1) + " " + yFor(r.y).toFixed(1)).join(" L ") + " L " + xFor(g[g.length - 1].x).toFixed(1) + " " + base.toFixed(1) + ' Z"/>').join("");
    let lines = "";
    groups.forEach((g) => {
      let run = [], color = null;
      const flush = () => { if (run.length > 1) lines += '<path class="vx-line" stroke="' + color + '" d="M ' + run.join(" L ") + '"/>'; run = []; };
      for (let i = 1; i < g.length; i++) {
        const c = cfg.colorAt ? cfg.colorAt(g[i - 1], g[i]) : "#5bd6c5";
        const p0 = xFor(g[i - 1].x).toFixed(1) + " " + yFor(g[i - 1].y).toFixed(1), p1 = xFor(g[i].x).toFixed(1) + " " + yFor(g[i].y).toFixed(1);
        if (c !== color) { flush(); color = c; run = [p0]; }
        run.push(p1);
      }
      flush();
    });
    const bands = (cfg.bands || []).map((b) => {
      const x1 = xFor(Math.max(0, b.from)), x2 = xFor(Math.min(xMax, b.to));
      return '<rect class="vx-band" x="' + x1.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, x2 - x1).toFixed(1) + '" height="' + ph + '"/>' +
        (b.label ? '<text class="vx-band-label" x="' + (x1 + 4).toFixed(1) + '" y="' + (T + 11) + '">' + esc(b.label) + "</text>" : "");
    }).join("");
    let marks = "";
    if (cfg.extremes) {
      const hi = rows.reduce((m, r) => (r.y > m.y ? r : m), rows[0]), lo = rows.reduce((m, r) => (r.y < m.y ? r : m), rows[0]);
      const mark = (r, up) => {
        const x = xFor(r.x), y = yFor(r.y), anchor = x > W - 70 ? "end" : x < L + 50 ? "start" : "middle";
        return '<circle class="vx-mark" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2"/><text class="vx-mark-label" x="' + x.toFixed(1) + '" y="' + (up ? y - 7 : y + 14).toFixed(1) + '" text-anchor="' + anchor + '">' + yFmt(r.y) + " " + esc(cfg.unit || "") + "</text>";
      };
      marks = mark(hi, true) + (hi === lo ? "" : mark(lo, false));
    }
    const a0 = rows[0], a1 = rows[rows.length - 1];
    const ends = '<circle class="vx-end vx-start" cx="' + xFor(a0.x).toFixed(1) + '" cy="' + yFor(a0.y).toFixed(1) + '" r="3.6"/><circle class="vx-end vx-finish" cx="' + xFor(a1.x).toFixed(1) + '" cy="' + yFor(a1.y).toFixed(1) + '" r="3.6"/>';
    const zero = zeroBase ? '<line class="vx-zero" x1="' + L + '" y1="' + base.toFixed(1) + '" x2="' + (W - R) + '" y2="' + base.toFixed(1) + '"/>' : "";

    const reference = finite(cfg.reference) ? '<line class="vx-reference" x1="' + L + '" x2="' + (W - R) + '" y1="' + yFor(cfg.reference) + '" y2="' + yFor(cfg.reference) + '"/>' : "";

    box.innerHTML = '<div class="vx-chart"><svg class="vx-svg" viewBox="0 0 ' + W + " " + H + '" tabindex="0" role="img" aria-label="' + esc(cfg.ariaLabel || "Profil") + ' Mit Pfeiltasten oder Wischen Werte ansehen.">' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + (cfg.areaColor || "#6d91b8") + '" stop-opacity=".34"/><stop offset="100%" stop-color="' + (cfg.areaColor || "#6d91b8") + '" stop-opacity=".02"/></linearGradient></defs>' +
      (cfg.yTitle ? '<text class="vx-axis-title" x="' + L + '" y="9" text-anchor="start">' + esc(cfg.yTitle) + "</text>" : "") +
      grid + bands + areas + zero + reference + '<line class="vx-axis" x1="' + L + '" y1="' + (T + ph) + '" x2="' + (W - R) + '" y2="' + (T + ph) + '"/>' + xTicks + lines + marks + ends +
      '<g class="vx-cursor" hidden><line class="vx-cross" y1="' + T + '" y2="' + (T + ph) + '"/><circle class="vx-dot" r="4.6"/></g></svg><div class="vx-tip" hidden></div><span class="vx-value-announcement" aria-live="polite"></span></div>';

    const svg = box.querySelector(".vx-svg"), tip = box.querySelector(".vx-tip"), cursor = box.querySelector(".vx-cursor");
    if (!svg || !tip || !cursor) return { rows };
    const cross = cursor.querySelector(".vx-cross"), dot = cursor.querySelector(".vx-dot");
    const announcement = box.querySelector(".vx-value-announcement");
    let hideTimer = null, index = 0;
    function showAt(i, announce = false) {
      index = Math.max(0, Math.min(rows.length - 1, i));
      const r = rows[index], x = xFor(r.x), y = yFor(r.y);
      cursor.removeAttribute("hidden");
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      dot.setAttribute("fill", cfg.colorAt && index > 0 ? cfg.colorAt(rows[index - 1], r) : "#5bd6c5");
      const lines = (cfg.tooltip ? cfg.tooltip(r) : [["Distanz", fmt(r.x / 1000, 2) + " km"], [cfg.yTitle || "Wert", yFmt(r.y)]]);
      tip.innerHTML = lines.map((l) => "<span>" + esc(l[0]) + "</span><strong>" + esc(l[1]) + "</strong>").join("");
      tip.removeAttribute("hidden");
      tip.style.left = "clamp(" + tip.offsetWidth / 2 + "px, " + x / W * 100 + "%, calc(100% - " + tip.offsetWidth / 2 + "px))";
      if (announce && announcement) announcement.textContent = lines.map((line) => line.join(" ")).join(", ");
      if (cfg.onHover) cfg.onHover(r);
    }
    function hide() {
      cursor.setAttribute("hidden", ""); tip.setAttribute("hidden", "");
      if (cfg.onHover) cfg.onHover(null);
    }
    const fromClient = (clientX) => {
      const rect = svg.getBoundingClientRect();
      return nearestIndex(rows, ((clientX - rect.left) / rect.width * W - L) / pw * xMax);
    };
    svg.addEventListener("pointerdown", (e) => { clearTimeout(hideTimer); showAt(fromClient(e.clientX)); });
    svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) { clearTimeout(hideTimer); showAt(fromClient(e.clientX)); } });
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    svg.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 3500); } });
    svg.addEventListener("pointercancel", hide);
    svg.addEventListener("keydown", (e) => {
      const step = Math.max(1, Math.round(rows.length / 60));
      if (e.key === "ArrowRight") { e.preventDefault(); showAt(index + step, true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); showAt(index - step, true); }
      else if (e.key === "Home") { e.preventDefault(); showAt(0, true); }
      else if (e.key === "End") { e.preventDefault(); showAt(rows.length - 1, true); }
      else if (e.key === "Escape") hide();
    });
    svg.addEventListener("blur", hide);
    return { rows, showAt, hide };
  }

  root.VELOXCharts = { profileChart, gradeColor, nearestIndex, niceStep };
})(typeof self !== "undefined" ? self : this);
