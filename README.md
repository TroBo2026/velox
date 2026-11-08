# VELOX
**YOUR RIDE. YOUR WORLD.**

VELOX ist ein local-first Fahrrad-Tracker. Dieses Repository enthält den ersten testbaren Web-App-Prototyp für iPhone und iPad.

## Aktueller Stand – Version 0.2.0

- GPS-Aufzeichnung über die Browser-Standortfunktion
- Tour pausieren, fortsetzen und beenden
- Distanz, Dauer, aktuelle und durchschnittliche Geschwindigkeit
- Distanzbezogenes GPS-Höhenprofil mit Achsen, Start-/Zielmarkierung und lokaler Median-Glättung
- Auf- und Abstieg aus geglätteten GPS-Höhenwerten; Höhenpunkte mit gemeldeter vertikaler Ungenauigkeit über 50 m werden ausgelassen
- Separate Tourenliste mit Detailansicht und Streckenkarte
- Persönliche Karte mit allen gespeicherten GPS-Routen
- GPX-Export einzelner Touren
- JSON-Export und -Import aller Tourdaten; beim Import werden vorhandene Touren nie überschrieben, doppelte IDs erhalten eine neue Import-ID
- Lokale Speicherung im Browser über IndexedDB
- Installierbare PWA-Grundstruktur und Offline-App-Shell-Cache

## Datenschutz und Datenspeicherung

- Kein VELOX-Konto und kein Login erforderlich.
- Tourdaten werden im Browser auf dem verwendeten Gerät gespeichert.
- Es gibt keinen VELOX-Server, der Tourdaten entgegennimmt.
- Vor dem Löschen von Browserdaten oder einer Neuinstallation eine JSON-Sicherung exportieren.
- Die Kartenansicht lädt Kartenausschnitte von OpenStreetMap. Dafür werden beim Anzeigen der Karte Netzwerkanfragen an den Kartendienst gesendet; die aufgezeichnete GPX-Tour wird nicht an VELOX-Server hochgeladen.
- Die App lädt derzeit Leaflet und Schrift-/Darstellungsressourcen extern. Offline sind deshalb nicht alle Karten- und Designressourcen verfügbar. Das App-Symbol und die lokale App-Shell werden zusätzlich im Service Worker zwischengespeichert; Karten bleiben onlineabhängig.

## Grenzen des Web-Prototyps

Diese Version 0.2.0 ist ein testbarer Funktionsstand, noch keine vollständige native Fahrrad-App.

- iOS kann Browser-Tabs und Web-Apps im Hintergrund anhalten. GPS-Aufzeichnung bei gesperrtem Bildschirm ist daher nicht zuverlässig garantiert. Während eines Tests VELOX geöffnet und den Bildschirm aktiv lassen.
- Apple-Watch-, HealthKit- und Bluetooth-Sensor-Anbindung sind noch nicht implementiert.
- Herzfrequenz, Watt, Trittfrequenz und Kalorien werden nicht erfunden oder simuliert.
- GPS-Höhenwerte sind ungenau und können schwanken. Ein lokaler Medianfilter dämpft einzelne Ausreißer; Änderungen unter 3 m werden nicht zur kumulierten Summe addiert. Das bleibt eine Näherungsberechnung, keine barometrische Messung.
- Offline-Karten sind noch nicht enthalten.
- Für GPS wird eine sichere HTTPS-Adresse und eine erteilte Standortberechtigung benötigt.

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | App-Struktur und Ansichten |
| `styles.css` | Responsive VELOX-Oberfläche |
| `app.js` | GPS, Berechnungen, IndexedDB, Touren, Export/Import |
| `manifest.webmanifest` | PWA-Metadaten und SVG-App-Icon |
| `icon.svg` | VELOX-App-/Browser-Icon |
| `sw.js` | Cache für den App-Shell |

## Kostenlos testen und bereitstellen

Das Repository ist derzeit öffentlich. GitHub Pages ist bei GitHub Free auf öffentliche Repositories beschränkt. Cloudflare Pages kann dagegen mit einem privaten GitHub-Repository verbunden werden und bei Änderungen am Branch `main` automatisch neu bereitstellen.

Empfohlene Cloudflare-Pages-Einstellungen für diese statische App:

- Framework preset: **None**
- Production branch: **main**
- Build command: **leer lassen**
- Build output directory: **.**
- Root directory: **/**

Nach erfolgreichem Deployment die HTTPS-Adresse auf dem iPhone in Safari öffnen und den Standortzugriff erlauben. Optional über Safari → Teilen → Zum Home-Bildschirm hinzufügen.

## Geplante Entwicklung

1. Stabilität und GPS-Qualität testen
2. Datenmodell und Höhenprofil verbessern
3. GPX-Import und Tourenverwaltung erweitern
4. Sensorintegration prüfen
5. Native iOS-/watchOS-Version evaluieren

**Grundprinzipien:** echte Messwerte statt erfundener Daten, jede Tour einzeln zugänglich, Gesamtstatistiken getrennt, lokale Speicherung zuerst und keine verpflichtenden Abos.
