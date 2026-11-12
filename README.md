# VELOX
**YOUR RIDE. YOUR WORLD.**

VELOX ist ein local-first Fahrrad-Tracker. Dieses Repository enthält einen testbaren Web-App-Prototyp für iPhone und iPad.

## Aktueller Stand – Version 0.9.1

- GPS-Aufzeichnung mit Pause, Fortsetzen und Tourabschluss
- Modulare Sensor-Schnittstelle: GPS-Höhe plus optionale, validierte native Barometerwerte; Qualitätsgewichtung anhand der gemeldeten Genauigkeit
- Sensorstatus in der Live-Ansicht: GPS-Höhe, Barometerverfügbarkeit und tatsächlich verwendete Höhenquelle
- Native Bridge-Vertrag: `velox:native-altimeter` mit `altitudeM`, `accuracyM`, `pressureKPa` und optionalem Zeitstempel; ohne native Quelle bleibt VELOX bei GPS
- Live-Daten: Distanz, Geschwindigkeit, Fahrzeit, Aufstieg, Durchschnittstempo, aktuelle GPS-Höhe, aktuelle Steigung, Fahrzeitanteil und Höhen-Datenqualität
- Tourenanalyse: Distanz, Fahrzeit, Standzeit, Durchschnitts- und Maximaltempo, Auf- und Abstieg, höchster/tiefster Punkt, durchschnittliche Steigung, steilste Steigung und steilste Abfahrt
- Geglättetes Geschwindigkeitsprofil über die Streckendistanz in jeder Tour-Detailansicht
- Automatischer Vergleich der letzten drei gespeicherten Touren in den Statistiken
- Neuer Wrapped-Reiter mit automatisch aktualisiertem Archiv-Rückblick: Gesamtzeit im Sattel, Distanz, Auf-/Abstieg, persönliche Rekorde, längster zusammenhängender Anstieg, schnellster voller Kilometer, VAM sowie aggregierte Gelände- und Tempo-Zonen
- Erweiterte Tourendetails: Steigungsverteilung, Zeit in Geschwindigkeitszonen, längster Anstieg, VAM, Median-Tempo, maximale Entfernung vom Start und Strecken-Geradlinigkeit; alle Berechnungen nutzen vorhandene GPS-Punkte
- VELOX Pro Analyse: optionale Einzeltour- und Archiv-Auswertung mit 1/5/10-km-Splits, Tempozonen, Steigungsverteilung, GPS-Qualitätsbericht, Ausreißerzählung und Archiv-Rekorden; ausschließlich lesender Zugriff auf vorhandene IndexedDB-Daten
- Einheitliche Bewegungsfilter in Tourendetails, Live-Kennzahlen und Pro-Analyse: gültige GPS-Koordinaten, Zeitabstand bis 30 s, Distanz von 0,8 bis 150 m, gemeldete horizontale Genauigkeit höchstens 80 m und Tempo von 1,5 bis 100 km/h. Distanz, Bewegungszeit, Durchschnitts- und Maximaltempo stammen aus denselben akzeptierten Fahrintervallen.
- Höhenprofil mit Distanzachse, tatsächlichen Start-/Zielmarkierungen und Median-Glättung über bis zu fünf benachbarte GPS-Höhenwerte; fehlende oder unbrauchbare Höhenwerte trennen die Auswertungssegmente und werden nicht überbrückt
- Höhenwerte mit gemeldeter vertikaler Ungenauigkeit über 35 m werden ausgelassen; Änderungen unter 4 m werden nicht zur kumulierten Höhenmeter-Summe addiert
- Qualitätskennzeichnung der Höhenmessung anhand der verfügbaren GPS-Höhendaten; fehlende Genauigkeitsangaben werden nicht als gute Messqualität eingestuft
- Steigungswerte werden aus demselben geglätteten Höhenprofil abgeleitet; große Zeit-/Distanzlücken werden ausgelassen
- Persönliche VELOX MAP mit mehreren gespeicherten Touren, individuellen Streckenfarben, Ein-/Ausblenden einzelner Touren, Zeitfiltern und lokaler Streckendichte-Ansicht
- Separate Tourenliste mit Detailansicht und Streckenkarte
- GPX-Export einzelner Touren; GPS-Lücken werden als getrennte GPX-Tracksegmente exportiert
- JSON-Export und -Import aller Tourdaten; nur JSON-v1 wird angenommen, vorhandene Touren werden nie überschrieben, doppelte IDs erhalten eine neue Import-ID
- Lokale Speicherung im Browser über IndexedDB
- Installierbare PWA-Grundstruktur und Offline-App-Shell-Cache

## Datenschutz und Datenspeicherung

- Kein VELOX-Konto und kein Login erforderlich.
- Tourdaten werden im Browser auf dem verwendeten Gerät gespeichert.
- Es gibt keinen VELOX-Server, der Tourdaten entgegennimmt.
- Vor dem Löschen von Browserdaten oder einer Neuinstallation eine JSON-Sicherung exportieren.
- Die Kartenansicht lädt Kartenausschnitte von OpenStreetMap. Dafür werden beim Anzeigen der Karte Netzwerkanfragen an den Kartendienst gesendet; die aufgezeichnete GPX-Tour wird nicht an VELOX-Server hochgeladen.
- Die App lädt derzeit Leaflet und Schrift-/Darstellungsressourcen extern. Offline sind deshalb nicht alle Karten- und Designressourcen verfügbar. Karten bleiben onlineabhängig.

## Sensoren und Messgenauigkeit

- Die Web-App besitzt jetzt eine modulare Sensor-Schnittstelle. Sie akzeptiert native Altimeter-Messwerte nur mit plausibler Höhe, Druckwert, Zeitstempel und expliziter Genauigkeit. Frische GPS- und Barometerwerte werden anhand ihrer gemeldeten Unsicherheit gewichtet. Veraltete oder ungültige Messwerte werden ignoriert.
- Safari auf iOS stellt Webseiten weiterhin keine verlässliche öffentliche Drucksensor-API bereit. Die Barometerfusion bleibt deshalb in der normalen Web-Version inaktiv, bis eine native iOS-Hülle echte Core-Motion-Werte über die dokumentierte Bridge liefert.

- Die aktuelle Web-App verwendet GPS-Höhenwerte des Geräts. Ein Medianfilter dämpft einzelne Ausreißer; die Qualitätsanzeige macht sichtbar, wenn nur wenige oder ungenaue Höhenmessungen vorhanden sind.
- Das iPhone kann über seine Hardware einen barometrischen Drucksensor besitzen. Safari auf iOS bietet Webseiten aber keine verlässliche standardisierte Schnittstelle, um diesen Rohdruck direkt auszulesen. VELOX behauptet deshalb nicht, aktuell barometrische Höhenwerte zu messen.
- Für eine spätere native iOS-App ist eine Barometer-Anbindung über Core Motion vorgesehen. Damit kann die GPS-Höhe ergänzt und über Druckänderungen stabilisiert werden; eine Kalibrierung gegen bekannte Höhen/GPS bleibt sinnvoll.
- Herzfrequenz, Leistung und Trittfrequenz werden erst eingebunden, wenn echte kompatible Sensordaten verfügbar sind. Diese Werte werden nicht erfunden oder simuliert.
- Apple Watch, HealthKit und Bluetooth-Sensoren sind in diesem Web-Prototyp noch nicht implementiert. Safari auf iOS unterstützt Web Bluetooth nicht wie Chromium-Browser auf unterstützten Plattformen.

## Grenzen des Web-Prototyps

- iOS kann Browser-Tabs und Web-Apps im Hintergrund anhalten. GPS-Aufzeichnung bei gesperrtem Bildschirm ist daher nicht zuverlässig garantiert. Während eines Tests VELOX geöffnet und den Bildschirm aktiv lassen.
- Offline-Karten sind noch nicht enthalten.
- Für GPS wird eine sichere HTTPS-Adresse und eine erteilte Standortberechtigung benötigt.
- Die aktuelle Höhenmeter-Summe ist eine gefilterte GPS-Näherung, keine zertifizierte barometrische Messung.

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | App-Struktur und Ansichten |
| `styles.css` | Responsive VELOX-Oberfläche |
| `app.js` | GPS, Berechnungen, IndexedDB, Touren, Wrapped, Export/Import |
| `analysis-pro.js` | Zusätzliche lesende Tourenanalyse, Splits, Tempo-/Steigungszonen und GPS-Datenqualität |
| `sensor-core.js` | Validierung und Fusion von GPS- und nativen Barometerdaten |
| `manifest.webmanifest` | PWA-Metadaten und SVG-App-Icon |
| `icon.svg` | VELOX-App-/Browser-Icon |
| `sw.js` | Cache für die App-Shell |

## Kostenlos testen und bereitstellen

Die App ist als statische Web-App angelegt. Es werden keine kostenpflichtigen APIs, Abonnements oder Cloud-Datenbanken benötigt.

Empfohlene Cloudflare-Pages-Einstellungen:

- Framework preset: **None**
- Production branch: **main**
- Build command: **leer lassen**
- Build output directory: **.**
- Root directory: **/**

Nach erfolgreichem Deployment die HTTPS-Adresse auf dem iPhone in Safari öffnen und den Standortzugriff erlauben. Optional über Safari → Teilen → Zum Home-Bildschirm hinzufügen.

## Wrapped und abgeleitete Kennzahlen

Der Wrapped-Reiter liest das vorhandene Tourenarchiv und berechnet Summen und Rekorde bei jedem Öffnen neu. Es wird kein neues IndexedDB-Feld benötigt und keine Tour verändert. Die Steigungsverteilung nutzt auswertbare geglättete GPS-Höhenabschnitte (Anstieg über +1,5 %, Gefälle unter −1,5 %). Tempo-Zonen verwenden akzeptierte Bewegungsintervalle (<15, 15–25 und >25 km/h). Der längste Anstieg wird aus zusammenhängenden Höhenabschnitten ab +1,5 % ermittelt. Die Netto-Höhenänderung wird zwischen erstem und letztem verlässlichem geglättetem Höhenpunkt derselben Tour bestimmt; der Höhenbereich ist Maximum minus Minimum der verlässlichen Höhenpunkte. VAM ist Höhengewinn geteilt durch Bewegungszeit. Strecken-Geradlinigkeit ist Luftlinie Start–Ziel geteilt durch die gefilterte GPS-Strecke und wird bei GPS-Unterbrechungen nicht angegeben.

Schräglage, Beschleunigung/Bremsung, Herzfrequenz, Leistung, Trittfrequenz und Kalorien werden nicht angezeigt, solange dafür keine geeignete echte Sensor- oder Leistungsdatenquelle vorhanden ist.

## Geplante Entwicklung

1. Reale iPhone-Tests für GPS-Qualität, Höhenprofil, Tourenspeicherung und iOS-Verhalten
2. Native iOS-Sensoranbindung für Barometer/Core Motion prüfen und umsetzen, sobald ein nativer App-Unterbau vorhanden ist
3. Echte Herzfrequenz-, Trittfrequenz- und Leistungssensoren anbinden
4. Erweiterte Steigungsprofile, frei wählbare Tourenvergleiche und Rekorde
5. Native iOS-/watchOS-Version und Offline-Karten evaluieren

**Grundprinzipien:** echte Messwerte statt erfundener Daten, jede Tour einzeln zugänglich, Gesamtstatistiken getrennt, lokale Speicherung zuerst und keine verpflichtenden Abos.

## Native iOS App

Die technische Grundlage und der Migrationsplan für die eigenständige SwiftUI-App stehen unter [`ios/README.md`](ios/README.md). Die native App wird getrennt von der bestehenden Web-/PWA-Version entwickelt; vorhandene Touren werden über das bestehende VELOX-JSON-Backup übernommen.


## Tourendetails 0.9

Die Detailansicht zeigt jetzt zuerst die aufgezeichnete Route mit Start-/Endmarkierung und danach in getrennten, mobilfreundlichen Abschnitten Übersicht, Höhenprofil, Tempo, Gelände, Route, Zeit und Datenquellen. GPS-Lücken werden auf der Karte nicht mit künstlichen Verbindungslinien überbrückt. Die Höhenanalyse verwirft ungültige Koordinaten, unplausible Zeit-/Distanzintervalle sowie negative oder unplausible Höhen-Genauigkeitswerte. Sensoren, die in der PWA-Tour nicht tatsächlich gespeichert wurden, werden als nicht aufgezeichnet ausgewiesen.


## VELOX 0.9.1 – Fahrtzeit und Wetter pro Tour

Jede Tour zeigt Datum sowie Start- und Enduhrzeit getrennt. Beim Beenden fragt VELOX zunächst nach Zustimmung, ob historische Wetterdaten von Open-Meteo mit Fahrtdatum und einer repräsentativen GPS-Position abgefragt werden dürfen. Wird die Abfrage abgelehnt, ist offline oder liefert keine Daten, kann der Fahrer Wetterlage und ungefähre Temperatur manuell für genau diese Tour eintragen. Wetterdaten werden als optionales Feld am jeweiligen Tourobjekt gespeichert; bestehende IndexedDB-Datensätze und das Datenbankschema bleiben unverändert. Historische Wetterwerte sind stündliche Näherungswerte, keine Messung am Fahrrad.


## iPhone-Testhinweis 0.9.1

Der Wrapped-Einstieg befindet sich unter „Mehr“ und besitzt auf schmalen Displays eine mindestens 44 px hohe Touch-Ziel-Fläche. Wrapped liest das lokale Archiv beim Öffnen erneut; nach Tourabschluss und erfolgreichem JSON-Import wird die Archivansicht aktualisiert. Vor dem ersten Test bitte eine JSON-Sicherung exportieren. Die native Swift-Datei `BarometerService.swift` verwendet den Core-Motion-Sample-Zeitstempel (monotone Geräte-Uptime, auf Unix-Zeit abgebildet) statt der verzögerten Callback-Empfangszeit. Swift/Xcode-Build und iPhone-Gerätetest sind weiterhin offen.


## Abschlussprüfung 12.11.2026

- Fehlende GPS-Höhenwerte trennen jetzt Höhen-/Steigungssegmente. Ein Anstieg wird nicht über einen fehlenden Höhenpunkt hinweg abgeleitet.
- Bei Touren ohne gültige Bewegungs- oder Höhenabschnitte zeigen Tempo, VAM, Terrain-Verteilung und maximale Entfernung vom Start keinen scheinbar gemessenen Nullwert.
- GPX-Exporte erhalten zusammenhängende GPS-Abschnitte als getrennte `trkseg`-Elemente; einzelne gültige Punkte bleiben als Ein-Punkt-Segmente erhalten.
- JSON-Import akzeptiert ausdrücklich nur den bestehenden Container `app: "VELOX", version: 1`. Vorhandene IDs werden weiterhin remappt und Datensätze mit `add` statt `put` eingefügt. Optionale unbekannte Tourfelder bleiben bei einem Web-JSON-Rundlauf erhalten.
- Wrapped wird beim Öffnen aus IndexedDB neu berechnet. Beim Öffnen von Wrapped bleibt „Mehr“ als übergeordneter Navigationspunkt markiert. Es werden keine Wrapped-Snapshots gespeichert.
- IndexedDB-Schema bleibt Version 1; bestehende Touren werden weder migriert noch verändert.

## Erster Test am iPhone XR (Web/PWA)

1. Vor dem Test in VELOX unter „Mehr“ eine JSON-Sicherung exportieren und die Datei an einem sicheren Ort behalten.
2. VELOX zuerst über eine HTTPS-Adresse in Safari öffnen. Bei der Standortabfrage „Beim Verwenden“ wählen und „Genauer Standort“ aktivieren.
3. Optional anschließend in Safari über „Teilen“ → „Zum Home-Bildschirm“ hinzufügen. Für den ersten Funktionstest kann Safari selbst verwendet werden.
4. Eine kurze Fahrt im Freien mit freier Sicht zum Himmel aufzeichnen. VELOX während des Tests im Vordergrund lassen und das Display möglichst nicht sperren. Energiesparmodus kann Hintergrund- und Messverhalten zusätzlich einschränken.
5. Eine Standort- oder Bewegungs-/Ausrichtungsfreigabe nur nach einer klaren VELOX-Aktion erteilen. Die aktuelle PWA verwendet GPS; sie liest Barometer, Kompass, Gyroskop und Beschleunigungssensor nicht über native Core Motion APIs aus.
6. Nach dem Speichern Tourdetails und GPS-Lücken prüfen. Danach Wrapped öffnen und kontrollieren, dass die neue Tour in Tourenzahl, Distanz und Rekorden auftaucht. Eine JSON-Sicherung erneut exportieren und prüfen, dass die Tour enthalten ist.
7. Sensorstatus nur als verfügbar werten, wenn VELOX echte Messwerte in dieser Tour gespeichert hat. Fehlende Sensoren müssen als „nicht verfügbar“ bzw. „nicht aufgezeichnet“ erscheinen. Das iPhone XR besitzt zusätzliche Sensorhardware, aber Safari/PWA erhält dadurch keinen automatischen Core-Motion-Zugriff.
8. Kompasskalibrierung und stabile, feste Telefonmontage sind erst für einen späteren nativen Sensortest relevant. Telefonbewegung ist ohne definierte Montage keine verlässliche Fahrrad-Beschleunigung oder Schräglage.

**Grenze:** iOS kann Safari/PWAs im Hintergrund anhalten. VELOX verspricht keine zuverlässige GPS-Aufzeichnung bei gesperrtem Bildschirm. Der native Swift-Code ist vorbereitet, aber ohne Mac/Xcode weder als iOS-App gebaut noch auf einem iPhone installiert oder getestet.
