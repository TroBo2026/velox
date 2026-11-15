
# VELOX
**YOUR RIDE. YOUR WORLD.**

[![Web Check](https://github.com/TroBo2026/Velox/actions/workflows/web-check.yml/badge.svg)](https://github.com/TroBo2026/Velox/actions/workflows/web-check.yml)
[![iOS Build](https://github.com/TroBo2026/Velox/actions/workflows/ios-build.yml/badge.svg)](https://github.com/TroBo2026/Velox/actions/workflows/ios-build.yml)

VELOX ist ein local-first Fahrrad-Tracker. Dieses Repository enthält einen testbaren **Web-App-Prototyp (PWA) für iPhone und iPad** sowie ein vorbereitetes **natives SwiftUI-Projekt** (`ios/`).

**Inhalt:** [Aktueller Stand](#aktueller-stand--version-098) · [Datenschutz](#datenschutz-und-datenspeicherung) · [Sensoren](#sensoren-und-messgenauigkeit) · [Grenzen](#grenzen-des-web-prototyps) · [Dateien](#dateien) · [Bereitstellung](#kostenlos-testen-und-bereitstellen) · [Entwicklung und Tests](#entwicklung-und-tests) · [Erster iPhone-Test](#erster-test-am-iphone-xr-webpwa) · [Kennzahlen](#wrapped-und-abgeleitete-kennzahlen) · [Native iOS App](#native-ios-app) · [Roadmap](#geplante-entwicklung) · [Versionsverlauf](#versionsverlauf)

---

## Aktueller Stand – Version 0.9.8

### Aufzeichnung
- GPS-Aufzeichnung mit Pause, Fortsetzen und Tourabschluss; Start auf der Startseite oder direkt auf der Track-Seite. Eine laufende Tour kann nicht versehentlich ein zweites Mal gestartet werden.
- Der Bildschirm bleibt während der Aufzeichnung an, sofern iOS die Screen-Wake-Lock-API bereitstellt (wird bei Pause und Ende wieder freigegeben).
- Offline-Aufzeichnung: GPS-Punkte werden fortlaufend lokal in IndexedDB gespeichert. Ohne Verbindung zeigt VELOX eine schematische Offline-Strecke; nach Wiederverbindung können Kartendaten nachgeladen werden.
- Unterbrochene Touren (App beendet, Seite neu geladen) werden beim nächsten Start pausiert wiederhergestellt.
- Live-Daten: Distanz, Geschwindigkeit, sekundengenau an der Systemuhr ausgerichtete Fahrzeit, Aufstieg, Durchschnittstempo, aktuelle GPS-Höhe und Steigung, Fahrzeitanteil und Höhen-Datenqualität. Die aufwendige Auswertung läuft höchstens alle 2 s und nicht bei jedem Sekundentick, die Kartenlinie höchstens alle 2,5 s.
- Sensorstatus in der Live-Ansicht: GPS-Höhe, Barometerverfügbarkeit und tatsächlich verwendete Höhenquelle.

### Auswertung
- Tourenanalyse: Distanz, Fahrzeit, Standzeit, Durchschnitts- und Maximaltempo, Auf- und Abstieg, höchster/tiefster Punkt, durchschnittliche und steilste Steigung, steilste Abfahrt.
- Geglättetes Geschwindigkeitsprofil, Höhenprofil und Steigungsprofil in jeder Tour-Detailansicht; GPS-Lücken werden nicht überbrückt.
- Erweiterte Tourendetails: Steigungsverteilung, Zeit in Geschwindigkeitszonen, längster Anstieg, VAM, Median-Tempo, maximale Entfernung vom Start, Strecken-Geradlinigkeit sowie GPS-erkannte Stopps (ab 10 s unter 1,5 km/h; manuelle Pausen und GPS-Lücken zählen nicht).
- Automatischer Vergleich der letzten drei gespeicherten Touren in den Statistiken.
- **Wrapped:** automatisch berechneter Archiv-Rückblick (Gesamtzeit im Sattel, Distanz, Auf-/Abstieg, persönliche Rekorde, längster zusammenhängender Anstieg, schnellster voller Kilometer, VAM, Gelände- und Tempo-Zonen). Erreichbar unter „Mehr“.
- **VELOX Pro Analyse:** optionale Einzeltour- und Archiv-Auswertung mit 1/5/10-km-Splits, Tempozonen, Steigungsverteilung, GPS-Qualitätsbericht, Höhen-Ausreißerbericht und Archiv-Rekorden. Sie liest nur vorhandene IndexedDB-Daten.
- **Persönliche VELOX MAP:** mehrere gespeicherte Touren mit individuellen Farben, Ein-/Ausblenden einzelner Touren, Zeitfiltern und lokaler Streckendichte-Ansicht.

### Einheitliche Messregeln
- **Bewegungsfilter** in Tourendetails, Live-Kennzahlen und Pro-Analyse: gültige GPS-Koordinaten, Zeitabstand bis 30 s, Distanz von 0,8 bis 150 m, gemeldete horizontale Genauigkeit höchstens 80 m, Tempo von 1,5 bis 100 km/h. Distanz, Bewegungszeit, Durchschnitts- und Maximaltempo stammen aus denselben akzeptierten Fahrintervallen.
- **Gemeinsame Höhen-Engine** (`elevation-core.js`) für Live-Ansicht, Tourendetails und Pro-Analyse: robuste lokale Median-/Ausreißerprüfung, segmentbewusste Glättung und eine adaptive Mindestschwelle für kumulierte Höhenmeter. Fehlende oder unbrauchbare Höhenwerte trennen Auswertungssegmente und werden nicht überbrückt.
- Höhenwerte mit gemeldeter vertikaler Ungenauigkeit über 35 m werden ausgelassen; Änderungen unter der adaptiven Schwelle (mindestens 2,5 m, höchstens 6 m) werden nicht aufsummiert. Fehlende Genauigkeitsangaben werden nicht als gute Messqualität eingestuft.
- Steigungswerte stammen aus demselben geglätteten Höhenprofil; große Zeit-/Distanzlücken werden ausgelassen.
- Die Kartenansicht ist bewusst toleranter als die Messwerte: Stillstand trennt eine Route nicht, echte GPS-Lücken (über 180 s) schon.

### Daten und Export
- GPX-Export einzelner Touren; GPS-Lücken werden als getrennte GPX-Tracksegmente exportiert.
- JSON-Export und -Import aller Tourdaten. Nur JSON-v1 (`app: "VELOX", version: 1`) wird angenommen, vorhandene Touren werden nie überschrieben, doppelte IDs erhalten eine neue Import-ID.
- Lokale Speicherung im Browser über IndexedDB (Schema-Version 1). VELOX fordert persistenten Speicher an, damit Safari lokale Touren seltener automatisch räumt.

### Wetter pro Tour
Beim Beenden fragt VELOX zuerst nach Zustimmung, ob Wetterdaten von Open-Meteo mit Fahrtdatum und einer repräsentativen GPS-Position abgefragt werden dürfen. Das Archiv liegt einige Tage zurück; für Fahrten der letzten 10 Tage nutzt VELOX deshalb ersatzweise die Wetteranalyse desselben Anbieters. Wird abgelehnt, offline gefahren oder kommen keine Daten, können Wetterlage und ungefähre Temperatur manuell eingetragen werden. Das Wetter wird als optionales Feld am jeweiligen Tourobjekt gespeichert. Die Werte sind stündliche Näherungen, keine Messung am Fahrrad.

### PWA und Offline
- Installierbare PWA mit versioniertem Offline-App-Shell-Cache (`sw.js`): Seitenaufrufe zuerst über das Netzwerk, bei fehlender Verbindung aus dem Cache; übrige Dateien zuerst aus dem Cache und im Hintergrund aktualisiert.
- Leaflet wird nur bei einer tatsächlich benötigten Online-Kartenansicht nachgeladen. Ohne Netz bleibt die schematische lokale Streckenansicht verfügbar.
- Kopfzeile und Navigation berücksichtigen die iOS-Sicherheitsbereiche (Notch, Home-Indikator).

---

## Datenschutz und Datenspeicherung

- Kein VELOX-Konto und kein Login erforderlich.
- Tourdaten werden im Browser auf dem verwendeten Gerät gespeichert. Es gibt keinen VELOX-Server, der Tourdaten entgegennimmt.
- Vor dem Löschen von Browserdaten oder einer Neuinstallation eine JSON-Sicherung exportieren.
- Die Kartenansicht lädt Kartenausschnitte von OpenStreetMap und die Kartenbibliothek Leaflet bei Bedarf von `unpkg.com`. Dabei werden Netzwerkanfragen an diese Dienste gesendet; die aufgezeichnete Tour wird nicht an VELOX-Server hochgeladen. Es werden keine externen Schriftarten geladen.
- Wetterdaten werden nur nach ausdrücklicher Zustimmung bei Open-Meteo abgefragt (Fahrtdatum und eine ungefähre Position).
- Offline sind Kartenkacheln nicht verfügbar. Karten bleiben onlineabhängig.

## Sensoren und Messgenauigkeit

- Die Web-App verwendet GPS-Höhenwerte des Geräts. Ein Medianfilter dämpft einzelne Ausreißer; die Qualitätsanzeige macht sichtbar, wenn nur wenige oder ungenaue Höhenmessungen vorhanden sind.
- Das iPhone besitzt Hardware für einen Drucksensor, aber Safari bietet Webseiten keine verlässliche standardisierte Schnittstelle dafür. VELOX behauptet deshalb nicht, barometrische Höhen zu messen. Die Barometerfusion bleibt in der normalen Web-Version inaktiv.
- **Modulare Sensor-Schnittstelle** (`sensor-core.js`): akzeptiert native Altimeter-Werte nur mit plausibler Höhe, Druck, Zeitstempel und expliziter Genauigkeit. Frische GPS- und Barometerwerte werden anhand ihrer gemeldeten Unsicherheit gewichtet; veraltete oder ungültige Werte werden ignoriert.
- **Native Bridge-Vertrag:** Ereignis `velox:native-altimeter` mit `altitudeM` (−1000 bis 10000 m), `accuracyM` (0,5 bis 100 m), `pressureKPa` (30 bis 120) und `timestamp` (Millisekunden seit 1970, **erforderlich**). Werte sind bis 15 s alt gültig; eine Abweichung der Uhren von bis zu 2 s wird toleriert. Ohne native Quelle bleibt VELOX bei GPS.
- Für eine spätere native iOS-App ist die Barometer-Anbindung über Core Motion vorgesehen. Eine Kalibrierung gegen bekannte Höhen/GPS bleibt sinnvoll.
- Herzfrequenz, Leistung und Trittfrequenz werden erst eingebunden, wenn echte kompatible Sensordaten verfügbar sind. Werte werden nicht erfunden oder simuliert.
- Apple Watch, HealthKit und Bluetooth-Sensoren sind im Web-Prototyp nicht implementiert (Safari auf iOS unterstützt Web Bluetooth nicht).

## Grenzen des Web-Prototyps

- iOS kann Browser-Tabs und Web-Apps im Hintergrund anhalten. Der Wake Lock hält nur den Bildschirm an, solange VELOX im Vordergrund ist. GPS-Aufzeichnung bei gesperrtem Bildschirm ist **nicht zuverlässig garantiert**. Für Tests VELOX geöffnet lassen.
- Offline-Karten sind noch nicht enthalten.
- Für GPS wird eine sichere HTTPS-Adresse und eine erteilte Standortberechtigung benötigt.
- Die Höhenmeter-Summe ist eine gefilterte GPS-Näherung, keine zertifizierte barometrische Messung.
- Kein `apple-touch-icon` als PNG vorhanden: Das Home-Bildschirm-Icon auf iOS kann deshalb vom SVG-Icon abweichen.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | App-Struktur und Ansichten |
| `styles.css` | Responsive VELOX-Oberfläche |
| `velox-polish.css` | Ergänzende Korrekturen (Safe-Area, Schrift, Touch-Ziele); wird nach `styles.css` geladen |
| `app.js` | GPS, Berechnungen, IndexedDB, Touren, Wrapped, Export/Import |
| `elevation-core.js` | Gemeinsame Höhen-Engine (Ausreißerprüfung, Glättung, Höhenmeter) |
| `analysis-pro.js` | Zusätzliche lesende Tourenanalyse, Splits, Tempo-/Steigungszonen, GPS-Datenqualität |
| `sensor-core.js` | Validierung und Fusion von GPS- und nativen Barometerdaten |
| `sw.js` | Service Worker: Cache der App-Shell, Offline-Start |
| `manifest.webmanifest` | PWA-Metadaten und App-Icon |
| `icon.svg` | VELOX-App-/Browser-Icon |
| `tests/` | Logik-Tests (Node.js) für `app.js` und `sensor-core.js` |
| `ios/` | Natives SwiftUI-Xcode-Projekt (siehe [`ios/README.md`](ios/README.md)) |
| `.github/workflows/` | CI: `web-check.yml` (Web), `ios-build.yml` (iOS-Simulator) |
| `CHANGELOG-0.9.8.md` | Ausführliche Liste der Änderungen dieser Version |

## Kostenlos testen und bereitstellen

Die App ist als statische Web-App angelegt. Es werden keine kostenpflichtigen APIs, Abonnements oder Cloud-Datenbanken benötigt.

Empfohlene Cloudflare-Pages-Einstellungen:

- Framework preset: **None**
- Production branch: **main**
- Build command: **leer lassen**
- Build output directory: **.**
- Root directory: **/**

Nach erfolgreichem Deployment die HTTPS-Adresse auf dem iPhone in Safari öffnen und den Standortzugriff erlauben. Optional über Safari → Teilen → Zum Home-Bildschirm hinzufügen.

**Wichtig bei jeder Änderung an App-Dateien:** In `sw.js` die Konstante `CACHE` hochzählen (zuletzt `velox-shell-v27`) und neue Dateien in die Liste `SHELL` aufnehmen. Der CI-Check meldet Dateien, die `index.html` lädt, aber im Offline-Cache fehlen.

## Entwicklung und Tests

Voraussetzung: Node.js 20 oder neuer. Es gibt keinen Build-Schritt.

```bash
node --check app.js              # Syntax prüfen (analog für die übrigen .js-Dateien)
node tests/sensor-core.test.js   # Barometer-Fusion und Zeitstempel-Regeln
node tests/app-smoke.test.js     # App lädt ohne Fehler; Distanz, Stillstand, Cache, Robustheit
```

Der Workflow `web-check.yml` führt dieselben Prüfungen bei jedem Push und Pull Request aus und kontrolliert zusätzlich `manifest.webmanifest` und die Offline-Cache-Liste. Der Workflow `ios-build.yml` baut das native Projekt für den iOS-Simulator.

---

## Erster Test am iPhone XR (Web/PWA)

1. Vor dem Test in VELOX unter „Mehr“ eine JSON-Sicherung exportieren und an einem sicheren Ort behalten.
2. VELOX über eine HTTPS-Adresse in Safari öffnen. Bei der Standortabfrage „Beim Verwenden“ wählen und „Genauer Standort“ aktivieren.
3. Optional über „Teilen“ → „Zum Home-Bildschirm“ hinzufügen. Für den ersten Funktionstest kann Safari selbst verwendet werden.
4. Eine kurze Fahrt im Freien mit freier Sicht zum Himmel aufzeichnen. VELOX im Vordergrund lassen. Der Energiesparmodus kann Hintergrund- und Messverhalten zusätzlich einschränken.
5. Eine Standortfreigabe nur nach einer klaren VELOX-Aktion erteilen. Die PWA verwendet GPS; Barometer, Kompass, Gyroskop und Beschleunigungssensor werden nicht über native Core-Motion-Schnittstellen gelesen.
6. Nach dem Speichern Tourdetails und GPS-Lücken prüfen. Dann Wrapped öffnen und kontrollieren, dass die neue Tour in Tourenzahl, Distanz und Rekorden auftaucht. Eine JSON-Sicherung erneut exportieren und prüfen, dass die Tour enthalten ist.
7. Zusätzlich prüfen: Bleibt der Bildschirm während der Aufzeichnung an? Läuft die Aufzeichnung nach Pause und Fortsetzen weiter? Erscheint nach „Tour beenden“ ein Wetterdialog?
8. Sensorstatus nur als verfügbar werten, wenn VELOX echte Messwerte in dieser Tour gespeichert hat. Fehlende Sensoren müssen als „nicht verfügbar“ bzw. „nicht aufgezeichnet“ erscheinen.

**Grenze:** iOS kann Safari/PWAs im Hintergrund anhalten. VELOX verspricht keine zuverlässige GPS-Aufzeichnung bei gesperrtem Bildschirm.

## Wrapped und abgeleitete Kennzahlen

Der Wrapped-Reiter liest das vorhandene Tourenarchiv und berechnet Summen und Rekorde bei jedem Öffnen neu. Es wird kein neues IndexedDB-Feld benötigt und keine Tour verändert. Die Steigungsverteilung nutzt auswertbare geglättete GPS-Höhenabschnitte (Anstieg über +1,5 %, Gefälle unter −1,5 %). Tempo-Zonen verwenden akzeptierte Bewegungsintervalle (<15, 15–25 und >25 km/h). Der längste Anstieg wird aus zusammenhängenden Höhenabschnitten ab +1,5 % ermittelt. Die Netto-Höhenänderung wird zwischen erstem und letztem verlässlichem geglättetem Höhenpunkt derselben Tour bestimmt; der Höhenbereich ist Maximum minus Minimum der verlässlichen Höhenpunkte. VAM ist Höhengewinn geteilt durch Bewegungszeit. Die Strecken-Geradlinigkeit ist Luftlinie Start–Ziel geteilt durch die gefilterte GPS-Strecke und wird bei GPS-Unterbrechungen nicht angegeben.

Schräglage, Beschleunigung/Bremsung, Herzfrequenz, Leistung, Trittfrequenz und Kalorien werden nicht angezeigt, solange dafür keine geeignete echte Sensor- oder Leistungsdatenquelle vorhanden ist.

## Native iOS App

Das Repository enthält ein vorbereitetes eigenständiges SwiftUI-Xcode-Projekt unter `ios/VELOX.xcodeproj`. Die native App ist ausdrücklich keine WKWebView-Hülle. Sie nutzt lokale JSON-Sicherung, Core Location und – sofern das Gerät es unterstützt – Core Motion. Die Web-/PWA-Version bleibt nutzbar und wird erst nach erfolgreichen Xcode-, Import-/Export- und iPhone-Tests ersetzt.

Der native Quellcode ist vorbereitet, aber noch **nicht** mit Xcode gebaut oder auf einem iPhone installiert. Auf dem Mac `ios/VELOX.xcodeproj` öffnen, das Schema `VELOX` wählen und zunächst für einen iPhone-Simulator bauen. Für den Gerätestart muss Xcode gegebenenfalls eine kostenlose persönliche Signierung einrichten. Eine App-Store-Veröffentlichung ist nicht Teil dieses kostenlosen Vorhabens. Der Workflow `ios-build.yml` baut das Projekt zusätzlich automatisch für den Simulator.

Die Swift-Modelle bewahren unbekannte zusätzliche Felder in Touren und GPS-Punkten als JSON-Werte. Damit bleiben insbesondere optionale Web-Felder wie `weather` beim nativen Import-/Export-Rundlauf erhalten. Die `BarometerService.swift` nutzt den Core-Motion-Sample-Zeitstempel (monotone Geräte-Uptime, auf Unix-Zeit abgebildet) statt der verzögerten Callback-Empfangszeit. Das iOS-Barometer liefert zunächst relative Höhenänderungen; die Swift-Kalibrierung kann diese mit einem zeitnahen, ausreichend genauen GPS-Höhenreferenzpunkt verankern. Diese native Messkette ist noch nicht mit der Web-App verbunden und wird daher nicht als aktive Sensorquelle ausgegeben. Details, bekannte Grenzen und ein 30-Minuten-Mac-Ablauf stehen in [`ios/README.md`](ios/README.md).

## Geplante Entwicklung

1. Reale iPhone-Tests für GPS-Qualität, Höhenprofil, Tourenspeicherung, Wake Lock und iOS-Verhalten
2. `apple-touch-icon` (PNG) ergänzen und Leaflet selbst hosten (zugleich besser für Offline und Datenschutz)
3. Native iOS-Sensoranbindung für Barometer/Core Motion prüfen und umsetzen, sobald ein nativer App-Unterbau vorhanden ist
4. Echte Herzfrequenz-, Trittfrequenz- und Leistungssensoren anbinden
5. Erweiterte Steigungsprofile, frei wählbare Tourenvergleiche und Rekorde
6. Native iOS-/watchOS-Version und Offline-Karten evaluieren

**Grundprinzipien:** echte Messwerte statt erfundener Daten, jede Tour einzeln zugänglich, Gesamtstatistiken getrennt, lokale Speicherung zuerst und keine verpflichtenden Abos.

---

## Versionsverlauf

**0.9.8** – Fehlerbehebungen und Feinschliff (Details in [`CHANGELOG-0.9.8.md`](CHANGELOG-0.9.8.md)): behobener Startfehler der GPS-Aufzeichnung, kein Doppelstart, keine Geisterstrecken auf der Live-Karte, Stillstand trennt Routen nicht mehr, sicheres Speichern beim Pausieren/Beenden, funktionierendes Wetter für frische Fahrten, Wake Lock, geringere Rechenlast bei langen Touren, echtes Stale-While-Revalidate im Service Worker, iOS-Sicherheitsbereiche, Barometer-Zeitstempel-Toleranz, CI und Tests.

**0.9.4 bis 0.9.7** – Zwischenstände (u. a. Wrapped-Überarbeitung, Tourendetails, Abschlussprüfung vom 12.11.2026: segmentbewusste Höhenanalyse, GPX-Tracksegmente, strikter JSON-v1-Import). Nicht einzeln dokumentiert; siehe Git-Verlauf.

**0.9.3** – Höhen-Engine und Pro-Analyse: gemeinsame Datei `elevation-core.js`, robuste Ausreißerprüfung und Median-Glättung, adaptive Höhenmeter-Schwelle, abgestufte Höhenqualität und Anzahl verworfener Ausreißer, keine erfundene Genauigkeit ohne Messwert.

**0.9.2** – Offline- und Performance-Überarbeitung: App-Shell ohne externe Schrift- oder Kartenbibliothek, Leaflet erst bei Bedarf, versionierter Service-Worker-Cache, überarbeitete mobile Oberfläche (Kontrast, Touch-Ziele, Zahlenlesbarkeit, Kartenhöhe, Systemschrift).

**0.9.1** – Fahrtzeit und Wetter pro Tour: Datum sowie Start- und Enduhrzeit getrennt, Wetter mit Zustimmung von Open-Meteo oder manuell, Wrapped-Einstieg unter „Mehr“, Core-Motion-Zeitstempel in `BarometerService.swift`.

**0.9** – Tourendetails: Route zuerst, danach getrennte Abschnitte für Übersicht, Höhenprofil, Tempo, Gelände, Route, Zeit und Datenquellen; Sensoren, die nicht gespeichert wurden, werden als nicht aufgezeichnet ausgewiesen.
