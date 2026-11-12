# VELOX Native iOS — Mac-Testvorbereitung

Stand: 12. November 2026 · Repository `TroBo2026/velox` · Branch `main`

## Status

Ein erstes eigenständiges Xcode-Projekt ist unter `ios/VELOX.xcodeproj` angelegt. Es ist eine native SwiftUI-App und keine WebView-Hülle. Das Projekt enthält die SwiftUI-Einstiegsoberfläche sowie die vorhandenen Tour-/GPS-/Barometer-Modelle und Dienste.

**Wichtig:** Dieses Projekt wurde hier nicht mit Xcode oder dem Apple iOS SDK kompiliert. Die Projektdatei und SwiftUI-Quellen müssen auf dem Mac erstmals von Xcode geöffnet und validiert werden. Die App ist ein technischer Startpunkt, noch kein vollständiger Touren-Tracker. Es gibt noch keine native GPS-Aufzeichnung, kein Tourenarchiv, keine produktive Datenbank und keine abgeschlossene Datenmigration.

## Auf dem MacBook Air M3

1. Prüfen, dass macOS aktuell genug für die installierte Xcode-Version ist.
2. Xcode kostenlos aus dem Mac App Store installieren: https://apps.apple.com/app/xcode/id497799835
3. Xcode einmal starten und die Lizenz/zusätzlichen Komponenten abschließen. Dafür kann ein Administratorpasswort erforderlich sein.
4. Dieses Repository über GitHub Desktop oder Terminal klonen, oder als ZIP von GitHub laden und entpacken.
5. `ios/VELOX.xcodeproj` öffnen (nicht den Repository-Ordner und nicht die Web-Datei).
6. Oben das Schema `VELOX` und zunächst einen iPhone-Simulator wählen.
7. Unter Signing & Capabilities zunächst automatische Signierung nur konfigurieren, wenn ein echter Gerätetest durchgeführt wird. Ein Simulator-Build benötigt keine Apple-ID-Signierung.
8. Erst `Product > Build` für den Simulator versuchen. Buildfehler vollständig notieren; nicht durch kostenpflichtige Dienste umgehen.

## 30-Minuten-Testablauf

- 0–5 min: Xcode öffnen, Projekt laden, automatische Projektkonvertierung prüfen.
- 5–12 min: Simulator als Ziel wählen und Build starten.
- 12–20 min: Falls der Build gelingt, App starten und Übersicht/Sensorstatus/Mehr durchklicken.
- 20–30 min: Build-/Signing-Fehler dokumentieren. Nur bei genügend Zeit und ausdrücklicher Freigabe den iPhone-Test versuchen.

Ein Gerätetest kann an der kostenlosen persönlichen Signierung, dem Apple-Account, Gerätevertrauen oder Xcode-Provisioning scheitern. Keine kostenpflichtige Developer-Mitgliedschaft aktivieren. Keine fremde Apple-ID ohne ausdrückliche Zustimmung des Kontoinhabers verwenden. Für einen Simulator-Test ist keine Apple-ID nötig.

## Daten und Sicherheit

- Die Web-/PWA-Version bleibt unverändert verfügbar.
- Der vorhandene JSON-v1-Codec ist vorbereitet, aber noch nicht verlustfrei gegenüber beliebigen unbekannten Zusatzfeldern. Deshalb keine produktive Datenmigration und keine Löschung/Überschreibung vornehmen.
- Vorhandene Touren müssen zunächst aus der Web-App als JSON gesichert werden. Der Import wird erst nach echten Rundlauf- und Kollisions-Tests freigegeben.
- Core Motion wird nur bei gemeldeter Sensorverfügbarkeit verwendet. Relative Höhe wird nicht als absolute Meereshöhe ausgegeben.
- Es werden keine kostenpflichtigen APIs, Build-Dienste oder Add-ons verwendet.

## Enthaltene Dateien

- `VELOX.xcodeproj/project.pbxproj`: minimales iOS-App-Projekt (iOS 17.0 als vorläufiges Deployment Target).
- `VELOX/App/VELOXApp.swift`, `RootView.swift`: SwiftUI-App-Einstieg und erste native Oberfläche.
- `VELOX/Models/*`: Tour-, GPS- und Barometer-Grundmodelle.
- `VELOX/Services/*`: Barometerdienst, Kalibrierungsbaustein und JSON-v1-Codec.

## Noch offen

1. Xcode-Projektdatei auf dem Mac validieren und ersten Simulator-Build erstellen.
2. Unbekannte JSON-Felder verlustfrei erhalten; vorher keinen produktiven Import/Export-Rundlauf erlauben.
3. JSON-Codec mit XCTest gegen echte Web-v1-Beispiele testen, insbesondere ID-Kollisionen.
4. Native Tourenspeicherung, Core Location Recorder, Pause/Fortsetzen/Stoppen implementieren.
5. Höhenfusion, Sensorsegmentierung und Filterung mit reproduzierbaren Tests absichern.
6. Erst danach iPhone XR testen. Keine Veröffentlichung oder native Ablösung vor bestandenem Gerätetest.

## Kosten

Ziel bleibt 0 €. Xcode und die lokalen Apple-Frameworks sind kostenlos. App-Store-Veröffentlichung und kostenpflichtige Apple-Developer-Mitgliedschaft sind ausdrücklich nicht Teil dieses Plans.
