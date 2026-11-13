# VELOX
**YOUR RIDE. YOUR WORLD.**

VELOX ist ein local-first Fahrrad-Tracker. Dieses Repository enthält einen testbaren Web-App-Prototyp für iPhone und iPad.

## Aktueller Stand – Version 0.9.3

- GPS-Aufzeichnung mit Pause, Fortsetzen und Tourabschluss; Start direkt auf der Track-Seite oder auf der Startseite
- Offline-Aufzeichnung: GPS-Punkte werden lokal in IndexedDB gespeichert; ohne Verbindung zeigt VELOX eine schematische Offline-Strecke, nach Wiederverbindung können Kartendaten nachgeladen werden
- Modulare Sensor-Schnittstelle: GPS-Höhe plus optionale, validierte native Barometerwerte; Qualitätsgewichtung anhand der gemeldeten Genauigkeit
- Sensorstatus in der Live-Ansicht: GPS-Höhe, Barometerverfügbarkeit und tatsächlich verwendete Höhenquelle
- Native Bridge-Vertrag: `velox:native-altimeter` mit `altitudeM`, `accuracyM`, `pressureKPa` und optionalem Zeitstempel; ohne native Quelle bleibt VELOX bei GPS
- Live-Daten: Distanz, Geschwindigkeit, sekundengenau an der Systemuhr ausgerichtete Fahrzeit, Aufstieg, Durchschnittstempo, aktuelle GPS-Höhe, aktuelle Steigung, Fahrzeitanteil und Höhen-Datenqualität; die aufwendige GPS-Auswertung wird nicht mehr bei jedem Sekundentick vollständig neu berechnet
- Tourenanalyse: Distanz, Fahrzeit, Standzeit, Durchschnitts- und Maximaltempo, Auf- und Abstieg, höchster/tiefster Punkt, durchschnittliche Steigung, steilste Steigung und steilste Abfahrt
- Geglättetes Geschwindigkeitsprofil über die Streckendistanz in jeder Tour-Detailansicht
- Automatischer Vergleich der letzten drei gespeicherten Touren in den Statistiken
- Neuer Wrapped-Reiter mit automatisch aktualisiertem Archiv-Rückblick: Gesamtzeit im Sattel, Distanz, Auf-/Abstieg, persönliche Rekorde, längster zusammenhängender Anstieg, schnellster voller Kilometer, VAM sowie aggregierte Gelände- und Tempo-Zonen
- Erweiterte Tourendetails: Steigungsverteilung, Zeit in Geschwindigkeitszonen, längster Anstieg, VAM, Median-Tempo, maximale Entfernung vom Start und Strecken-Geradlinigkeit; zusätzlich pro einzelner Fahrt GPS-erkanntes Stopps-Count und längster Stopp (ab 10 s, unter 1,5 km/h; manuelle Pausen und GPS-Lücken werden nicht als Stopps gewertet); alle Berechnungen nutzen vorhandene GPS-Punkte
- VELOX Pro Analyse: optionale Einzeltour- und Archiv-Auswertung mit 1/5/10-km-Splits, Tempozonen, Steigungsverteilung, GPS-Qualitätsbericht, Höhen-Ausreißerbericht und Archiv-Rekorden; ausschließlich lesender Zugriff auf vorhandene IndexedDB-Daten
- Einheitliche Bewegungsfilter in Tourendetails, Live-Kennzahlen und Pro-Analyse: gültige GPS-Koordinaten, Zeitabstand bis 30 s, Distanz von 0,8 bis 150 m, gemeldete horizontale Genauigkeit höchstens 80 m und Tempo von 1,5 bis 100 km/h. Distanz, Bewegungszeit, Durchschnitts- und Maximaltempo stammen aus denselben akzeptierten Fahrintervallen.
- Gemeinsame Höhen-Engine für Live-Ansicht, Tourendetails und Pro-Analyse: robuste lokale Median-/Ausreißerprüfung, segmentbewusste Glättung und adaptive Mindestschwelle für kumulierte Höhenmeter; fehlende oder unbrauchbare Höhenwerte trennen Auswertungssegmente und werden nicht überbrückt
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

Das Repository enthält jetzt ein vorbereites eigenständiges SwiftUI-Xcode-Projekt unter `ios/VELOX.xcodeproj`. Die native App ist ausdrücklich keine WKWebView-Hülle. Sie nutzt lokale JSON-Sicherung, Core Location und – sofern das Gerät es unterstützt – Core Motion. Die vorhandene Web-/PWA-Version bleibt unverändert nutzbar und wird erst nach erfolgreichen Xcode-, Import-/Export- und iPhone-Tests ersetzt.

Der native Quellcode ist vorbereitet, aber noch **nicht** mit Xcode gebaut oder auf einem iPhone installiert. Öffne auf dem Mac die Datei `ios/VELOX.xcodeproj`, wähle das Schema `VELOX` und baue zunächst für einen iPhone-Simulator. Für den Gerätestart muss Xcode gegebenenfalls eine kostenlose persönliche Signierung einrichten. Eine App-Store-Veröffentlichung ist nicht Teil dieses kostenlosen Vorhabens.

Die Swift-Modelle bewahren unbekannte zusätzliche Felder in Touren und GPS-Punkten als JSON-Werte. Damit bleiben insbesondere bereits vorhandene optionale Web-Felder wie `weather` beim nativen Import-/Export-Rundlauf erhalten. Die vollständige Vorbereitung, bekannte Grenzen und ein 30-Minuten-Mac-Ablauf stehen unter [`ios/README.md`](ios/README.md).


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


## VELOX 0.9.2 – Offline- und Performance-Überarbeitung

- Die App-Shell wird ohne externe Schrift- oder Kartenbibliothek gestartet. Dadurch blockieren Google Fonts und Leaflet den ersten Seitenaufbau nicht mehr.
- Leaflet wird erst bei einer tatsächlich benötigten Online-Kartenansicht nachgeladen. Ohne Netz bleibt die schematische lokale Streckenansicht verfügbar.
- Der Service Worker verwendet einen neuen versionierten App-Shell-Cache und liefert Navigationen bei fehlender Verbindung aus dem lokalen Cache aus.
- Bereits gecachte App-Dateien werden zuerst angezeigt und im Hintergrund aktualisiert; fehlende Netzwerkressourcen führen nicht zum Verlust der lokal gespeicherten Touren.
- Die mobile Oberfläche wurde bei Kontrast, Touch-Zielen, Zahlenlesbarkeit, Kartenhöhe und Systemschrift-Fallback überarbeitet.

**Wichtige Grenzen bleiben bestehen:** Offline-Kartenkacheln sind noch nicht enthalten. GPS-Aufzeichnung hängt weiterhin von iOS-Standortfreigabe und dem Verhalten von Safari/PWA im Vordergrund ab. Ein echter iPhone-Test ist erforderlich, bevor die Zuverlässigkeit als bestätigt gelten kann.


## VELOX 0.9.3 – Höhen-Engine und Pro-Analyse

- Neue gemeinsame Datei `elevation-core.js` wird vor Live-Tracker und Pro-Analyse geladen und im Offline-App-Shell-Cache mitgeführt.
- Lokale Höhen-Ausreißer werden nur bei ausreichender Nachbarschaft und deutlicher Abweichung verworfen; Filterfenster überschreiten keine Zeit-/Distanzgrenzen oder Segmentwechsel.
- Robuste Median-Glättung nutzt auch brauchbare Randfenster statt bei weniger als fünf Samples vollständig auf Rohwerte zurückzufallen.
- Die Schwelle zur Aufsummierung von Auf-/Abstieg passt sich begrenzt an die gemeldete vertikale Genauigkeit an.
- Pro-Analyse zeigt eine abgestufte Höhenqualität und die Anzahl verworfener Höhenausreißer.
- Ohne gemeldete vertikale Genauigkeit wird die Qualität ausdrücklich als nicht bewertet geführt; es wird keine Genauigkeit erfunden.

**Hinweis:** Das iOS-Barometer liefert zunächst relative Höhenänderungen. Die vorhandene Swift-Kalibrierung kann diese mit einem zeitnahen, ausreichend genauen GPS-Höhenreferenzpunkt verankern. Diese native Messkette ist noch nicht mit der Web-App verbunden und wird daher hier nicht als aktive Sensorquelle ausgegeben.
