# Changelog

## 0.10.0 – Berechnung, Grafiken und Zuverlässigkeit

Alle Änderungen sind automatisch getestet (`node tests/core.test.js`, `node tests/app.smoke.test.js`). Auf einem echten iPhone ist 0.10.0 **noch nicht** getestet.

### Behobene Fehler
- **Tour starten konnte scheitern:** `startRide()` setzte die nicht deklarierte Variable `liveLine`. Im Strict Mode wirft das einen Fehler *vor* dem Start der GPS-Aufzeichnung.
- **Steigungsanalyse lieferte kaum Werte:** Punktpaare unter 8 m Abstand wurden verworfen. Bei 1 Hz GPS ist das unter etwa 29 km/h fast jedes Paar. Ø/Max-Steigung, Gelände-Verteilung und „Längster Anstieg“ beruhten nur auf den schnellsten Abschnitten. Steigung wird jetzt über mindestens 50 m Strecke aus dem gleichmäßig abgetasteten Profil berechnet (gleiche Logik im Tourdetail, in Wrapped und in der Pro-Analyse).
- **Höhenprofil brach bei jedem Stopp ab:** Intervalle unter 0,8 m starteten ein neues Höhensegment (Lücken in der Grafik, Neustart der Höhenmeter-Zählung). Stopps unterbrechen das Profil nicht mehr; nur echte GPS-Lücken tun das.
- **Tourdetail und Pro-Analyse rechneten verschieden** (unterschiedliche Segmentierung). Beide nutzen jetzt denselben Kern (`ride-core.js`) und liefern identische Zahlen.
- **Tempo-Einfärbung im Höhenprofil war immer einfarbig:** Die Grafik las `.t`, die Profilpunkte heißen `.time`, dadurch war jedes Tempo `NaN`.
- **„Strecken-Geradlinigkeit“ und „Luftlinie“ waren fast immer „–“:** Schon ein einziger Stopp galt als Unterbrechung.
- **Höhenmeter-Zählung (Hysterese)** unterschätzte bei jeder Richtungsumkehr um bis zu eine Schwelle. Ersetzt durch einen Zickzack-Filter. Die Höhenglättung läuft über die Strecke (±50 m) statt über 5 Sekunden und wird danach leicht nachgeglättet.
- **Höhengenauigkeit über 100 m oder −1** galt in `sensor-core.js` als „unbekannt“ und wurde akzeptiert. Jetzt bleibt der Wert erhalten und wird vom Filter verworfen.
- **Stopp-Erkennung und Fahrzeit waren uneinheitlich** (Intervalle zwischen 0,4 und 0,8 m zählten weder als Fahrt noch als Stopp). Jedes Intervall ist jetzt genau „Fahrt“, „Stillstand“ oder „Lücke“.
- **Wetter für heutige Fahrten:** Das Open-Meteo-Archiv hat für aktuelle Tage keine Daten, deshalb endete fast jeder Abruf im manuellen Dialog. Jetzt Forecast-API mit `past_days`, Archiv nur für ältere Fahrten.
- **Dokumentation korrigiert:** Die Info-Texte versprachen eine nachträgliche Wetterabfrage nach Offline-Fahrten. Das war nie umgesetzt.

### Verbesserungen
- **Neue interaktive Grafiken** (`charts.js`): Antippen/Ziehen zeigt Distanz, Höhe, Steigung, Tempo. Die Position wird auf der Tourkarte mitgeführt. Pfeiltasten werden unterstützt. Höhenprofil nach Steigung eingefärbt, längster Anstieg markiert, höchster/tiefster Punkt beschriftet, runde Achsenwerte.
- **Performance bei langen Touren:** Speichern gebündelt (alle 5 Punkte bzw. 5 s statt bei jedem Fix), Live-Kennzahlen höchstens alle 2,5 s neu berechnet, Berechnungen pro Tour zwischengespeichert.
- **Display bleibt an** während der Aufzeichnung (Screen Wake Lock, iOS 16.4+).
- **GPS-Geschwindigkeit (Doppler)** wird mit aufgezeichnet und für Live-Tempo und Stillstandserkennung genutzt (GPS-Rauschen an der Ampel erzeugt keine Strecke mehr). Mit Schutz, falls ein Gerät unbrauchbare Werte liefert.
- **Datensicherheit:** Anfrage auf dauerhaften Speicher (`storage.persist`), Sicherungs-Erinnerung nach 14 Tagen, Bestätigungsdialoge für „Tour beenden“, „Löschen“, „Alle löschen“.
- **Eigene Dialoge** statt `prompt()`/`confirm()`/`alert()`; Touren lassen sich umbenennen.
- **Live-Karte** mit „Folgen“-Schalter (Karte lässt sich während der Fahrt verschieben).
- **Splits** zählen über die gesamte gültige Strecke statt je GPS-Abschnitt neu.
- **Service Worker:** Netzwerk zuerst mit 4-s-Limit, sonst Cache. Nach Updates läuft nie eine Mischung aus alter und neuer Version.
- **PNG-Icons** für iOS (`apple-touch-icon`) und Manifest.
- „VAM“ heißt jetzt ehrlich „Höhengewinn je Fahrstunde“ (klassisches VAM zählt nur Anstiege).
- CI-Workflow für Syntax, Rechenkern und App-Rauchtest.

### Bekannte Grenzen (ehrlich)
- Nicht auf einem echten iPhone getestet; Wake Lock, Doppler-Geschwindigkeit und Speicherschutz hängen vom iOS-Verhalten ab.
- „Max. GPS-Tempo“ ist weiterhin der größte ungeglättete 1-Hz-Einzelwert und kann durch GPS-Rauschen zu hoch ausfallen (die Grafik zeigt die geglättete Spitze).
- Leaflet wird von unpkg.com geladen (auf 1.9.4 festgelegt, ohne Integritätsprüfung). Für volle Offline-Karten und Supply-Chain-Sicherheit besser ins Repo legen.
- Höhenwerte bleiben GPS-Näherungen. Ohne Barometer sind ±5–10 % Abweichung bei den Höhenmetern normal.
- Bestehende Touren werden **neu berechnet**; ihre Kennzahlen ändern sich dadurch (Steigungen, Aufstieg/Abstieg, Stopps). Die gespeicherten GPS-Rohdaten bleiben unverändert.
