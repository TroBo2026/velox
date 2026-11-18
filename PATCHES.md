# Patches für 0.12.1 (manuell einspielen)
Diese Änderungen betreffen die großen Dateien. Öffne die Datei auf GitHub (Stift-Symbol → Bearbeiten), suche den **alten Text** (Suchfunktion des Editors) und ersetze ihn durch den **neuen Text**. Jeder alte Text kommt genau einmal vor.
Wer Node.js hat, kann alles automatisch erledigen: `node apply-patches.js` im Repository-Ordner.

## `app.js`

**1. Versionsnummer in der Kopfzeile**

Alt:
```
/* VELOX 0.11.0 — local-first running + cycling tracker */
```
Neu:
```
/* VELOX 0.12.1 — local-first running + cycling tracker */
```

**2. App-Version**

Alt:
```
const APP_VERSION = "0.12.0";
```
Neu:
```
const APP_VERSION = "0.12.1";
```

**3. Live-Karte: Hilfsfunktion, die Linien und Marker wirklich von der Karte entfernt**

Alt:
```
function drawLive(points,force=false){
```
Neu:
```
function clearLiveLayers(){
    if(liveMap){liveLines.forEach(line=>liveMap.removeLayer(line));if(liveMarker)liveMap.removeLayer(liveMarker);}
    liveLines=[];liveMarker=null;
  }
  function drawLive(points,force=false){
```

**4. Live-Karte: beim Start einer Aktivität alte Ebenen entfernen (Geisterstrecke)**

Alt:
```
liveMap=liveMap||initMap("liveMap");liveLines=[];liveMarker=null;
```
Neu:
```
liveMap=liveMap||initMap("liveMap");clearLiveLayers();
```

**5. Live-Karte: beim Neuzeichnen alte Ebenen entfernen statt nur die Liste zu leeren**

Alt:
```
if(liveMap){attachLiveMap();liveLines=[];liveMarker=null;drawLive(points,true);
```
Neu:
```
if(liveMap){attachLiveMap();clearLiveLayers();drawLive(points,true);
```

**6. Streckenabschnitte: Stillstand (identische Position) trennt die Route nicht**

Alt:
```
Number.isFinite(d)&&d>=0.1&&d<=300&&d/dt*3.6<=180;
```
Neu:
```
Number.isFinite(d)&&d>=0&&d<=300&&d/dt*3.6<=180;
```

**7. Sensorstatus: ehrliche Anzeige, wenn keine Höhe vorliegt**

Alt:
```
:source==="barometer"?"Barometer":"GPS";
```
Neu:
```
:source==="barometer"?"Barometer":source==="unavailable"?"Keine verwertbare Höhe":"GPS";
```

## `index.html`

**1. Neues Stylesheet einbinden**

Alt:
```
<link rel="stylesheet" href="./velox-extras.css">
```
Neu:
```
<link rel="stylesheet" href="./velox-extras.css">
  <link rel="stylesheet" href="./velox-polish.css">
```

**2. Zusatzmodul einbinden**

Alt:
```
<script src="./analysis-pro.js"></script>
```
Neu:
```
<script src="./analysis-pro.js"></script>
  <script src="./velox-plus.js"></script>
```

**3. Versionsnummer im Info-Text**

Alt:
```
VELOX 0.11.0 bleibt
```
Neu:
```
VELOX 0.12.1 bleibt
```

**4. Versionsfeld**

Alt:
```
<span class="eyebrow">VERSION 0.12.0</span>
```
Neu:
```
<span class="eyebrow">VERSION 0.12.1</span>
```

**5. Claim wie in Titel und Manifest**

Alt:
```
<h3>VELOX – Your ride. Your world.</h3>
```
Neu:
```
<h3>VELOX – Your activity. Your world.</h3>
```

## `analysis-pro.js`

**1. Namen je Sportart (Lauf statt „Fahrradtour“)**

Alt:
```
const GRADE_BANDS = [
```
Neu:
```
const rideName = (ride) => (ride && ride.name) || (ride && ride.activityType === "running" ? "Laufrunde" : "Fahrradtour");
  const GRADE_BANDS = [
```

**2. Tour-Auswahlliste**

Alt:
```
escapeHtml(ride.name || "Fahrradtour") + " · " + dateLabel(ride.startedAt)
```
Neu:
```
escapeHtml(rideName(ride)) + " · " + dateLabel(ride.startedAt)
```

**3. Archiv-Rekorde**

Alt:
```
escapeHtml(row[1].ride.name || "Fahrradtour") + " · " + dateLabel(row[1].ride.startedAt)
```
Neu:
```
escapeHtml(rideName(row[1].ride)) + " · " + dateLabel(row[1].ride.startedAt)
```

**4. Nur bei „Alle Touren“ alles berechnen (schneller bei Einzelauswahl)**

Alt:
```
analysesCache = ridesCache.map((ride) => analyzeRide(ride, splitKm));
```
Neu:
```
analysesCache = $("vxProRide").value === "all" ? ridesCache.map((ride) => analyzeRide(ride, splitKm)) : [];
```

**5. Einzelne Tour direkt berechnen**

Alt:
```
host.innerHTML = renderSingle(analysesCache[index], splitKm);
```
Neu:
```
host.innerHTML = renderSingle(analyzeRide(ridesCache[index], splitKm), splitKm);
```

## `README.md`

**1. Versionsüberschrift**

Alt:
```
## Aktueller Stand – Version 0.10.0
```
Neu:
```
## Aktueller Stand – Version 0.12.1
```

**2. Dateitabelle: fehlende und veraltete Zeilen**

Alt:
```
| `velox-polish.css` | Ergänzende Korrekturen (Safe-Area, Schrift, Touch-Ziele); wird nach `styles.css` geladen |
```
Neu:
```
| `velox-extras.css` | Profil-Grafiken, Dialoge, Hinweise, Sportart-Auswahl; wird nach `styles.css` geladen |
| `velox-polish.css` | Feinschliff (Safe-Area, ruhigere Grafiken, Wochenziel); wird zuletzt geladen |
| `ride-core.js` | Gemeinsamer Rechenkern: Distanz, Zeiten, Tempo, Steigungen, Anstiege, Stopps, Splits |
| `charts.js` | Interaktive SVG-Profile ohne Abhängigkeiten |
| `velox-plus.js` | Wochenziel, Wochenüberblick, Aufnahme-Puls (nur lesend) |
```

**3. Falschen Dateinamen korrigieren**

Alt:
```
| `CHANGELOG-0.9.8.md` | Ausführliche Liste der Änderungen dieser Version |
```
Neu:
```
| `CHANGELOG.md` | Änderungen je Version |
```

**4. Cache-Version**

Alt:
```
(zuletzt `velox-shell-v28`)
```
Neu:
```
(zuletzt `velox-shell-v33`)
```
