# VELOX 0.9.10 — Höhenprofil und Tourenanalyse

## Höhenprofil und Berechnung
- Höhenprofil-Distanz nutzt jetzt dieselben plausiblen Bewegungsintervalle wie die offizielle Tourdistanz. Langsame GPS-Drift erhöht weder Streckenlänge noch Höhenprofil-Achse.
- Stationäre GPS-Höhenpunkte werden nicht mehr als zusätzliche Profilbewegung ausgewertet.
- Die Höhenmeter-Summen werden bei langen Beobachtungslücken zurückgesetzt, statt ungemessene Zeiträume zu verbinden.
- Die Ausreißerprüfung begrenzt die Toleranz auch bei schlechten Genauigkeitsangaben.
- Netto-Höhenänderung wird bei mehreren getrennten Profilsegmenten nicht mehr über eine GPS-Lücke hinweg berechnet.
- Steigungswerte verwenden dieselbe maximale Intervalllänge wie die Bewegungsanalyse.

## Grafik und Darstellung
- Fehlerhafte Zeitfeld-Zuordnung der Geschwindigkeitsfarben im Höhenprofil korrigiert.
- Nicht zuverlässig auswertbare Tempoabschnitte werden neutral dargestellt.
- Höchster und tiefster Profilpunkt werden markiert.
- Datenqualität, verworfene Höhen-Ausreißer und gemeldete vertikale Genauigkeit werden in der Tourgrafik sichtbar.

## Pro-Tourenanalyse
- Höhenprofil erhält beim Wiederanfahren nach einem Stopp einen korrekten neuen Höhen-Ausgangspunkt.
- Steigungsanalyse verbindet keine Abschnitte über längere Zeitlücken.
- Splits, Tempo-Zonen und Bewegungszeit bleiben auf den gefilterten Bewegungsintervallen aufgebaut.

## Native iOS-Analyse
- GPS-Koordinaten, Zeitstempel und unrealistische Geschwindigkeiten werden strenger geprüft.
- GPS-Lücken, doppelte Zeitstempel und Barometer-Datenlücken trennen das Höhenprofil.
- GPS-Offsets nicht kalibrierter Barometersitzungen bleiben sichtbar diagnostizierbar, werden aber nicht auf das Profil angewendet.
- Native Streckenlänge ignoriert langsame GPS-Drift.
- Das native Profil erhält einen segment- und zeitbewussten Medianfilter; Roh-Barometerproben bleiben unverändert.
- Der native Kompatibilitäts-Höhensummenwert verbindet weder Barometersitzungen noch lange Sensorlücken.
- Der Kalibrierungsbaustein weist Basismessungen aus anderen Sessions, zeitlich frühere Proben und unplausible Druck-/Höhenwerte zurück.
- Core-Motion-Zeitstempel werden vor der Millisekunden-Konvertierung geprüft; die Probenreihenfolge wird pro Sensor-Session validiert.
- GPS-/Barometer-Zeitzuordnung nutzt binäre Suche statt vollständiger Streckenscans und bleibt auch an exakten Segmentgrenzen korrekt.
- Abgelehnte Kalibrierungsabweichungen werden auch ohne angewendeten Offset in der nativen Oberfläche angezeigt.
- Der Recorder kann nach einem GPS-Sprung oder einer längeren Unterbrechung mit einem neuen Positionsanker weiterarbeiten.

## Qualitätssicherung
- Node.js-Regressionstests für Ausreißer, Segmentgrenzen, schrittweisen Aufstieg, Zeitlücken und Offline-Modulreihenfolge ergänzt (7/7 bestanden).
- Native Swift-Validierungen decken stabile/instabile Kalibrierung, unzureichende Referenzen, GPS-Lücken, Barometer-Lücken, fehlende Route, unrealistische Geschwindigkeit, langsame GPS-Drift, Sensor-Sessions, Kalibrierung und Rohdatenintegrität ab (16/16 bestanden).
- Xcode-Simulator-Build erfolgreich; Web- und iOS-Prüfungen laufen getrennt in GitHub Actions.

## Messgrenzen
Die Web-/PWA-Version verwendet weiterhin GPS-Höhenwerte und keinen direkten Zugriff auf das iPhone-Barometer. Die native Barometerfusion ist eine eigenständige iOS-Messkette und benötigt weiterhin einen realen iPhone-Test mit echten Tourdaten. Automatisierte Tests ersetzen keine Feldmessung oder vermessene Höhenreferenz.
