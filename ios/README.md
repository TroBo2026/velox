# VELOX Native iOS und Apple Watch

Stand: 20. November 2026

## Projektaufbau

Das Repository enthält ein eigenständiges SwiftUI-Projekt unter `ios/VELOX.xcodeproj` mit zwei Targets:

- `VELOX`: iPhone-App für iOS 17 oder neuer
- `VELOXWatch`: eingebettete Apple-Watch-Begleit-App

Die native App ist keine WKWebView-Hülle. Die Web-/PWA-Version bleibt parallel bestehen und ist weiterhin die nutzbare Hauptversion, bis die native Datenmigration und echte Gerätetests freigegeben sind.

## Implementierte native Bausteine

### iPhone

- `RideRecorder.swift`: nutzergesteuerte Core-Location-Aufzeichnung mit Start, Pause, Fortsetzen und Beenden.
- `BarometerService.swift`: Core-Motion-Barometerproben mit Originalzeitstempeln und getrennten Messsitzungen nach Pause/Fortsetzen.
- `RideAnalysis.swift`: GPS-/Barometer-Auswertung, Qualitätsstatus, Höhenprofil und segmentbewusste Streckenberechnung.
- `RideStore.swift`: lokales versioniertes Archiv in Application Support. Schreibvorgänge erfolgen atomar; ein beschädigtes Archiv wird nicht stillschweigend überschrieben.
- `RideBackupCodec.swift`: Validierung und Import/Export des VELOX-JSON-v1-Formats mit ID-Kollisionsbehandlung.

### Apple Watch

- Eigenständige SwiftUI-Oberfläche mit Start, Pause, Fortsetzen und Beenden einer Rad-Workout-Session.
- HealthKit-Workout-Erfassung und Zugriff auf verfügbare Werte wie Herzfrequenz, aktive Energie, Raddistanz sowie – abhängig von Gerät und Datenquelle – Geschwindigkeit, Trittfrequenz und Leistung.
- Core-Motion-Relative-Altimeter für relative Höhenänderungen.
- WatchConnectivity für Tourstatus, Sensorproben und Steuerbefehle zwischen Watch und iPhone.
- Sensorproben enthalten eine Tour-ID, einen expliziten Zeitstempel, einen Messwert und eine Datenquelle. Ungültige oder nicht plausible Pakete werden abgewiesen.

Die beiden Quellkopien von `WatchSensorSample.swift` müssen identisch bleiben. Die CI prüft das mit `cmp`, bevor sie baut.

## Automatisierte Prüfung

Der Workflow `.github/workflows/ios-build.yml` läuft auf einem macOS-Runner und:

1. validiert die Xcode-Projektdateien,
2. baut das iPhone-Target für den iOS-Simulator,
3. baut das Watch-Target für den watchOS-Simulator,
4. führt die Swift-Höhen-, Strecken- und Kalibrierungsvalidierung aus,
5. führt die Watch-Sensorpaket-Validierung aus,
6. stellt bei Erfolg ein Simulator-Build-Artefakt bereit.

Die Swift-Prüfprogramme verwenden synthetische Daten. Die Elevationsvalidierung deckt 15 Regressionstestfälle ab, darunter GPS-/Barometerkalibrierung, Pause/Fortsetzen, Ausreißer, GPS- und Barometerlücken sowie MTB-Route. Native Barometerprofile und Summen werden bei mehr als 15 Sekunden Probenabstand getrennt; die Kompatibilitätssumme verwendet dieselbe Grenze. Der eigenständige Kalibrierungshelfer verlangt identische, nicht-leere Sitzungs-IDs, chronologische Samples und höchstens 15 Sekunden Baseline-Alter. Diese Prüfungen ersetzen weder einen manuellen Simulatorstart noch einen echten iPhone- oder Watch-Test.

Der Web-Workflow prüft unabhängig davon die PWA. Ein erfolgreicher Web-Build sagt nichts über native Hardwarefunktionen aus.

## Bekannte Grenzen und Freigabeblocker

- **Keine echte Gerätevalidierung:** iPhone, Apple Watch, HealthKit-Berechtigungen, Sensorverfügbarkeit, Verbindungsabbrüche und Akkuverhalten müssen noch auf realer Hardware geprüft werden.
- **Keine native Hintergrund-GPS-Aufzeichnung:** Der aktuelle `RideRecorder` ist vordergrundorientiert und setzt `allowsBackgroundLocationUpdates = false`. Hintergrundaufzeichnung ist nicht freigegeben.
- **Keine verlustfreie Web-Datenmigration:** Die Swift-Codable-Modelle bilden derzeit nur ausdrücklich definierte Felder ab. Unbekannte zusätzliche JSON-Schlüssel aus Web-Touren – beispielsweise künftige Erweiterungen oder optionale Felder – werden nicht automatisch erhalten. Der native JSON-v1-Rundlauf ist deshalb noch kein Ersatz für den Web-Export.
- **Archivtests fehlen:** `RideStore` braucht noch gezielte Tests für Neuanlage, Update, Duplikate, Löschen, beschädigte Dateien und Persistenz nach Neustart.
- **JSON-v1-Fixtures fehlen:** Import und Export müssen mit echten Web-Sicherungen geprüft werden, einschließlich aller optionalen Felder, Zeitstempel, Pausen, Wetterdaten und Watch-Proben.
- **Watch-Ende-zu-Ende-Test fehlt:** Der Quellcode und die Simulator-Build-Konfiguration sind vorhanden; die tatsächliche Kopplung, verspätete Nachrichten und Synchronisierung auf einer gekoppelten Watch sind noch nicht bestätigt.
- **UI-Test fehlt:** Navigation, Zustände, Fehlermeldungen und Bedienbarkeit wurden noch nicht vollständig manuell im Simulator geprüft.

Bis diese Punkte behoben und geprüft sind, darf die native App die PWA nicht ersetzen.

## Entwicklung ohne eigenen Mac

Quellcodeänderungen und automatisierte Simulator-Builds können über GitHub und GitHub Actions erfolgen. Dafür muss lokal kein Xcode installiert sein.

Ein Mac mit Xcode wird später benötigt, um die App lokal im Simulator zu starten, auf ein echtes iPhone oder eine Apple Watch zu installieren, zu signieren und Hardwareprobleme zu debuggen. Simulator-Builds benötigen keine kostenpflichtige Entwickler-Mitgliedschaft. Eine App-Store-Veröffentlichung ist nicht Teil des kostenlosen Entwicklungswegs.

## Nächste native Arbeitsschritte

1. Ein verlustfreies JSON-Datenmodell für unbekannte Felder entwerfen und mit Web-v1-Fixtures testen.
2. Unit-/Validierungstests für `RideStore` und `RideBackupCodec` ergänzen.
3. GPS-Aufzeichnung, Fehlerbehandlung und Wiederherstellung mit synthetischen Grenzfällen prüfen.
4. Watch-Verbindung, HealthKit-Proben und Steuerbefehle in automatisierten Tests absichern.
5. Erst mit verfügbarer Hardware echte iPhone- und Watch-Fahrten durchführen.
