# KAJO Connect – Aktivitätsaufzeichnung und Trainingsdaten

**Stand:** Quellcode im Branch `feature/kajo-connect` vorbereitet. Garmin-Build, Backend-Deployment und Gerätetest stehen noch aus.  
**Zielgeräte:** Garmin Venu 3S und Venu 2 Plus.

## 1. Aktivitätsaufzeichnung

Die Uhr startet eine FIT-Aufzeichnung über `Toybox.ActivityRecording.Session`. Die FIT-Session wird mit `Activity.SPORT_KAYAKING` und `Activity.SUB_SPORT_WHITEWATER` angelegt. Die Bootsklasse wird im Session-Profilnamen als `KAJO K1`, `KAJO C1` oder `KAJO C2` mitgeführt.

Garmin führt Kayaking und Whitewater als eigene Sport-/Subsportwerte. Die sichtbare Aktivitätsüberschrift in Garmin Connect kann dennoch von dessen Aktivitätsbenennung abhängen und muss mit einer echten Synchronisierung geprüft werden.

Die Session wird lokal als Garmin-FIT-Aktivität gespeichert. Das ist kein direkter Upload einer FIT-Datei an die KAJO-API. Garmin weist darauf hin, dass FIT-Aufzeichnungen von Connect-IQ-Apps mit Garmin Connect synchronisiert werden können; der tatsächliche Import in das bestehende KAJO-Konto muss mit einem realen Testdatensatz geprüft werden.

## 2. Bedienung

- Obere physische Taste (`KEY_ENTER` bzw. `KEY_START`): startet die Aufzeichnung oder beendet und speichert sie.
- Untere physische Taste (`KEY_ESC`): setzt während der Aufzeichnung eine FIT-Rundenmarkierung; außerhalb einer Aufzeichnung bleibt die Zurück-Funktion erhalten.
- Touch-Schaltflächen bleiben als zusätzliche Bedienmöglichkeit verfügbar.
- Datenseiten können während der Aufzeichnung vertikal nach oben/unten gewechselt werden.
- Die Bootsklasse wird vor dem Start im Startmenü ausgewählt und nicht als Überschrift in der Aktivitätsansicht angezeigt.

Die genaue Tastenbelegung muss noch auf beiden Zielgeräten validiert werden.

## 3. Aktivitätsseiten

Über „Anzeigen anpassen“ lassen sich die fünf vorhandenen Datenseiten aktivieren oder deaktivieren:

- Übersicht: Geschwindigkeit, aktuelle Herzfrequenz, Zeit und Herzfrequenzzone
- Geschwindigkeit: aktuell, Durchschnitt und Maximum
- Herzfrequenz: aktuell, Durchschnitt, Maximum und Herzfrequenzzone
- Distanz & Zeit: Distanz, Zeit und Kalorien
- Weitere Daten: Kadenz, Leistung, Höhe, Training Effect, GPS-Status/-Qualität sowie Auf-/Abstieg

Die Auswahl wird über `Toybox.Application.Storage` dauerhaft gespeichert. Mindestens eine Seite bleibt aktiv. Die Reihenfolge der fünf Standardseiten ist festgelegt. Zusätzlich kann eine eigene Datenseite mit bis zu vier Kennzahlen aktiviert werden. Dafür stehen 17 Kennzahlen zur Auswahl, darunter die aktuelle Herzfrequenzzone. Aktivierte Felder lassen sich innerhalb der Auswahl nach oben oder unten sortieren. Ein ausgewähltes Feld kann als großes Feld hervorgehoben werden; die übrigen Felder werden abhängig von der Anzahl im verfügbaren Raster angeordnet. Ohne manuelle Größenwahl passt sich die Darstellung automatisch an (ein Feld groß, zwei nebeneinander, drei oder vier im Raster).

**Noch nicht umgesetzt:** Kennzahlen frei auf mehrere selbst angelegte Seiten verteilen, mehr als vier Kennzahlen gleichzeitig anzeigen und für mehrere Felder unabhängig voneinander unterschiedliche Größen festlegen. Derzeit kann ein Feld als groß hervorgehoben werden.

## 4. Trainingsplan-Synchronisierung

Nach dem Öffnen der Startansicht ruft die Uhr über den gekoppelten Geräte-Endpunkt geplante Einheiten aus `public.user_data.data.planned` ab. Das ist dieselbe Datenquelle, die der bestehende KAJO-Cloud-Snapshot verwendet; die separate Tabelle `planned_sessions` wird nicht als neue führende Quelle eingeführt.

Übertragen werden die vorhandenen Felder:
- `id`, `date`, `name`, `type`
- `duration`, `targetTss`, `category`, `desc`

Die Uhr lädt Einheiten von gestern bis 14 Tage in die Zukunft, maximal 30 Einträge. Beschreibungen und Textfelder werden für die begrenzte Watch-Speichergröße gekürzt. Die Trainingsübersicht zeigt Name, Datum, Trainingsart, Dauer, Ziel-Load, Kategorie und – sofern vorhanden – Beschreibung. Ruhetage werden gesondert dargestellt.

Der zuletzt synchronisierte Trainingsplan wird lokal gespeichert und bleibt bei fehlender Verbindung als Offline-Ansicht verfügbar. Die Synchronisierung ist im Branch vorbereitet, aber noch nicht end-to-end getestet.

Eine strukturierte Intervall-/Schrittfolge wird nicht übertragen, solange sie nicht in tatsächlich gespeicherten Planobjekten belegt ist.

## 5. Herzfrequenzzonen

KAJO berechnet die Zonen; die Uhr übernimmt die vier oberen Zonengrenzen für Z1 bis Z4. Die Uhr ordnet die aktuelle Garmin-Herzfrequenz Z1 bis Z5 zu und zeigt die Zone mit einem fünfteiligen Balken auf der Übersichts- und Herzfrequenzseite.

Die Berechnung folgt der bestehenden KAJO-Logik in `js/training-load.js`:
- adaptive Ruhe-HF als Median gültiger Garmin-Ruhe-HF-Tageswerte im konfigurierten Rückblick;
- wenn mindestens 60 % der Tage (mindestens drei Messwerte) nicht vorliegen, wird eine gültige Profil-Ruhe-HF als gekennzeichneter Fallback verwendet;
- Karvonen-Grenzen bei 60/70/80/90 % der Herzfrequenzreserve.

Die Uhr berechnet keine eigene HFmax, Ruhe-HF oder abweichende Zonen. Die aktuellen Grenzwerte werden lokal mit Datum gespeichert; veraltete Tageswerte werden nicht als aktuelle Zonen übernommen. Ohne gültige Grenzen erscheint „ZONE --“.

## 6. Noch offen

- Erweiterung des Layout-Editors: mehrere eigene Seiten, mehr als vier Felder und unabhängige Größensteuerung für jedes Feld.
- Backend-Tabellen, Edge-Function-Deployment und erforderliche Secrets.
- End-to-end-Test von Pairing, Trainingsplan-Synchronisierung und Herzfrequenzzonen.
- Prüfung der FIT-Aktivität in Garmin Connect und des anschließenden Imports über die vorhandene KAJO-Garmin-Verbindung.
- Prüfung der physischen Tasten, GPS-Aufzeichnung, Datenseiten und Offline-Cache auf Venu 3S und Venu 2 Plus.
- Ein direkter FIT-Upload an KAJO und eine Upload-Queue sind nicht implementiert.

## 7. Build- und Gerätetest – erst nach Abschluss der Implementierung

1. Branch `feature/kajo-connect` lokal aktualisieren.
2. Garmin-Build für `venu3s` und `venu2plus` ausführen.
3. Pairing mit einem Testkonto und einer bereitgestellten Backend-Umgebung durchführen.
4. Trainingsplan online synchronisieren, anschließend Verbindung trennen und Offline-Anzeige prüfen.
5. Zonenwerte mit den in KAJO angezeigten Grenzen vergleichen.
6. FIT-Aktivität aufzeichnen, speichern und in Garmin Connect sowie anschließend in KAJO prüfen.

Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. Anzeige, Persistenz, Tasten, FIT-Datei und Synchronisierung müssen zusätzlich im Simulator und auf den echten Geräten geprüft werden.
