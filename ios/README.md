# VELOX Native iOS — Build- und Teststatus

Stand: 16. November 2026 · Repository `TroBo2026/velox` · Branch `main`

## Aktueller Status

Unter `ios/VELOX.xcodeproj` liegt ein eigenständiges natives SwiftUI-Projekt, keine WebView-Hülle. Am **16. November 2026** waren Projektvalidierung und ein echter `xcodebuild`-Build für den generischen iOS-Simulator in GitHub Actions erfolgreich (Xcode 16.4, iOS-Simulator-SDK 18.5, ohne Codesignierung). Der aktuelle native Stand wurde damit kompiliert, aber nicht im Simulator gestartet und nicht auf einem iPhone installiert oder getestet.

Zusätzlich besteht ein reproduzierbarer Swift-Validierungslauf für die Höhenanalyse. Am 16. November 2026 haben **8/8 Prüfungen** bestanden: leere Daten, stabile Kalibrierung, zu wenige Referenzen, instabile Referenzen, GPS-Lücken, getrennte Barometersitzungen nach Pause/Fortsetzen, Ausreißer-/Rohdatenintegrität sowie ungültige GPS-Koordinaten und extreme Zeitstempel. Das ist ein eigenständiges Testprogramm, kein XCTest-Target. Die Tests verwenden synthetische Prüfdaten und ersetzen keine echte Sensor- oder Gerätetestfahrt.

Die native Grundfunktion enthält eine vom Nutzer gestartete GPS-Aufzeichnung im Vordergrund, ein lokales versioniertes Tourenarchiv und echte zeitgestempelte Core-Motion-Barometerproben. Die Höhenprofil-Pipeline verwendet zeitnahe echte GPS-Höhenreferenzen mit vertikaler Genauigkeit bis 15 m. Je Barometersitzung sind mindestens drei unterschiedliche Referenzpaare und eine mediane absolute Abweichung von höchstens 10 m erforderlich. Der Barometerverlauf liefert die Profilform; GPS verankert jede Sitzung separat. Bei unzureichender Referenz bleibt die Sitzung ausdrücklich relativ. Die größte messbare Sitzungs-MAD bleibt als Qualitätsdiagnose sichtbar, auch wenn eine Kalibrierung abgelehnt wird. Lücken über 30 Sekunden und unplausible GPS-Sprünge werden nicht überbrückt; isolierte Höhenänderungen über 8 m werden aus den Auf-/Abstiegssummen ausgeschlossen, aber nicht aus den Rohdaten gelöscht.

**Noch nicht freigegeben:** echter iPhone-Test, manuelle UI-Prüfung im Simulator, Langzeit-/Pause-Tests mit realen Sensoren, persistente Archivtests, JSON-v1-Rundlauf und Datenmigration. Hintergrundaufzeichnung ist nicht implementiert. Die bestehende Web-/PWA-Version bleibt die nutzbare VELOX-Version und wird nicht durch die native Vorschau ersetzt.

## Was auf dem Mac installiert werden muss

**Erforderlich:**
- Ein mit der gewählten Xcode-Version kompatibles macOS.
- **Xcode** aus dem Mac App Store: https://apps.apple.com/app/xcode/id497799835
- Eine Internetverbindung für Download, erste Komponenteninstallation und den ersten Projektabruf.

**Nicht erforderlich:** GitHub Desktop, Homebrew, CocoaPods, zusätzliche SDK-Pakete, kostenpflichtige Build-Dienste oder kostenpflichtige Entwickler-Abos. Das Projekt kann als ZIP aus GitHub geladen werden; Xcode enthält die benötigten Apple-Entwicklungswerkzeuge.

Xcode ist ein großer Download. Plane vorsichtshalber mindestens etwa 40–50 GB freien Speicherplatz ein, damit Download, Installation und Simulator-Dateien Platz haben. Der tatsächliche Bedarf hängt von der Xcode-Version und den installierten Simulatoren ab. Prüfe den freien Speicher vorher unter Systemeinstellungen > Allgemein > Speicher. Auf einem geliehenen Mac nichts installieren, aktualisieren oder löschen, ohne vorher die Zustimmung des Besitzers einzuholen.

## Vorbereitung vor dem 30-Minuten-Termin

1. Auf dem Mac über  > Über diesen Mac die macOS-Version prüfen. Kein macOS-Upgrade ohne Zustimmung des Besitzers starten.
2. Im Mac App Store prüfen, welche Xcode-Version angeboten wird und ob sie mit diesem macOS kompatibel ist.
3. Xcode möglichst **vor dem gemeinsamen Testtermin** herunterladen und installieren. Der Download kann deutlich länger als 30 Minuten dauern.
4. Xcode einmal starten und die zusätzlichen Komponenten/Lizenzdialoge abschließen. Dafür kann das Administratorpasswort des Mac-Besitzers erforderlich sein.
5. VELOX von GitHub laden: Repository `TroBo2026/velox`, Branch `main` > Code > Download ZIP. ZIP entpacken.
6. Im entpackten Ordner die Datei `ios/VELOX.xcodeproj` öffnen.

## Manueller Simulator-UI-Test (noch offen)

- **0–5 min:** Xcode starten, `VELOX.xcodeproj` öffnen und warten, bis das Projekt geladen ist.
- **5–10 min:** Oben das Schema `VELOX` und einen iPhone-Simulator auswählen (zunächst kein echtes iPhone).
- **10–20 min:** Product > Build ausführen. Falls der Build scheitert, die erste rote Fehlermeldung und den gesamten betroffenen Fehlertext sichern.
- **20–30 min:** Nur wenn der Build erfolgreich ist, Product > Run starten und Übersicht, Sensorstatus und Mehr prüfen. Im Simulator ist kein echtes Barometer/GPS des iPhones vorhanden; fehlende Sensorwerte dort sind erwartbar.

Ein Simulator-Build benötigt keine Apple-ID-Anmeldung und keine kostenpflichtige Mitgliedschaft. Für einen späteren Test auf dem echten iPhone XR muss die App signiert werden. Dafür kann eine kostenlose persönliche Apple-ID-Signierung verwendet werden, mit Einschränkungen (unter anderem zeitlich begrenzte Testsignierung). Keine kostenpflichtige Developer-Mitgliedschaft aktivieren. Keine fremde Apple-ID ohne ausdrückliche Zustimmung des Kontoinhabers verwenden und niemals Passwörter weitergeben.

## Muss Xcode auf dem Mac bleiben?

Nein, nicht damit eine bereits installierte VELOX-App auf dem iPhone läuft. Xcode wird auf dem Mac zum Entwickeln, Kompilieren, Signieren und Installieren neuer App-Versionen benötigt. Wenn VELOX auf dem iPhone installiert und getestet ist, kann Xcode vom Mac gelöscht werden, sofern der Besitzer den Speicherplatz zurückhaben möchte. Dann sind spätere Änderungen oder Neuinstallationen erst wieder möglich, wenn Xcode erneut installiert wurde. Die App auf dem iPhone wird durch das Löschen von Xcode auf dem Mac nicht entfernt.

Wichtig: Eine kostenlose persönliche Signierung ist keine dauerhafte Veröffentlichung. Wenn ihre Gültigkeit abläuft, kann eine erneute Signierung/Installation nötig werden. Eine App-Store-Veröffentlichung ist ein separater Schritt und nicht Teil dieses kostenlosen Tests.

## Daten und Sicherheit

- Die bestehende Web-/PWA-Version bleibt bis zu erfolgreichen Xcode-, Datenmigrations- und iPhone-Tests erhalten.
- Der JSON-v1-Codec ist nur ein Grundbaustein und erhält beliebige unbekannte Zusatzfelder noch nicht verlustfrei. Deshalb keinen produktiven Import/Export-Rundlauf durchführen.
- Vorhandene Touren müssen zunächst in der Web-App als JSON gesichert werden. Import erst nach echten Rundlauf- und ID-Kollisionstests freigeben.
- Core Motion wird nur bei gemeldeter Sensorverfügbarkeit verwendet. Relative Höhe ist nicht automatisch die absolute Meereshöhe. Der GPS-Recorder fordert Standort nur nach aktivem Tastendruck und zunächst ausschließlich für Nutzung im Vordergrund an. Hintergrundaufzeichnung ist noch nicht aktiviert.
- Keine kostenpflichtigen APIs, Build-Dienste oder Add-ons.

## Enthaltene Dateien

- `VELOX.xcodeproj/project.pbxproj`: minimales iOS-App-Projekt (iOS 17.0 als vorläufiges Deployment Target).
- `VELOX/App/VELOXApp.swift`, `RootView.swift`: SwiftUI-App-Einstieg und erste native Oberfläche.
- `VELOX/Models/*`: Tour-, GPS- und Barometer-Grundmodelle.
- `VELOX/Services/*`: Barometerdienst, Kalibrierungsbaustein, JSON-v1-Codec, `RideStore.swift` (lokales versioniertes Archiv mit atomarem Schreiben und ID-Kollisionsschutz) und `RideRecorder.swift` (Core Location, Vordergrund-GPS, Core-Motion-Barometerproben, Pause/Fortsetzen/Stoppen) und `RideAnalysis.swift` (GPS-verankerte Barometerfusion, Qualitätsstatus und natives Distanz-Höhenprofil; synthetische CI-Checks 8/8 bestanden, reale Sensorprüfung offen).

## Noch offen

1. App im iOS-Simulator manuell starten und Navigation, Zustände, Layout sowie Fehleranzeigen prüfen.
2. Ein echtes iPhone-Testverfahren ohne kostenpflichtige Developer-Mitgliedschaft klären; vorher keine Signierung oder Installation behaupten.
3. `RideStore` mit reproduzierbaren Tests prüfen (Neuanlage, Duplikate, Update, exaktes Löschen, beschädigte Datei, Persistenz nach Neustart).
4. JSON-v1-Codec mit echten Web-v1-Beispielen prüfen. Unbekannte Felder werden derzeit nicht verlustfrei erhalten; deshalb keinen produktiven Import-/Export-Rundlauf freigeben.
5. Recorder auf einem echten Gerät prüfen: Berechtigungen, GPS-Aussetzer, Pause/Fortsetzen, App-Wechsel, Display-Sperre und Persistenz.
6. Höhenprofil und Steigungsanalyse mit realen Sensorfahrten vergleichen. Erst danach eine native Ablösung der PWA erwägen.

## Höhenfusion — automatisierte Validierung

Der eigenständige CI-Validierungslauf `ios/Tests/RideAnalysisValidation.swift` wird mit `swiftc` kompiliert und auf dem macOS-Runner ausgeführt. Am 16. November 2026 wurden **8/8 Prüfungen bestanden**:

- Leere Tour: Analyse bleibt ohne Höhendaten ausdrücklich nicht verfügbar.
- Stabile Referenzen: mindestens drei zeitnahe GPS-/Barometerpaare erzeugen einen Median-Offset.
- Zu wenige Referenzen: zwei Paare kalibrieren nicht; die Sitzung bleibt relativ.
- Instabile Referenzen: MAD über 10 m verhindert die Kalibrierung; die Streuung bleibt sichtbar.
- GPS-Lücke: Lücken über 30 Sekunden trennen Profilsegmente und werden nicht als Höhenanstieg gezählt.
- Pause/Fortsetzen: zwei unterschiedliche Barometer-Session-IDs werden unabhängig kalibriert und im Profil getrennt gehalten.
- Ausreißer/Rohdatenintegrität: isolierte Höhen-Spikes über 8 m fließen nicht in Auf-/Abstiegssummen ein; GPS- und Barometer-Roharrays bleiben unverändert.
- Ungültige GPS-Koordinaten und nicht in Int64-Millisekunden darstellbare Zeitstempel werden aus der Analyse ausgeschlossen, ohne die Quellpunkte zu verändern.

**Grenze der Tests:** Die Pause-/Fortsetzen-Prüfung setzt getrennte Session-IDs in Testdaten voraus. Sie beweist nicht den vollständigen Core-Motion-/Core-Location-Lebenszyklus auf einem iPhone. Es gibt noch kein XCTest-Target und keine reale Sensor-Testfahrt.

## Kosten

Ziel bleibt 0 €. Xcode und die lokalen Apple-Frameworks sind kostenlos. App-Store-Veröffentlichung und kostenpflichtige Apple-Developer-Mitgliedschaft sind ausdrücklich nicht Teil dieses Plans.
