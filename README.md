# VELOX
**YOUR RIDE. YOUR WORLD.**

VELOX ist ein local-first Fahrrad-Tracker. Dieses Repository enthält einen testbaren Web-App-Prototyp für iPhone und iPad.

## Aktueller Stand – Version 0.4.0

- GPS-Aufzeichnung mit Pause, Fortsetzen und Tourabschluss
- Live-Daten: Distanz, Geschwindigkeit, Fahrzeit, Aufstieg, Durchschnittstempo, aktuelle GPS-Höhe, aktuelle Steigung, Fahrzeitanteil und Höhen-Datenqualität
- Tourenanalyse: Distanz, Fahrzeit, Standzeit, Durchschnitts- und Maximaltempo, Auf- und Abstieg, höchster/tiefster Punkt, durchschnittliche Steigung, steilste Steigung und steilste Abfahrt
- Höhenprofil mit Distanzachse, Start-/Zielmarkierung und Median-Glättung über bis zu fünf benachbarte GPS-Höhenwerte
- Höhenwerte mit gemeldeter vertikaler Ungenauigkeit über 35 m werden ausgelassen; Änderungen unter 4 m werden nicht zur kumulierten Höhenmeter-Summe addiert
- Qualitätskennzeichnung der Höhenmessung anhand der verfügbaren GPS-Höhendaten
- Persönliche VELOX MAP mit mehreren gespeicherten Touren, individuellen Streckenfarben, Ein-/Ausblenden einzelner Touren, Zeitfiltern und lokaler Streckendichte-Ansicht
- Separate Tourenliste mit Detailansicht und Streckenkarte
- GPX-Export einzelner Touren
- JSON-Export und -Import aller Tourdaten; vorhandene Touren werden beim Import nie überschrieben, doppelte IDs erhalten eine neue Import-ID
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
| `app.js` | GPS, Berechnungen, IndexedDB, Touren, Export/Import |
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

## Geplante Entwicklung

1. Reale iPhone-Tests für GPS-Qualität, Höhenprofil, Tourenspeicherung und iOS-Verhalten
2. Native iOS-Sensoranbindung für Barometer/Core Motion prüfen und umsetzen, sobald ein nativer App-Unterbau vorhanden ist
3. Echte Herzfrequenz-, Trittfrequenz- und Leistungssensoren anbinden
4. Tourenvergleich, detaillierte Geschwindigkeits-/Steigungsprofile und Rekorde
5. Native iOS-/watchOS-Version und Offline-Karten evaluieren

**Grundprinzipien:** echte Messwerte statt erfundener Daten, jede Tour einzeln zugänglich, Gesamtstatistiken getrennt, lokale Speicherung zuerst und keine verpflichtenden Abos.
