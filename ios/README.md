# VELOX Native iOS — Entwicklungsgrundlage

Stand: 11. November 2026  
Repository: `TroBo2026/velox` · Branch: `main`  
Ziel: eigenständige native iPhone-App mit SwiftUI, ohne kostenpflichtige Dienste.

## 1. Zielarchitektur

Die native App wird nicht als WKWebView-Hülle umgesetzt. Die bestehende Web-App bleibt vorerst als Referenz und Datenquelle erhalten; die native App erhält eine eigene SwiftUI-Oberfläche und native iOS-Dienste.

| Bereich | Native Umsetzung |
|---|---|
| Oberfläche | SwiftUI, NavigationStack, adaptive Layouts |
| GPS | Core Location (`CLLocationManager`) |
| Höhenmesser | Core Motion (`CMAltimeter`), sofern Gerät und iOS dies unterstützen |
| Tourenspeicherung | lokale SwiftData-Datenbank; keine VELOX-Cloud |
| Karten | zunächst MapKit; Karteninhalte können je nach Gebiet/Cache Internet benötigen |
| Diagramme | Swift Charts |
| Sicherung | JSON-Export/Import und GPX-Export über systemeigene Share-/Dateiauswahl |
| Hintergrundaufzeichnung | Core Location mit expliziter Berechtigung und passender Background-Konfiguration; iOS kann Hintergrundaktivität trotzdem systemseitig begrenzen |
| Sensor-Zukunft | HealthKit/Bluetooth nur nach separater Planung und nur mit echten Messwerten |

**Mindestziel:** iOS 17 als vorläufige Basis (SwiftData und moderne SwiftUI-APIs). Vor dem Anlegen des Xcode-Projekts wird die gewünschte Mindestversion noch einmal geprüft.

## 2. Bestehendes Tourenformat — muss kompatibel bleiben

Die Web-App speichert in IndexedDB (`velox-local`, Store `rides`). Der vorhandene JSON-Backup-Container lautet:

```json
{
  "app": "VELOX",
  "version": 1,
  "exportedAt": "ISO-8601-Datum",
  "rides": []
}
```

Eine Tour enthält mindestens:

- `id`: stabile ID (String)
- `name`: Tourname
- `startedAt`, `endedAt`: Unix-Zeit in Millisekunden
- `pausedMs`, optional `pauseStarted`
- `status`: z. B. `recording`, `paused`, `completed`
- `points`: Array der GPS-Messpunkte

Jeder Messpunkt enthält:

- `lat`, `lon`: Koordinaten in Grad
- `t`: Unix-Zeit in Millisekunden
- `alt`, `altAccuracy`, `altSource`, `pressureKPa`: optionale Höhen-/Druckwerte
- `accuracy`: horizontale GPS-Genauigkeit in Metern

### Migrationsregeln

1. Die native App muss den JSON-Backup-Container mit `app = VELOX` und `version = 1` lesen können.
2. Vorhandene Touren werden niemals still überschrieben oder gelöscht.
3. Bei ID-Kollisionen erhält der importierte Datensatz eine neue ID; die ursprüngliche ID wird als Herkunftsinformation bewahrt.
4. Unbekannte zusätzliche Felder werden beim Import möglichst erhalten oder zumindest nicht durch voreilige Normalisierung verworfen.
5. Import erfolgt transaktional: Bei Fehlern bleibt der bisherige Datenbestand unverändert.
6. Export aus der nativen App bleibt mit dem Web-Prototyp kompatibel.
7. Vor dem ersten Import wird eine Sicherung des bestehenden Datenbestands empfohlen. Die Web-App bietet dafür „JSON-Sicherung exportieren“.

**Wichtig:** IndexedDB-Daten werden nicht automatisch von Safari in eine native App übertragen. Der sichere erste Weg ist: Web-App öffnen → JSON-Sicherung exportieren → Datei in der nativen App importieren.

## 3. Mess- und Berechnungsregeln

Die nativen Messdienste liefern Rohdaten. Die fachliche Berechnung bleibt separat und testbar.

- Distanz, Zeit, Bewegungszeit und Geschwindigkeit müssen dieselben akzeptierten Bewegungsintervalle verwenden.
- GPS-Sprünge, unplausible Zeitabstände, schlechte Genauigkeit und unrealistische Geschwindigkeiten werden markiert bzw. ausgeschlossen.
- Höhenwerte erhalten Quelle und Genauigkeit. GPS-Höhe und Barometerhöhe dürfen nicht als gleichwertig behandelt werden.
- `CMAltimeter` liefert relative Druck-/Höhenänderungen, keine automatisch garantierte absolute Meereshöhe. Eine Referenz-/Kalibrierungsstrategie ist erforderlich.
- Höhenmeter werden aus gefilterten, segmentierten Daten berechnet. Pausen, GPS-Lücken und Sensorwechsel dürfen keine künstlichen Anstiege erzeugen.
- Herzfrequenz, Leistung, Kadenz und Kalorien werden nur dargestellt, wenn eine echte, autorisierte Datenquelle vorhanden ist.

Die bestehenden Filter und Analysefunktionen aus `app.js` und `analysis-pro.js` dienen als Referenz, werden aber nicht ungeprüft in Swift kopiert. Sie erhalten native Unit-Tests mit synthetischen und später anonymisierten Teststrecken.

## 4. Geplante App-Module

Vorgesehene Struktur für das Xcode-Projekt:

```text
ios/
  README.md
  VELOX/
    App/
      VELOXApp.swift
      AppState.swift
    Models/
      Ride.swift
      RidePoint.swift
      SensorSample.swift
    Services/
      LocationRecorder.swift
      AltimeterService.swift
      RideStore.swift
      RideImporter.swift
      RideExporter.swift
      RideAnalyzer.swift
    Features/
      Dashboard/
      Recording/
      RideArchive/
      RideDetail/
      Statistics/
      Settings/
    Resources/
      Assets.xcassets/
    Tests/
      RideAnalyzerTests.swift
      RideImportExportTests.swift
```

Die endgültige Ordnerstruktur wird mit dem Xcode-Projekt angelegt. Diese Datei ist zunächst die verbindliche technische Spezifikation, kein bereits kompilierbares Xcode-Projekt.

## 5. Datenschutz und Berechtigungen

- Keine Anmeldung und kein VELOX-Backend.
- Touren bleiben standardmäßig auf dem Gerät.
- Standortberechtigung wird erst beim Start einer Aufzeichnung angefragt und verständlich erklärt.
- Hintergrundstandort wird nur für eine ausdrücklich gestartete Tour genutzt und muss in iOS transparent beschrieben werden.
- Keine Standortdaten an Analyse- oder Werbedienste senden.
- Keine geheimen Schlüssel, Tokens oder privaten Daten ins Repository committen.
- Kartenanbieter und deren Netzwerkanfragen werden in der Datenschutzerklärung offengelegt.

## 6. Kostenlose Entwicklungs- und Teststrategie

- Swift, SwiftUI, Core Location, Core Motion, SwiftData, MapKit und Swift Charts sind Apple-Frameworks; für ihre lokale Nutzung wird kein externer API-Schlüssel benötigt.
- Keine kostenpflichtigen Karten-, Wetter-, KI- oder Cloud-APIs einbauen.
- Für das Kompilieren und Installieren einer nativen iOS-App wird ein Mac mit einer passenden Xcode-Version benötigt. Ein iPad allein kann Xcode-Projekte nicht nativ kompilieren.
- Lokale Entwicklung und Gerätetests können ohne kostenpflichtige Drittanbieter-Dienste vorbereitet werden. Eine Veröffentlichung im App Store ist ein separater Schritt und kann eine kostenpflichtige Apple-Developer-Mitgliedschaft erfordern; sie ist nicht Teil dieses kostenlosen Entwicklungsziels.

## 7. Umsetzungsreihenfolge

1. Xcode-Projekt und SwiftUI-App-Shell anlegen.
2. Datenmodelle + JSON-v1-Import/Export implementieren und mit Testdateien absichern.
3. Tourenarchiv und Detailansicht aus lokalen Daten aufbauen.
4. Core-Location-Aufzeichnung mit Start/Pause/Fortsetzen/Stoppen ergänzen.
5. Analyzer portieren und mit denselben Testfällen gegen die Web-Version vergleichen.
6. Core-Motion-Höhenmesser optional ergänzen; Geräteverfügbarkeit und Kalibrierung sichtbar machen.
7. Karten, Höhenprofil, Splits und Statistiken ergänzen.
8. iPhone-Tests: Berechtigungen, Display aus, Hintergrund, Energiesparen, GPS-Lücken, App-Neustart und Import/Export.
9. Erst nach erfolgreicher Datenmigration und realen Gerätetests die native App als primäre VELOX-Version festlegen.

## 8. Abnahmekriterien

- Kein Verlust oder Überschreiben vorhandener Touren beim Import.
- Web-JSON-v1 kann importiert und wieder exportiert werden.
- Touraufzeichnung funktioniert mit erteilter Berechtigung; Fehlerzustände sind sichtbar.
- Aufzeichnung übersteht App-Neustart oder stellt einen unvollständigen Datensatz nachvollziehbar wieder her.
- Höhenprofil kennzeichnet Datenqualität und Sensorquelle.
- Keine erfundenen Sensorwerte.
- Kernfunktionen ohne Internet nutzbar; Online-Kartenabhängigkeit wird klar angezeigt.
- Build, Unit-Tests und reale iPhone-Tests sind dokumentiert.
