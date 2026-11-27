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

## Im Xcode-Simulator starten

1. Auf einem Mac mit Xcode die iOS- und watchOS-Simulatorplattformen installieren.
2. `ios/VELOX.xcodeproj` öffnen. Im Scheme-Menü `VELOX` und ein iPhone mit iOS 17 oder neuer auswählen. Mit **Run** starten.
3. Für die Watch-Oberfläche das Scheme `VELOXWatch` und eine Apple Watch mit watchOS 10 oder neuer auswählen. Mit **Run** starten.

Die beiden Schemes sind im Repository gespeichert. Ein Simulator-Build benötigt kein Apple-Entwicklerteam. Für WatchConnectivity-Tests ist ein gekoppeltes Simulatorpaar oder ein echtes Gerätepaar nötig.

## Automatisierte Prüfung

Der Workflow `.github/workflows/ios-build.yml` läuft auf einem macOS-Runner und:

1. validiert die Xcode-Projektdateien,
2. baut das iPhone-Target für den iOS-Simulator,
3. baut das Watch-Target für den watchOS-Simulator und startet beide Apps jeweils auf einem verfügbaren Simulator,
4. führt die Swift-Höhen-, Strecken- und Kalibrierungsvalidierung aus,
5. führt die Watch-Sensorpaket-Validierung aus,
6. prüft den verlustfreien JSON-v1-Rundlauf mit einem PWA-kompatiblen Fixture,
7. prüft das lokale Tourenarchiv einschließlich Insert, Duplicate-Schutz, Replace, ungültigen Daten, ID-Kollisionen, Delete und beschädigtem Archiv,
8. stellt bei Erfolg ein Simulator-Build-Artefakt bereit.

Die Swift-Prüfprogramme verwenden synthetische Daten. Die Elevationsvalidierung deckt 15 Regressionstestfälle ab, darunter GPS-/Barometerkalibrierung, Pause/Fortsetzen, Ausreißer, GPS- und Barometerlücken sowie MTB-Route. Native Barometerprofile und Summen werden bei mehr als 15 Sekunden Probenabstand getrennt; die Kompatibilitätssumme verwendet dieselbe Grenze. Der eigenständige Kalibrierungshelfer verlangt identische, nicht-leere Sitzungs-IDs, chronologische Samples und höchstens 15 Sekunden Baseline-Alter. Der automatisierte Start prüft die Installation und den Prozessstart. Eine Sichtprüfung der Oberfläche und echte iPhone- oder Watch-Tests erfolgen separat.

Der Web-Workflow prüft unabhängig davon die PWA. Ein erfolgreicher Web-Build sagt nichts über native Hardwarefunktionen aus.

## Bekannte Grenzen und Freigabeblocker

- **Keine echte Gerätevalidierung:** iPhone, Apple Watch, HealthKit-Berechtigungen, Sensorverfügbarkeit, Verbindungsabbrüche und Akkuverhalten müssen noch auf realer Hardware geprüft werden.
- **Keine native Hintergrund-GPS-Aufzeichnung:** Der aktuelle `RideRecorder` ist vordergrundorientiert und setzt `allowsBackgroundLocationUpdates = false`. Hintergrundaufzeichnung ist nicht freigegeben.
- **Keine produktive Datenmigration freigegeben:** Der JSON-v1-Codec konvertiert PWA-Zeitstempel (Unix-Millisekunden) an der Import-/Exportgrenze in die nativen Sekundenwerte und zurück. GPS-Punktzeiten werden ebenfalls umgerechnet; Pausendauer sowie Barometer- und Watch-Zeitstempel bleiben in Millisekunden. Unbekannte JSON-Felder in Touren, GPS-Punkten, Barometer- und Watch-Proben bleiben beim Rundlauf erhalten. Das ist mit einem realistischen PWA-kompatiblen Fixture automatisiert geprüft, ersetzt aber noch keinen kontrollierten Migrationslauf mit einer Kopie realer Nutzerdaten.
- **Archivvalidierung:** `RideStore` wird automatisiert auf Insert, Duplikatschutz, Replace, Ablehnung ungültiger Daten, ID-Kollisionen beim Import, exaktes Löschen und unveränderte beschädigte Archive geprüft. Die Tests verwenden temporäre Dateien; ein Stromausfall- oder Dateisystemfehler während des atomaren Schreibens ist kein simulierter Hardwaretest.
- **Watch-Ende-zu-Ende-Test fehlt:** Der Quellcode und die Simulator-Build-Konfiguration sind vorhanden; die tatsächliche Kopplung, verspätete Nachrichten und Synchronisierung auf einer gekoppelten Watch sind noch nicht bestätigt.
- **UI-Test fehlt:** Navigation, Zustände, Fehlermeldungen und Bedienbarkeit wurden noch nicht vollständig manuell im Simulator geprüft.

Bis diese Punkte behoben und geprüft sind, darf die native App die PWA nicht ersetzen.

## Entwicklung ohne eigenen Mac

Quellcodeänderungen und automatisierte Simulator-Builds können über GitHub und GitHub Actions erfolgen. Dafür muss lokal kein Xcode installiert sein.

Ein Mac mit Xcode wird später benötigt, um die App lokal im Simulator zu starten, auf ein echtes iPhone oder eine Apple Watch zu installieren, zu signieren und Hardwareprobleme zu debuggen. Simulator-Builds benötigen keine kostenpflichtige Entwickler-Mitgliedschaft. Eine App-Store-Veröffentlichung ist nicht Teil des kostenlosen Entwicklungswegs.

## Nächste native Arbeitsschritte

1. Die CI-Ergebnisse für iOS, watchOS, JSON-v1 und `RideStore` vollständig abwarten und alle Fehler beheben.
2. Nach bestandenen Prüfungen Phase 1 nach `main` mergen.
3. Phase 2 mit ANALYZE beginnen: belastbare Kennzahlen, Höhen-/Leistungsdarstellung und verständliche Trainingsauswertung.
4. Watch-Verbindung, HealthKit-Proben, Hintergrundverhalten und Wiederherstellung weiter absichern.
5. Vor einer öffentlichen nativen Freigabe echte iPhone- und Watch-Fahrten auf Hardware durchführen.
