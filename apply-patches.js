/* VELOX Patches 0.12.1 — wendet die Änderungen an app.js, index.html, analysis-pro.js und README.md an.
   Aufruf im Repository-Ordner:  node apply-patches.js
   Sicher: Jede Stelle muss genau einmal gefunden werden, sonst wird NICHTS verändert. Mehrfaches Ausführen schadet nicht. */
const fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || ".");
const patches = [
 {
  "file": "app.js",
  "edits": [
   {
    "title": "Versionsnummer in der Kopfzeile",
    "old": "/* VELOX 0.11.0 — local-first running + cycling tracker */",
    "new": "/* VELOX 0.12.1 — local-first running + cycling tracker */"
   },
   {
    "title": "App-Version",
    "old": "const APP_VERSION = \"0.12.0\";",
    "new": "const APP_VERSION = \"0.12.1\";"
   },
   {
    "title": "Live-Karte: Hilfsfunktion, die Linien und Marker wirklich von der Karte entfernt",
    "old": "function drawLive(points,force=false){",
    "new": "function clearLiveLayers(){\n    if(liveMap){liveLines.forEach(line=>liveMap.removeLayer(line));if(liveMarker)liveMap.removeLayer(liveMarker);}\n    liveLines=[];liveMarker=null;\n  }\n  function drawLive(points,force=false){"
   },
   {
    "title": "Live-Karte: beim Start einer Aktivität alte Ebenen entfernen (Geisterstrecke)",
    "old": "liveMap=liveMap||initMap(\"liveMap\");liveLines=[];liveMarker=null;",
    "new": "liveMap=liveMap||initMap(\"liveMap\");clearLiveLayers();"
   },
   {
    "title": "Live-Karte: beim Neuzeichnen alte Ebenen entfernen statt nur die Liste zu leeren",
    "old": "if(liveMap){attachLiveMap();liveLines=[];liveMarker=null;drawLive(points,true);",
    "new": "if(liveMap){attachLiveMap();clearLiveLayers();drawLive(points,true);"
   },
   {
    "title": "Streckenabschnitte: Stillstand (identische Position) trennt die Route nicht",
    "old": "Number.isFinite(d)&&d>=0.1&&d<=300&&d/dt*3.6<=180;",
    "new": "Number.isFinite(d)&&d>=0&&d<=300&&d/dt*3.6<=180;"
   },
   {
    "title": "Sensorstatus: ehrliche Anzeige, wenn keine Höhe vorliegt",
    "old": ":source===\"barometer\"?\"Barometer\":\"GPS\";",
    "new": ":source===\"barometer\"?\"Barometer\":source===\"unavailable\"?\"Keine verwertbare Höhe\":\"GPS\";"
   }
  ]
 },
 {
  "file": "index.html",
  "edits": [
   {
    "title": "Neues Stylesheet einbinden",
    "old": "<link rel=\"stylesheet\" href=\"./velox-extras.css\">",
    "new": "<link rel=\"stylesheet\" href=\"./velox-extras.css\">\n  <link rel=\"stylesheet\" href=\"./velox-polish.css\">"
   },
   {
    "title": "Zusatzmodul einbinden",
    "old": "<script src=\"./analysis-pro.js\"></script>",
    "new": "<script src=\"./analysis-pro.js\"></script>\n  <script src=\"./velox-plus.js\"></script>"
   },
   {
    "title": "Versionsnummer im Info-Text",
    "old": "VELOX 0.11.0 bleibt",
    "new": "VELOX 0.12.1 bleibt"
   },
   {
    "title": "Versionsfeld",
    "old": "<span class=\"eyebrow\">VERSION 0.12.0</span>",
    "new": "<span class=\"eyebrow\">VERSION 0.12.1</span>"
   },
   {
    "title": "Claim wie in Titel und Manifest",
    "old": "<h3>VELOX – Your ride. Your world.</h3>",
    "new": "<h3>VELOX – Your activity. Your world.</h3>"
   }
  ]
 },
 {
  "file": "analysis-pro.js",
  "edits": [
   {
    "title": "Namen je Sportart (Lauf statt „Fahrradtour“)",
    "old": "const GRADE_BANDS = [",
    "new": "const rideName = (ride) => (ride && ride.name) || (ride && ride.activityType === \"running\" ? \"Laufrunde\" : \"Fahrradtour\");\n  const GRADE_BANDS = ["
   },
   {
    "title": "Tour-Auswahlliste",
    "old": "escapeHtml(ride.name || \"Fahrradtour\") + \" · \" + dateLabel(ride.startedAt)",
    "new": "escapeHtml(rideName(ride)) + \" · \" + dateLabel(ride.startedAt)"
   },
   {
    "title": "Archiv-Rekorde",
    "old": "escapeHtml(row[1].ride.name || \"Fahrradtour\") + \" · \" + dateLabel(row[1].ride.startedAt)",
    "new": "escapeHtml(rideName(row[1].ride)) + \" · \" + dateLabel(row[1].ride.startedAt)"
   },
   {
    "title": "Nur bei „Alle Touren“ alles berechnen (schneller bei Einzelauswahl)",
    "old": "analysesCache = ridesCache.map((ride) => analyzeRide(ride, splitKm));",
    "new": "analysesCache = $(\"vxProRide\").value === \"all\" ? ridesCache.map((ride) => analyzeRide(ride, splitKm)) : [];"
   },
   {
    "title": "Einzelne Tour direkt berechnen",
    "old": "host.innerHTML = renderSingle(analysesCache[index], splitKm);",
    "new": "host.innerHTML = renderSingle(analyzeRide(ridesCache[index], splitKm), splitKm);"
   }
  ]
 },
 {
  "file": "README.md",
  "edits": [
   {
    "title": "Versionsüberschrift",
    "old": "## Aktueller Stand – Version 0.10.0",
    "new": "## Aktueller Stand – Version 0.12.1"
   },
   {
    "title": "Dateitabelle: fehlende und veraltete Zeilen",
    "old": "| `velox-polish.css` | Ergänzende Korrekturen (Safe-Area, Schrift, Touch-Ziele); wird nach `styles.css` geladen |",
    "new": "| `velox-extras.css` | Profil-Grafiken, Dialoge, Hinweise, Sportart-Auswahl; wird nach `styles.css` geladen |\n| `velox-polish.css` | Feinschliff (Safe-Area, ruhigere Grafiken, Wochenziel); wird zuletzt geladen |\n| `ride-core.js` | Gemeinsamer Rechenkern: Distanz, Zeiten, Tempo, Steigungen, Anstiege, Stopps, Splits |\n| `charts.js` | Interaktive SVG-Profile ohne Abhängigkeiten |\n| `velox-plus.js` | Wochenziel, Wochenüberblick, Aufnahme-Puls (nur lesend) |"
   },
   {
    "title": "Falschen Dateinamen korrigieren",
    "old": "| `CHANGELOG-0.9.8.md` | Ausführliche Liste der Änderungen dieser Version |",
    "new": "| `CHANGELOG.md` | Änderungen je Version |"
   },
   {
    "title": "Cache-Version",
    "old": "(zuletzt `velox-shell-v28`)",
    "new": "(zuletzt `velox-shell-v33`)"
   }
  ]
 }
];
const errors = [], plan = [];
for (const p of patches) {
  const file = path.join(root, p.file);
  if (!fs.existsSync(file)) { errors.push(p.file + ": Datei nicht gefunden"); continue; }
  let text = fs.readFileSync(file, "utf8"), changed = 0, done = 0;
  for (const e of p.edits) {
    const count = text.split(e.old).length - 1;
    if (count === 1) { text = text.replace(e.old, () => e.new); changed++; }
    else if (count === 0 && text.includes(e.new)) done++;
    else errors.push(p.file + ": „" + e.title + "“ – Stelle " + (count === 0 ? "nicht gefunden" : count + "-mal gefunden (erwartet: 1)"));
  }
  plan.push({ file, text, changed, done, name: p.file });
}
if (errors.length) { console.log("ABGEBROCHEN – es wurde nichts verändert:\n  - " + errors.join("\n  - ")); process.exit(1); }
for (const x of plan) {
  if (x.changed) fs.writeFileSync(x.file, x.text);
  console.log((x.changed ? "✓ " : "· ") + x.name + ": " + x.changed + " geändert" + (x.done ? ", " + x.done + " bereits vorhanden" : ""));
}
console.log("\nFertig. Danach: node tests/app.smoke.test.js && node tests/consistency.test.js");
