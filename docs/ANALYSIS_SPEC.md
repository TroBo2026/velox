# VELOX ANALYZE – Rechenvertrag

Stand: Phase 2, Grundlage für Web/PWA und native iOS-Auswertung.

## Zweck

Die Analyse muss dieselbe Fahrt nachvollziehbar beschreiben, ohne Rohdaten zu verändern oder Messwerte zu erfinden. Die Regeln gelten fachlich für alle Plattformen. Plattformen dürfen intern unterschiedliche Implementierungen verwenden, müssen aber dieselben Bedeutungen der Kennzahlen und dieselben Sicherheitsinvarianten einhalten.

## 1. Eingabedaten

- GPS-Punkte und Sensorbeobachtungen sind Quelldaten. Analysefunktionen lesen sie nur.
- Zeitstempel müssen endlich, positiv und chronologisch verwertbar sein.
- Ungültige Koordinaten, unplausible Sprünge, ungeeignete Genauigkeit und zu große Zeitlücken dürfen keine Strecke erzeugen.
- Fehlende Höhenwerte bleiben fehlend. Höhenprofile dürfen keine künstliche Verbindung über fehlende oder unbrauchbare Höhenwerte zeichnen.
- Abgeleitete Werte müssen von Rohmessungen unterscheidbar bleiben.

## 2. Intervallmodell

Jedes aufeinanderfolgende GPS-Paar wird genau einer fachlichen Kategorie zugeordnet:

| Kategorie | Bedeutung | Strecke | Bewegungszeit |
|---|---|---:|---:|
| Bewegung | plausibles Fahrintervall | zählt | zählt |
| Stillstand | gültiges Intervall ohne verwertbare Bewegung | zählt nicht | zählt nicht |
| Datenlücke | ungültige Messung, Zeitlücke, Sprung oder verworfener Abschnitt | zählt nicht | zählt nicht |

Eine manuelle Pause ist eine eigene Unterbrechung und darf nicht als Fahrintervall gewertet werden. Kurze technische MTB-Passagen bleiben erhalten, sofern die Messdaten plausibel sind. Filter dürfen nicht allein wegen niedriger Geschwindigkeit aggressiv Punkte verwerfen.

## 3. Kennzahlen und Bedeutungen

- **Distanz:** Summe ausschließlich akzeptierter Bewegungsintervalle.
- **Bewegungszeit:** Summe der Zeit akzeptierter Bewegungsintervalle.
- **Stand- und Lückenzeit:** verstrichene Aktivitätszeit abzüglich Bewegungszeit. Sie ist ausdrücklich nicht gleichbedeutend mit reiner Standzeit.
- **Erkannte GPS-Standzeit:** Summe gültiger Stillstandsintervalle. Datenlücken gehören nicht dazu.
- **Durchschnitt während Bewegung:** Distanz geteilt durch Bewegungszeit.
- **Gesamtdurchschnitt:** Distanz geteilt durch verstrichene Aktivitätszeit.
- **Tempozonen:** Ihre Zeitanteile müssen zusammen der Bewegungszeit entsprechen (bis auf Rundungsabweichungen).
- **Höhenmeter:** gefilterte, segmentbewusste Näherung. Keine Verbindung über Datenlücken, Pausen oder unbrauchbare Höhenwerte.
- **Steigung:** nur aus ausreichend langen, zusammenhängenden Profilabschnitten berechnen.
- **Strecken-Geradlinigkeit:** nur ausweisen, wenn eine zusammenhängende Route ohne relevante interne GPS-Lücke vorliegt.

## 4. Datenqualität und Transparenz

- Fehlende Genauigkeitsangaben dürfen nicht als gute Qualität ausgegeben werden.
- Eine verworfene Messung darf die Rohdaten nicht löschen oder überschreiben.
- Datenlücken, verworfene Punkte und Höhen-Ausreißer sollen in Diagnoseansichten nachvollziehbar sein.
- Nicht verfügbare Sensorwerte werden als nicht verfügbar dargestellt, nicht durch Schätzungen ersetzt.
- Kennzahlen mit unzureichender Datenbasis müssen als eingeschränkt oder nicht verfügbar gekennzeichnet werden.

## 5. MTB-Anforderungen

Die Analyse muss typische MTB-Bewegungen berücksichtigen: langsames technisches Klettern, kurze Balance- und Rollpassagen, häufige Richtungswechsel, kurze Stopps und schnelle Abfahrten. Ein einzelner fixer Distanz- oder Geschwindigkeitsfilter darf diese Abschnitte nicht pauschal entfernen. Unplausible GPS-Teleports und echte Messlücken müssen weiterhin ausgeschlossen werden.

## 6. Regressionen vor Änderungen

Jede Änderung am Analyse-Rechenkern muss mindestens prüfen:

1. Distanz und Bewegungszeit entstehen nur aus Bewegungsintervallen.
2. Stillstands- und Lückenzeit bleiben fachlich unterscheidbar.
3. Tempozonen summieren sich auf die Bewegungszeit.
4. GPS-Lücken werden nicht überbrückt.
5. Rohdaten bleiben byte-/wertseitig unverändert.
6. Langsame MTB-Bewegung und schnelle plausible Abfahrten bleiben erhalten.
7. Fehlende Höhenwerte teilen das Höhenprofil in getrennte Segmente.

## 7. Plattformstrategie

Der Web-Rechenkern (ride-core.js und elevation-core.js) und die native Swift-Auswertung (RideAnalysis.swift) sind derzeit getrennte Implementierungen. Diese Spezifikation definiert zunächst die gemeinsame fachliche Bedeutung. Eine vollständige numerische Gleichheit wird erst nach Aufbau gemeinsamer, plattformübergreifender Testfahrten und einer gezielten Paritätsprüfung zugesichert.
