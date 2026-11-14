# VELOX Native iOS — Mac-Testvorbereitung

Stand: 13. November 2026 · Repository `TroBo2026/velox` · Branch `main`

## Status vor dem ersten Xcode-Lauf

Ein erstes eigenständiges Xcode-Projekt unter `ios/VELOX.xcodeproj` ist angelegt. Es ist eine native SwiftUI-App und keine WebView-Hülle. Enthalten sind die erste native Oberfläche, Datenmodelle, ein Core-Motion-Barometerdienst und ein JSON-v1-Grundcodec.

**Noch nicht mit Xcode oder dem Apple iOS SDK kompiliert:** Die Projektdatei und Swift-Quellen müssen auf einem Mac erstmals von Xcode validiert werden. Die App ist ausdrücklich nur ein technischer Startpunkt und noch kein vollständiger Touren-Tracker. Eine erste native GPS-Aufzeichnung im Vordergrund, ein lokales JSON-Tourenarchiv und die zeitgestempelte Speicherung echter Core-Motion-Barometerproben während einer Tour sind implementiert. Eine native Höhenprofil-Pipeline ist ergänzt: zeitlich nahe GPS-Höhenmessungen mit vertikaler Genauigkeit bis 15 m werden je GPS-Fix mit Barometerproben gepaart. Ab drei unterschiedlichen Referenzfixes und einer medianen absoluten Abweichung von höchstens 10 m wird ein robuster Median-Offset gebildet. Der Barometerverlauf liefert die Profilform; GPS verankert die Höhe. Jede Core-Motion-Sitzung wird separat kalibriert; beim Pausieren wird der Barometer gestoppt und beim Fortsetzen neu gestartet, damit relative Höhen-Nullpunkte nicht vermischt werden. Ohne ausreichende Referenzen wird das jeweilige Segment ausdrücklich als session-relativ markiert. Wenn keine Barometerdaten vorliegen, ist ein getrennt gekennzeichneter GPS-only-Fallback vorgesehen. Distanzwerte werden zeitlich zwischen GPS-Fixes interpoliert; Lücken über 30 Sekunden oder unplausible GPS-Sprünge werden nicht überbrückt. Profilsegmente und Auf-/Abstiegssummen werden an solchen Lücken getrennt. Auf-/Abstieg ignoriert Änderungen unter 1 m und isolierte Sprünge über 8 m. Sämtliche GPS- und Barometer-Rohmessungen bleiben unverändert im Tourmodell. Diese Analyse ist noch nicht mit Xcode kompiliert, mit Testdatensätzen automatisiert validiert oder auf einem iPhone geprüft und daher nicht für echte Touren freigegeben. Hintergrundaufzeichnung und Datenmigration fehlen. Die Web-/PWA-Version bleibt die nutzbare VELOX-Version.

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

## 30-Minuten-Testablauf

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
- `VELOX/Services/*`: Barometerdienst, Kalibrierungsbaustein, JSON-v1-Codec, `RideStore.swift` (lokales versioniertes Archiv mit atomarem Schreiben und ID-Kollisionsschutz) und `RideRecorder.swift` (Core Location, Vordergrund-GPS, Core-Motion-Barometerproben, Pause/Fortsetzen/Stoppen) und `RideAnalysis.swift` (GPS-verankerte Barometerfusion, Qualitätsstatus und natives Distanz-Höhenprofil; noch nicht validiert).

## Noch offen

1. Projektdatei auf dem Mac mit Xcode validieren und ersten Simulator-Build erstellen.
2. Unbekannte JSON-Felder verlustfrei erhalten; vorher keinen produktiven Import/Export-Rundlauf erlauben.
3. JSON-Codec mit XCTest gegen echte Web-v1-Beispiele testen, insbesondere ID-Kollisionen.
4. `RideStore` mit XCTest prüfen (Neuanlage, Duplikate, Update, Löschen, beschädigte Datei, Persistenz nach Neustart).
5. GPS-Recorder auf echten Geräten prüfen: Berechtigungen, GPS-Aussetzer, Pause/Fortsetzen, App-Wechsel, Sperrbildschirm und Persistenz.
6. Barometerproben während einer Tour zeitlich korrekt speichern und anschließend Höhen-/Steigungsfusion testen.
7. Höhenfusion, Sensorsegmentierung und Filterung mit reproduzierbaren Tests absichern.
8. Erst danach iPhone XR testen. Keine Veröffentlichung oder native Ablösung vor bestandenem Gerätetest.

## Höhenfusion — geplante Abnahmetests

Vor Freigabe der Höhenanalyse müssen mindestens diese reproduzierbaren Fälle bestanden werden:

- **Konstanter GPS-Offset:** Drei oder mehr zeitlich passende, unterschiedliche GPS-Fixes mit stabiler Abweichung kalibrieren den jeweiligen Barometer-Session-Offset über den Median.
- **Zu wenige Referenzen:** Ein oder zwei passende GPS-Fixes ergeben ausdrücklich nur relative Barometerhöhe.
- **Instabile Referenzen:** Eine mediane absolute Abweichung über 10 m verhindert die GPS-Kalibrierung.
- **Pause/Fortsetzen:** Jede neue Barometersitzung wird getrennt kalibriert; Profilkurve und Auf-/Abstieg dürfen nicht über den Sessionwechsel verbunden werden.
- **GPS-Lücken und Sprünge:** Lücken über 30 Sekunden oder Segmente über 120 m werden nicht interpoliert; Summen werden segmentweise berechnet.
- **Rohdatenintegrität:** Anzahl, Zeitstempel, Druck, relative Höhe, GPS-Koordinaten und originale Höhenwerte müssen vor und nach der Analyse identisch sein.

Diese Fälle sind Prüfkriterien, keine bereits ausgeführten XCTest- oder Gerätetests.

## Kosten

Ziel bleibt 0 €. Xcode und die lokalen Apple-Frameworks sind kostenlos. App-Store-Veröffentlichung und kostenpflichtige Apple-Developer-Mitgliedschaft sind ausdrücklich nicht Teil dieses Plans.
