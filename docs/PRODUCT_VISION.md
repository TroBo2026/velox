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

## Nächste Aufträge für die persönliche Fahrradkarte

1. **Messqualität im Tourdetail.** Aus Position und Zeit lassen sich Bewegung, Tempo je Abschnitt und erkannte Stopps ableiten. Eine Zeitgrafik kann Bewegung, beobachteten Stillstand, manuelle Pausen und ungeklärte Zeit getrennt ausweisen. Beim vorhandenen Höhenprofil den Anteil der Strecke mit zusammenhängenden, brauchbaren Höhenwerten anzeigen. Gemeldete vertikale Unsicherheit über 35 m, Höhensprünge und fehlende Höhen trennen das Profil. Fehlende Genauigkeit als unbekannt kennzeichnen. Eine einzelne Höhe reicht für eine Punktangabe, für Höhengewinn braucht es einen zusammenhängenden Verlauf. Puls, Leistung und Trittfrequenz benötigen eigene Sensorwerte.
2. **Wrapped nach Kalenderjahr.** Das gewählte Jahr nach lokalem Startdatum aus abgeschlossenen Fahrradtouren bilden. Gewertete Kilometer summieren, die längste Fahrt anhand ihrer gewerteten Distanz bestimmen und als aktivsten Monat den Monat mit den meisten Kilometern anzeigen. Bei Gleichstand alle führenden Monate nennen. Fahrten ohne verwertbare Strecke separat zählen. Leere Jahre und den Jahreswechsel mit synthetischen Fahrten prüfen.
3. **„Deine neu entdeckten Wege“.** Auf dem Gerät einen räumlichen Index aus akzeptierten Streckenabschnitten vor Jahresbeginn aufbauen. Die Fahrten des gewählten Jahres chronologisch in kurzen Abständen entlang ihrer Linien abtasten. Abstand zum nächsten früheren Liniensegment, Verlauf über mehrere Punkte und Fahrtrichtung in beiden Richtungen vergleichen. Einen kleinen, begrenzten Toleranzkorridor anhand der GPS-Genauigkeit mit synthetischen Parallelspuren kalibrieren. Nur über eine zusammenhängende Mindestlänge eindeutig neue Abschnitte hervorheben. Unsichere Zuordnungen gesondert behandeln. Lücken und Pausen trennen Linien. Bereits angerechnete Abschnitte nach jeder Fahrt in den Index übernehmen. Fälle für Rückweg, leicht versetzte Spur, parallele Straße, Kreuzung und neuen Abzweig testen. Ohne ältere Fahrten die Karte als „erstmals im lokalen Archiv“ kennzeichnen.
4. **Teilbare Jahresgrafik.** Lokal ein neues PNG aus einer festen Auswahl erzeugen: Jahr, Gesamtkilometer, Länge der längsten Fahrt und aktivster Monat. Die persönliche Karte bleibt in VELOX. Tourennamen, Koordinaten, Start-/Zielorte, Linien, Kacheln und GPS-Metadaten sind im Standardexport ausgeschlossen. Vorschau vor dem bewussten Teilen über das Systemmenü oder Speichern als Datei. Export offline prüfen und Grafik sowie Metadaten auf Standortangaben kontrollieren.
