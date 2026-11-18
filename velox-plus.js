/* VELOX Plus 0.13.0 — getrennte Wochenziele und Wochenüberblicke je Sportprofil.
   Reine Zusatzdatei: liest nur vorhandene IndexedDB-Daten (wie analysis-pro.js) und verändert nie eine Tour.
   Browser: window.VELOXPlus · Node: module.exports (für tests/plus.test.js). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.VELOXPlus = api; api.start(); }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  const DB_NAME = "velox-local", STORE = "rides", GOAL_KEY = "velox-weekly-goal", PROFILE_KEY = "velox-active-profile";
  const DEFAULT_GOAL_KM = 50, MIN_GOAL_KM = 5, MAX_GOAL_KM = 1000, WEEKS = 8;
  const finite = Number.isFinite;
  const fmt = (n, d = 1) => Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Reine Rechenfunktionen (getestet) ---------- */
  function weekStart(ts) {                       // Montag 00:00 Ortszeit
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d.getTime();
  }
  function weeklyBuckets(rides, now, weeks, distanceOf) {
    const count = Math.max(1, weeks | 0), current = weekStart(now), starts = [];
    for (let i = count - 1; i >= 0; i--) { const d = new Date(current); d.setDate(d.getDate() - 7 * i); starts.push(d.getTime()); }
    const buckets = starts.map((start) => ({ start, distanceM: 0, count: 0 }));
    const index = new Map(buckets.map((b, i) => [b.start, i]));
    (Array.isArray(rides) ? rides : []).forEach((ride) => {
      if (!ride || !finite(ride.startedAt) || ride.status === "recording" || ride.status === "paused") return;
      const i = index.get(weekStart(ride.startedAt));
      if (i === undefined) return;
      let m = 0;
      try { m = Number(distanceOf(ride)); } catch (error) { m = 0; }
      buckets[i].distanceM += finite(m) && m > 0 ? m : 0;
      buckets[i].count++;
    });
    return buckets;
  }
  function streakWeeks(buckets) {                // laufende, noch leere Woche unterbricht die Serie nicht
    let i = buckets.length - 1, n = 0;
    if (i >= 0 && buckets[i].count === 0) i--;
    for (; i >= 0 && buckets[i].count > 0; i--) n++;
    return n;
  }
  function goalProgress(distanceM, goalKm) {
    const g = Number(goalKm);
    return finite(g) && g > 0 ? Math.max(0, Math.min(1, distanceM / 1000 / g)) : 0;
  }
  function normalizeGoal(value) {
    const n = Math.round(Number(String(value).replace(",", ".")));
    return finite(n) && n >= MIN_GOAL_KM && n <= MAX_GOAL_KM ? n : null;
  }

  /* ---------- Grafiken (SVG-Strings, nur Zahlen und feste Texte) ---------- */
  function ringSvg(progress, mainText, subText, label) {
    const r = 52, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, progress));
    const value = p > 0
      ? '<circle class="vx-ring-value" cx="66" cy="66" r="52" stroke-dasharray="' + (c * p).toFixed(2) + " " + c.toFixed(2) + '" transform="rotate(-90 66 66)"/>'
      : "";
    return '<svg class="vx-ring" viewBox="0 0 132 132" role="img" aria-label="' + esc(label) + '">' +
      '<defs><linearGradient id="vxRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#62dfcf"/><stop offset="100%" stop-color="#6aa7ff"/></linearGradient></defs>' +
      '<circle class="vx-ring-track" cx="66" cy="66" r="52"/>' + value +
      '<text class="vx-ring-main" x="66" y="68" text-anchor="middle">' + esc(mainText) + '</text>' +
      '<text class="vx-ring-sub" x="66" y="84" text-anchor="middle">' + esc(subText) + '</text></svg>';
  }
  function barsSvg(buckets, goalKm) {
    const W = 320, H = 138, padX = 6, top = 20, bottom = 22, ph = H - top - bottom;
    const kms = buckets.map((b) => b.distanceM / 1000);
    const max = Math.max(1, goalKm || 0, ...kms) * 1.08;
    const slot = (W - padX * 2) / buckets.length, bw = Math.min(30, slot * 0.6);
    const y = (km) => top + ph - km / max * ph;
    let bars = "";
    buckets.forEach((b, i) => {
      const km = kms[i], x = padX + slot * i + (slot - bw) / 2, h = Math.max(km > 0 ? 3 : 0, km / max * ph);
      const d = new Date(b.start), label = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + ".";
      const current = i === buckets.length - 1;
      bars += (h > 0 ? '<rect class="vx-bar' + (current ? " vx-bar-current" : "") + (km >= goalKm ? " vx-bar-goal" : "") + '" x="' + x.toFixed(1) + '" y="' + (top + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"/>' : "") +
        (km > 0 ? '<text class="vx-bar-value" x="' + (x + bw / 2).toFixed(1) + '" y="' + (top + ph - h - 5).toFixed(1) + '" text-anchor="middle">' + fmt(km, km < 10 ? 1 : 0) + '</text>' : "") +
        '<text class="vx-bar-label' + (current ? " vx-bar-label-current" : "") + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + label + '</text>';
    });
    const goalLine = goalKm > 0 ? '<line class="vx-goal-line" x1="' + padX + '" x2="' + (W - padX) + '" y1="' + y(goalKm).toFixed(1) + '" y2="' + y(goalKm).toFixed(1) + '"/><text class="vx-goal-tag" x="' + (W - padX) + '" y="' + (y(goalKm) - 4).toFixed(1) + '" text-anchor="end">Ziel ' + fmt(goalKm, 0) + ' km</text>' : "";
    const summary = buckets.map((b) => fmt(b.distanceM / 1000, 1) + " Kilometer").join(", ");
    return '<svg class="vx-bars" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Kilometer pro Woche, älteste zuerst: ' + esc(summary) + '.">' +
      '<line class="vx-bars-base" x1="' + padX + '" x2="' + (W - padX) + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '"/>' + goalLine + bars + '</svg>';
  }

  /* ---------- Browser-Teil ---------- */
  const state = { rides: [], timer: null, memo: new Map() };
  function storedGoal(profile) {
    try { return normalizeGoal(root.localStorage.getItem(GOAL_KEY + "-" + profile)) || normalizeGoal(root.localStorage.getItem(GOAL_KEY)) || DEFAULT_GOAL_KM; } catch (error) { return DEFAULT_GOAL_KM; }
  }
  function saveGoal(km, profile) { try { root.localStorage.setItem(GOAL_KEY + "-" + profile, String(km)); } catch (error) { /* Speicher gesperrt: Ziel gilt bis zum Neuladen */ } }
  function isProfileRide(ride, profile) { return profile === "running" ? ride && ride.activityType === "running" : ride && ride.activityType !== "running"; }
  function selectedProfile() { try { const p = root.localStorage.getItem(PROFILE_KEY); return p === "running" || p === "cycling" ? p : null; } catch (error) { return null; } }
  function distanceOf(ride) {
    const Core = root.VELOXCore;
    if (!Core || !Array.isArray(ride.points)) return 0;
    const key = ride.id + "|" + ride.points.length + "|" + ride.endedAt;
    const hit = state.memo.get(key);
    if (hit !== undefined) return hit;
    const m = Core.scan(ride.points).distanceM;
    if (state.memo.size > 300) state.memo.clear();
    state.memo.set(key, m);
    return m;
  }
  function readRides() {                          // gleiches Muster wie analysis-pro.js: nur lesen
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { const d = request.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }); };
      request.onerror = () => reject(request.error || new Error("Tourdatenbank nicht erreichbar."));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve([]); return; }
        const tx = db.transaction(STORE, "readonly"), read = tx.objectStore(STORE).getAll();
        read.onsuccess = () => resolve(read.result || []);
        read.onerror = () => reject(read.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  function renderProfile(profile) {
    const goalKm = storedGoal(profile), now = Date.now();
    const recent = state.rides.filter((r) => r && isProfileRide(r, profile) && finite(r.startedAt) && r.startedAt >= weekStart(now) - 7 * 86400000 * WEEKS);
    const buckets = weeklyBuckets(recent, now, WEEKS, distanceOf), current = buckets[buckets.length - 1];
    const km = current.distanceM / 1000, progress = goalProgress(current.distanceM, goalKm), streak = streakWeeks(buckets);
    const suffix = profile === "running" ? "running" : "cycling";
    const ring = root.document.getElementById("vxGoalRing-" + suffix), text = root.document.getElementById("vxGoalText-" + suffix), bars = root.document.getElementById("vxWeeksChart-" + suffix);
    const sport = profile === "running" ? "Laufkilometer" : "Fahrradkilometer";
    if (ring) ring.innerHTML = ringSvg(progress, Math.round(progress * 100) + " %", "von " + fmt(goalKm, 0) + " km", "Wochenziel: " + fmt(km, 1) + " von " + fmt(goalKm, 0) + " " + sport + " erreicht");
    if (text) {
      const left = Math.max(0, goalKm - km);
      text.innerHTML = '<strong>' + fmt(km, 1) + ' <small>km diese Woche</small></strong><p>' +
        (progress >= 1 ? "Wochenziel erreicht. Jeder weitere Kilometer ist Bonus." : current.count === 0 ? "Noch keine Aktivität seit Montag. Deine nächste " + (profile === "running" ? "Laufrunde" : "Fahrradtour") + " zählt hier." : "Noch " + fmt(left, 1) + " km bis zum Wochenziel.") +
        '</p><small class="vx-goal-streak">' + (streak > 0 ? streak + (streak === 1 ? " Woche" : " Wochen") + " in Folge aktiv" : "Serie startet mit deiner nächsten Aktivität") + '</small>';
    }
    if (bars) bars.innerHTML = barsSvg(buckets, goalKm);
  }
  function render() {
    renderProfile("running");renderProfile("cycling");
    const active = selectedProfile();
    ["running","cycling"].forEach(profile=>{
      const panel=root.document.getElementById("vxWeeks-"+profile);
      if(panel)panel.hidden=active!==profile;
    });
  }
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      try { state.rides = await readRides(); render(); } catch (error) { console.warn("VELOX Plus:", error); }
    }, 250);
  }
  function openGoalDialog(current, profile) {
    return new Promise((resolve) => {
      const dlg = root.document.createElement("dialog");
      dlg.className = "vx-sheet";
      const sport = profile === "running" ? "Laufen" : "Radfahren";
      dlg.innerHTML = '<form method="dialog"><h3>Wochenziel · ' + sport + '</h3><div class="vx-sheet-body"><p>Wie viele Kilometer möchtest du pro Woche (Montag bis Sonntag) beim ' + sport + ' erreichen? Dieses Ziel zählt ausschließlich für dein ' + (profile === "running" ? "Laufprofil" : "Fahrradprofil") + '.</p>' +
        '<label class="vx-field">Kilometer pro Woche<input name="km" type="number" inputmode="numeric" min="' + MIN_GOAL_KM + '" max="' + MAX_GOAL_KM + '" step="5" required value="' + current + '"></label></div>' +
        '<div class="vx-sheet-actions"><button type="submit" value="save" class="primary-button">Speichern</button><button type="submit" value="cancel" class="secondary-button" formnovalidate>Abbrechen</button></div></form>';
      root.document.body.appendChild(dlg);
      dlg.addEventListener("close", () => {
        let value = null;
        try { value = new FormData(dlg.querySelector("form")).get("km"); } catch (error) { /* ignorieren */ }
        const action = dlg.returnValue;
        dlg.remove();
        resolve(action === "save" ? normalizeGoal(value) : null);
      });
      dlg.showModal();
    });
  }
  function mount() {
    const doc = root.document;
    ["running","cycling"].forEach(profile=>{
      const suffix=profile==="running"?"running":"cycling";
      const page=profile==="running"?"running-dashboard":"cycling-dashboard";
      const grid=doc.querySelector("#page-"+page+" .metric-grid");
      if(grid&&!doc.getElementById("vxGoal-"+suffix)){
        grid.insertAdjacentHTML("afterend",
          '<section class="panel vx-goal" id="vxGoal-'+suffix+'" aria-labelledby="vxGoalHeading-'+suffix+'"><div class="vx-goal-ring" id="vxGoalRing-'+suffix+'"></div>'+
          '<div class="vx-goal-body"><span class="eyebrow">WOCHENZIEL · '+(profile==="running"?"LAUFEN":"RADFAHREN")+'</span><h3 id="vxGoalHeading-'+suffix+'">Deine Woche</h3><div id="vxGoalText-'+suffix+'" class="vx-goal-text"></div>'+
          (typeof root.HTMLDialogElement==="function"?'<button class="secondary-button compact" id="vxGoalEdit-'+suffix+'" type="button">Ziel ändern</button>':"")+'</div></section>');
      }
      const edit=doc.getElementById("vxGoalEdit-"+suffix);
      if(edit)edit.addEventListener("click",async()=>{
        const km=await openGoalDialog(storedGoal(profile),profile);
        if(km!==null){saveGoal(km,profile);render();}
      });
    });
    const compare=doc.querySelector("#page-stats .ride-comparison-panel");
    if(compare){
      ["running","cycling"].forEach(profile=>{
        const id="vxWeeks-"+profile;
        if(!doc.getElementById(id))compare.insertAdjacentHTML("afterend",
          '<section class="panel vx-weeks" id="'+id+'" aria-labelledby="'+id+'Heading" hidden><span class="eyebrow">WOCHENÜBERBLICK · '+(profile==="running"?"LAUFEN":"RADFAHREN")+'</span><h3 id="'+id+'Heading">Kilometer pro Woche</h3>'+
          '<div id="vxWeeksChart-'+profile+'" class="vx-weeks-chart"></div><p class="small-note">Die letzten '+WEEKS+' Wochen (Montag bis Sonntag), ausschließlich '+(profile==="running"?"Laufen":"Radfahren")+'. Gezählt wird nur die gültige GPS-Strecke.</p></section>');
      });
    }
    const total=doc.getElementById("totalRides"),status=doc.getElementById("trackingStatus");
    if(typeof root.MutationObserver==="function"){
      if(total)new root.MutationObserver(schedule).observe(total,{childList:true,characterData:true,subtree:true});
      if(status)new root.MutationObserver(()=>doc.body.classList.toggle("vx-recording",/Aufzeichnung läuft/.test(status.textContent))).observe(status,{childList:true,characterData:true,subtree:true});
    }
    doc.addEventListener("visibilitychange",()=>{if(doc.visibilityState==="visible")schedule();});
    root.addEventListener("velox:profilechange",schedule);
    schedule();
  }
  function start() {
    if (typeof root.document === "undefined" || !root.indexedDB) return;
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  return { weekStart, weeklyBuckets, streakWeeks, goalProgress, normalizeGoal, ringSvg, barsSvg, start, version: "0.13.0" };
});
