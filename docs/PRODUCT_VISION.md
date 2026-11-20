# RIDE BY VELOX

**One ride. One platform. VELOX.**

## Produktvision

RIDE BY VELOX verfolgt das Ziel, eine hochwertige, zusammenhängende Plattform für Radfahrer zu entwickeln. Sie verbindet zuverlässige Tourenaufzeichnung, verständliche Leistungsanalyse, Tourenplanung, Navigation, Sensoren, persönliche Statistiken und später Community-Funktionen.

VELOX soll nicht möglichst viele Menüs und Kennzahlen sammeln. Entscheidend ist, dass die Funktionen über den gesamten Ablauf einer Fahrt sauber zusammenspielen: vorbereiten, aufzeichnen, auswerten, wiederfinden und teilen.

Der erste Qualitätsmaßstab ist Mountainbiking. Die Architektur soll später auch Rennrad und Gravel unterstützen, ohne die Anforderungen des MTB zu verlieren.

## Produktbereiche

- **RIDE** – GPS-Aufzeichnung, Pausen, Wiederherstellung, Live-Daten und zuverlässige Speicherung.
- **ANALYZE** – Höhen- und Geschwindigkeitsprofile, Belastung, Vergleiche, persönliche Rekorde und nachvollziehbare Datenqualität.
- **EXPLORE** – Touren entdecken und planen, Karten, Routenführung und später Offline-Navigation.
- **PROFILE** – persönliche Aktivitäten, Fahrräder, Ziele, Statistiken und Datenexport.
- **CONNECT** – später Freunde, gemeinsame Aktivitäten, Clubs und Herausforderungen.
- **DEVICE ECOSYSTEM** – später Apple Watch, HealthKit, Bluetooth-Sensoren und weitere kompatible Geräte.

## Nicht verhandelbare Qualitätsprinzipien

1. **Messwerte statt Fantasiewerte.** Fehlende Sensorwerte bleiben fehlend. Abgeleitete Werte werden als solche gekennzeichnet.
2. **Datenintegrität.** Bestehende Touren, IDs, Zeitstempel, Rohdaten und JSON-v1-Kompatibilität dürfen nicht stillschweigend beschädigt werden.
3. **MTB-taugliche Analyse.** Kurze technische Passagen, langsame Balance- und Kletterabschnitte, kurze Stopps und schnelle Abfahrten dürfen nicht durch übermäßig aggressive Filter verschwinden.
4. **Local-first und Datenschutz.** Lokale Speicherung bleibt der Standard. Eine spätere Synchronisierung muss transparent, sicher und freiwillig sein.
5. **Einfach bedienbar.** Professionelle, ruhige Oberfläche, klare Sprache, konsistente Interaktionen und gute Lesbarkeit.
6. **Keine unnötigen Kosten.** Bevorzugt werden offene Standards, Open-Source-Komponenten und kostenlose Entwicklungswege. Kostenpflichtige Dienste sind keine Voraussetzung für die Kernfunktionen.
7. **Modulare Architektur.** Rechenkern, Datenmodell, Sensoren, Oberfläche und Plattformanbindungen bleiben möglichst unabhängig.
8. **Nachweisbare Qualität.** Jede wichtige Änderung erhält passende Tests. CI-Erfolg wird nicht mit einem echten Geräte- oder Praxistest verwechselt.

## Plattformstrategie

### Web/PWA – Entwicklungs- und Übergangsplattform

Die bestehende Web-App bleibt nutzbar und dient als schnelle Entwicklungs- und Testplattform. Sie kann bereits Touren lokal speichern, auswerten und exportieren. Browsergrenzen bei Hintergrund-GPS, HealthKit, Apple Watch und Bluetooth werden offen ausgewiesen.

### Native iOS- und watchOS-App – langfristiges Ziel

Die native App soll die Systemfunktionen direkt nutzen: Core Location, Core Motion, HealthKit, WatchConnectivity und Core Bluetooth, soweit Geräte und Berechtigungen es unterstützen. Eine native Ablösung erfolgt erst nach Datenmigrationstests, automatisierten Prüfungen und echten Fahrten auf kompatiblen Geräten.

Ein Mac und Xcode sind derzeit nicht verfügbar. Native Quellcodearbeit und Simulator-Builds können vorbereitet werden; Installation, Debugging und Praxistests auf Apple-Geräten bleiben bis dahin begrenzt.

## Entwicklungsreihenfolge

### 0 – Fundament und Bestandsaufnahme
- Code, Datenmodell, Tests, PWA-Cache und native Targets dokumentieren.
- Versions- und Testkonsistenz herstellen.
- Kritische Fehler und Datenverlustrisiken zuerst beheben.

### 1 – RIDE: zuverlässige Aufzeichnung
- Start, Pause, Fortsetzen, Beenden und Wiederherstellung robust machen.
- GPS-Lücken, Zeitstempel, Akku- und Speicherverhalten prüfen.
- MTB-Bewegungsprofile realistisch behandeln.
- GPX- und JSON-Sicherung langfristig stabil halten.

### 2 – ANALYZE: belastbare Auswertung
- Gemeinsame Rechenregeln für Live-Ansicht, Tourdetail und Archiv.
- Höhenprofil, Steigung, Tempo und Datenqualität verbessern.
- Tourenvergleiche und persönliche Entwicklung nachvollziehbar gestalten.

### 3 – DEVICE ECOSYSTEM
- Native Sensorarchitektur und Apple-Watch-Verbindung vervollständigen.
- Herzfrequenz, Leistung, Trittfrequenz, Geschwindigkeit und Höhenmessung nur aus echten Datenquellen übernehmen.
- Zeitstempel, Quellen, Berechtigungen und Datenlücken korrekt behandeln.

### 4 – EXPLORE
- Karten- und Routendatenquellen prüfen.
- Tourenplanung und Navigation aufbauen.
- Lizenzbedingungen, Datenschutz, Offline-Speicher und Kartenaktualisierung vor der Integration klären.

### 5 – PROFILE und CONNECT
- Fahrräder, Ziele, Statistiken und persönliche Einstellungen ausbauen.
- Freiwillige Synchronisierung und Teilen entwerfen.
- Community-Funktionen erst dann ergänzen, wenn Datenschutz, Moderation und Betrieb realistisch geklärt sind.

### 6 – Native Produktreife
- iPhone- und Watch-Tests auf echter Hardware.
- Datenmigration und Wiederherstellung ausgiebig testen.
- Barrierefreiheit, Energieverbrauch, Stabilität und Fehlerdiagnose prüfen.
- Erst danach die native App als primäre Plattform festlegen.

## Definition of Done

Eine Funktion gilt erst als fertig, wenn:
- sie einen klaren Nutzwert erfüllt,
- Fehler- und Grenzfälle berücksichtigt sind,
- vorhandene Daten erhalten bleiben,
- automatisierte Tests erfolgreich sind,
- die Oberfläche verständlich und konsistent ist,
- bekannte Plattformgrenzen korrekt angezeigt werden,
- und – wenn Hardware beteiligt ist – ein entsprechender Gerätetest dokumentiert wurde.

**Leitgedanke:** Erst ein verlässliches Fahrerlebnis. Dann ein vollständiges Ökosystem.