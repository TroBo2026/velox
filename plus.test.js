/* VELOX Plus: Tests der reinen Rechen- und Grafikfunktionen. Ausführen: node plus.test.js */
const P = require("./velox-plus.js");
let failed = false;
const ok = (c, m) => { if (!c) { console.log("  ✗", m); failed = true; } else console.log("  ✓", m); };
const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();
const dist = (r) => r.km * 1000;

// Dienstag, 17.11.2026 → Woche beginnt Montag, 16.11.2026
const now = at(2026, 11, 17);
ok(P.weekStart(now) === at(2026, 11, 16, 0), "Wochenbeginn ist Montag 00:00");
ok(P.weekStart(at(2026, 11, 22, 23)) === at(2026, 11, 16, 0), "Sonntag gehört noch zur selben Woche");
ok(P.weekStart(at(2026, 11, 23, 0)) === at(2026, 11, 23, 0), "Montag 00:00 beginnt die nächste Woche");

const rides = [
  { id: "a", startedAt: at(2026, 11, 16, 7), km: 12.5, status: "completed" },   // diese Woche
  { id: "b", startedAt: at(2026, 11, 17, 8), km: 7.5, status: "completed" },    // diese Woche
  { id: "c", startedAt: at(2026, 11, 10, 18), km: 30, status: "completed" },    // Vorwoche
  { id: "d", startedAt: at(2026, 11, 2, 9), km: 20, status: "completed" },      // vor 2 Wochen
  { id: "e", startedAt: at(2026, 9, 1, 9), km: 99, status: "completed" },       // zu alt (außerhalb 8 Wochen)
  { id: "f", startedAt: at(2026, 11, 17, 9), km: 50, status: "recording" },     // läuft noch → nicht zählen
  { id: "g", startedAt: at(2026, 11, 17, 10), km: NaN, status: "completed" }    // kaputte Distanz → 0
];
const b = P.weeklyBuckets(rides, now, 8, dist);
ok(b.length === 8, "8 Wochen-Behälter");
ok(b[7].start === at(2026, 11, 16, 0) && b[0].start < b[7].start, "Reihenfolge: älteste zuerst, aktuelle Woche zuletzt");
ok(Math.abs(b[7].distanceM - 20000) < 1e-6 && b[7].count === 3, "Aktuelle Woche: 20 km, laufende Tour ausgeschlossen (" + b[7].distanceM + " m, " + b[7].count + ")");
ok(Math.abs(b[6].distanceM - 30000) < 1e-6, "Vorwoche: 30 km");
ok(Math.abs(b[5].distanceM - 20000) < 1e-6, "Vorvorwoche: 20 km");
ok(b.reduce((s, x) => s + x.distanceM, 0) === 70000, "Zu alte Tour (99 km) wird ignoriert");
ok(P.weeklyBuckets(null, now, 4, dist).length === 4 && P.weeklyBuckets(undefined, now, 4, dist)[3].count === 0, "Leere/ungültige Eingabe bleibt stabil");
ok(P.weeklyBuckets(rides, now, 8, () => { throw new Error("x"); })[7].distanceM === 0, "Fehler in der Distanzberechnung bricht nichts ab");

ok(P.streakWeeks(b) === 3, "Serie: 3 Wochen in Folge");
const emptyCurrent = P.weeklyBuckets(rides.slice(2, 4), now, 8, dist);
ok(P.streakWeeks(emptyCurrent) === 2, "Leere laufende Woche unterbricht die Serie nicht");
ok(P.streakWeeks(P.weeklyBuckets([], now, 8, dist)) === 0, "Ohne Touren keine Serie");
const gap = P.weeklyBuckets([rides[0], rides[3]], now, 8, dist);
ok(P.streakWeeks(gap) === 1, "Lücke beendet die Serie");

ok(P.goalProgress(25000, 50) === 0.5, "Fortschritt 50 %");
ok(P.goalProgress(80000, 50) === 1, "Fortschritt wird bei 100 % gedeckelt");
ok(P.goalProgress(1000, 0) === 0 && P.goalProgress(1000, "abc") === 0, "Ungültiges Ziel ergibt 0");
ok(P.normalizeGoal("42") === 42 && P.normalizeGoal("42,6") === 43 && P.normalizeGoal(" 100 ") === 100, "Ziel wird gerundet und akzeptiert Komma");
ok(P.normalizeGoal("0") === null && P.normalizeGoal("1001") === null && P.normalizeGoal("") === null && P.normalizeGoal("x") === null && P.normalizeGoal(null) === null, "Unsinnige Ziele werden abgelehnt");

const ring = P.ringSvg(0.5, "50 %", "von 50 km", "Test");
ok(/stroke-dasharray="163\.\d+ 326\.\d+"/.test(ring), "Ring: halber Kreisumfang gezeichnet");
ok(!/vx-ring-value/.test(P.ringSvg(0, "0 %", "von 50 km", "Test")), "Ring: bei 0 % kein Punkt");
ok(/&lt;/.test(P.ringSvg(0.1, "<b>", "x", "<i>")) && !/<b>/.test(P.ringSvg(0.1, "<b>", "x", "<i>")), "Ring: Texte werden maskiert");

const svg = P.barsSvg(b, 50);
ok((svg.match(/class="vx-bar[ "]/g) || []).length === 3, "Balken: nur Wochen mit Distanz (3)");
ok(/vx-bar-current/.test(svg) && /Ziel 50 km/.test(svg) && /role="img"/.test(svg), "Balken: aktuelle Woche, Ziellinie und Barrierefreiheit");
ok(!/NaN|undefined|Infinity/.test(svg) && !/NaN|undefined|Infinity/.test(P.barsSvg(P.weeklyBuckets([], now, 8, dist), 50)), "Balken: keine NaN/undefined, auch ohne Daten");

console.log(failed ? "\nFEHLER" : "\nVELOX-Plus-Tests bestanden");
process.exit(failed ? 1 : 0);
