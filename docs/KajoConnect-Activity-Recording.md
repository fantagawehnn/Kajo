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

- Übersicht: individuelles KAJO-Dashboard mit Trainingsname/-art und geplanter Dauer (falls für heute synchronisiert), groß dargestellter aktueller Herzfrequenz, Zeit und Distanz; Geschwindigkeit wird kleiner ergänzt. Ein äußerer, fünfteiliger Ring zeigt die HF-Zonen farblich und hebt die aktuelle Zone hervor.
- Geschwindigkeit: aktuell, Durchschnitt und Maximum
- Herzfrequenz: aktuell, Durchschnitt, Maximum und Herzfrequenzzone
- Distanz & Zeit: Distanz, Zeit und Kalorien
- Weitere Daten: Kadenz, Leistung, Höhe, Training Effect, GPS-Status/-Qualität sowie Auf-/Abstieg

Die Auswahl wird über `Toybox.Application.Storage` dauerhaft gespeichert. Mindestens eine Standardseite bleibt aktiv. Die Reihenfolge der fünf Standardseiten ist festgelegt. Zusätzlich können bis zu drei eigene Datenseiten konfiguriert werden. Jede eigene Seite kann bis zu vier Kennzahlen enthalten; insgesamt stehen 17 Kennzahlen zur Auswahl, darunter die aktuelle Herzfrequenzzone. Die drei Layouts werden unabhängig voneinander gespeichert. Im Editor wechselt ein Tippen links bzw. rechts in der Layout-Kopfzeile zwischen den eigenen Datenseiten; vertikales Wischen blättert weiterhin durch die Kennzahlenliste. Links am Eintrag wird ein Feld aktiviert/deaktiviert, rechts wird es für die Sortierung ausgewählt; „HOCH“ und „RUNTER“ ändern die Reihenfolge, „GROSS“ hebt das ausgewählte Feld hervor. Jede eigene Datenseite besitzt ihre eigene Sortierung und individuelle Größenstufen pro Kennzahl: klein, mittel oder groß. Im Editor wird die Größe des rechts ausgewählten Feldes über die mittlere Schaltfläche „GROESSE“ zyklisch geändert; die Kennzahlzeile zeigt K, M oder G. Die Größe wird unabhängig für jede Kennzahl und jede Datenseite gespeichert. Die Größenstufe verändert die Schriftgröße des Werts; die Positionen der Felder folgen weiterhin dem automatisch gewählten Raster (ein Feld zentriert, zwei nebeneinander, drei oder vier im Raster). Bestehende Einstellungen der bisherigen einzelnen eigenen Datenseite werden als erste eigene Datenseite weiterverwendet; ein bisheriges großes Feld wird als Größenstufe „groß“ übernommen.

**Noch nicht umgesetzt:** Mehr als vier Kennzahlen gleichzeitig auf einer eigenen Seite anzeigen, die Feldpositionen frei auf der Uhr anordnen und die Konfiguration direkt in der KAJO-Web-App statt auf der Uhr bearbeiten.

## 4. Trainingsplan-Synchronisierung

Nach dem Öffnen der Startansicht ruft die Uhr über den gekoppelten Geräte-Endpunkt geplante Einheiten aus `public.user_data.data.planned` ab. Das ist dieselbe Datenquelle, die der bestehende KAJO-Cloud-Snapshot verwendet; die separate Tabelle `planned_sessions` wird nicht als neue führende Quelle eingeführt.

Übertragen werden die vorhandenen Felder:
- `id`, `date`, `name`, `type`
- `duration`, `targetTss`, `category`, `desc`

Die Uhr lädt Einheiten von gestern bis 14 Tage in die Zukunft, maximal 30 Einträge. Beschreibungen und Textfelder werden für die begrenzte Watch-Speichergröße gekürzt. Der Menüpunkt „Trainingsübersicht“ öffnet eine paginierte Liste des lokal synchronisierten Plans. Ein Eintrag öffnet die Detailansicht mit Name, Datum, Trainingsart, Dauer, Ziel-Load, Kategorie und – sofern vorhanden – Beschreibung. Ruhetage werden gesondert dargestellt.

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

- Die KAJO-Web-App enthält einen Editor für drei eigene Datenseiten mit jeweils bis zu vier Kennzahlen, Reihenfolge, individueller Größenstufe und Position in einem begrenzten Raster (oben links/rechts, unten links/rechts oder unten mittig). Die Einstellungen werden im benutzerspezifischen `settings.kajoConnectDisplayLayouts` gespeichert und durch die bestehende Cloud-Synchronisierung übertragen.
- Die Edge Function `kajo-connect` validiert die Layouts und gibt sie über die bestehende `sync`-Antwort zurück. Die Startansicht der Uhr übernimmt die drei Layouts nach erfolgreicher Synchronisierung in den lokalen Garmin-Speicher; die Aktivitätsansicht liest diese Einstellungen beim Öffnen ein.
- Diese Übertragung ist im Quellcode vorbereitet, aber noch nicht mit einem Garmin-Build, einer bereitgestellten Edge Function oder einem echten Gerät getestet.
- Pixelgenaue freie Feldpositionen und mehr als vier Kennzahlen pro Seite sind weiterhin nicht umgesetzt. Die Positionierung ist bewusst auf fünf kollisionsfreie Rasterplätze begrenzt.
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


## 8. Gestaltung der Aktivitätsübersicht

Die erste Aktivitätsseite verwendet ein eigenständiges KAJO-Dashboard statt des klassischen Garmin-Datenfeldrasters. Der Trainingsname und die Trainingsart der für den aktuellen lokalen Tag synchronisierten Einheit stehen oben. Herzfrequenz, Zeit und Distanz erhalten die größte visuelle Priorität; Geschwindigkeit wird bewusst kleiner dargestellt. Der äußere Ring zeigt fünf farblich unterschiedene Herzfrequenzzonen und hebt die aktuell ermittelte Zone hervor. KAJO-Logo und Bootsklasse werden in dieser Trainingsansicht nicht als Überschrift angezeigt.

Die Trainingsübersicht greift auf den lokal gespeicherten Plan unter `kajoPlannedSessions` zurück. Angezeigt werden nur die vorhandenen Felder Name, Trainingsart und geplante Dauer. Eine Intervall-/Schrittfolge wird weiterhin nicht angezeigt, da diese strukturierte Information derzeit nicht Bestandteil des übertragenen Datensatzes ist.
