# KAJO Connect – Aktivitätsaufzeichnung und Trainingsdaten

**Stand:** Quellcode und statische Regressionstests im Branch `feature/kajo-connect` vorhanden. Ein echter Venu-3S-Build mit Garmin-SDK und privatem Developer-Key sowie Gerätetests stehen noch aus.  
**Aktuelles Entwicklungsziel:** Garmin Venu 3S (390 × 390 px, Connect IQ API 5.2). Venu 2 Plus ist vorerst nicht Teil des Build-Ziels.

## 1. Aktivitätsaufzeichnung

Die Uhr startet eine FIT-Aufzeichnung über `Toybox.ActivityRecording.Session`. Die FIT-Session wird mit `Activity.SPORT_KAYAKING` und `Activity.SUB_SPORT_WHITEWATER` angelegt. Die Bootsklasse wird im Session-Profilnamen als `KAJO K1`, `KAJO C1` oder `KAJO C2` mitgeführt.

Garmin führt Kayaking und Whitewater als eigene Sport-/Subsportwerte. Die sichtbare Aktivitätsüberschrift in Garmin Connect kann dennoch von dessen Aktivitätsbenennung abhängen und muss mit einer echten Synchronisierung geprüft werden.

Die Session wird lokal als Garmin-FIT-Aktivität gespeichert. Das ist kein direkter Upload einer FIT-Datei an die KAJO-API. Garmin weist darauf hin, dass FIT-Aufzeichnungen von Connect-IQ-Apps mit Garmin Connect synchronisiert werden können; der tatsächliche Import in das bestehende KAJO-Konto muss mit einem realen Testdatensatz geprüft werden.

## 2. Bedienung

- Obere physische Taste (`KEY_ENTER` bzw. `KEY_START`): startet die Aufzeichnung oder beendet und speichert sie.
- Untere physische Taste (`KEY_ESC`): setzt während der Aufzeichnung eine FIT-Rundenmarkierung; außerhalb einer Aufzeichnung bleibt die Zurück-Funktion erhalten.
- Touch-Schaltflächen bleiben als zusätzliche Bedienmöglichkeit verfügbar.
- Schlägt das Stoppen fehl und Garmin meldet die Session weiterhin als aktiv, bleiben Timer, GPS und Rundenmarkierungen aktiv. Die obere Taste kann erneut zum Stoppen verwendet werden.
- Ist die Session bereits gestoppt, aber das FIT-Speichern schlägt fehl, werden Timer und GPS beendet. Die obere Taste versucht anschließend erneut zu speichern, ohne eine zweite Aktivität anzulegen.
- Datenseiten können während der Aufzeichnung vertikal nach oben/unten gewechselt werden.
- Die Bootsklasse wird vor dem Start im Startmenü ausgewählt und nicht als Überschrift in der Aktivitätsansicht angezeigt.

Die genaue Tastenbelegung muss noch auf einer echten Garmin Venu 3S validiert werden.

## 3. Aktivitätsseiten

Über „Anzeigen anpassen“ lassen sich die fünf vorhandenen Datenseiten aktivieren oder deaktivieren:

- Übersicht: individuelles KAJO-Dashboard mit Trainingsname/-art und geplanter Dauer (falls für heute synchronisiert), groß dargestellter aktueller Herzfrequenz, Zeit und Distanz; Geschwindigkeit wird kleiner ergänzt. Ein äußerer, fünfteiliger Ring zeigt die HF-Zonen farblich und hebt die aktuelle Zone hervor.
- Geschwindigkeit: aktuell, Durchschnitt und Maximum
- Herzfrequenz: aktuell, Durchschnitt, Maximum und Herzfrequenzzone
- Distanz & Zeit: Distanz, Zeit und Kalorien
- Weitere Daten: Kadenz, Leistung, Höhe, Training Effect, GPS-Status/-Qualität sowie Auf-/Abstieg

Die Auswahl wird über `Toybox.Application.Storage` dauerhaft gespeichert. Mindestens eine Standardseite bleibt aktiv. Die Reihenfolge der fünf Standardseiten ist festgelegt. Zusätzlich können bis zu drei eigene Datenseiten konfiguriert werden. Jede eigene Seite kann bis zu vier Kennzahlen enthalten; insgesamt stehen 17 Kennzahlen zur Auswahl, darunter die aktuelle Herzfrequenzzone. Die drei Layouts werden unabhängig voneinander gespeichert. Im Editor wechselt ein Tippen links bzw. rechts in der Layout-Kopfzeile zwischen den eigenen Datenseiten; vertikales Wischen blättert weiterhin durch die Kennzahlenliste. Links am Eintrag wird ein Feld aktiviert/deaktiviert, rechts wird es für die Sortierung ausgewählt; „HOCH“ und „RUNTER“ ändern die Reihenfolge, „GROSS“ hebt das ausgewählte Feld hervor. Jede eigene Datenseite besitzt ihre eigene Sortierung und individuelle Größenstufen pro Kennzahl: klein, mittel oder groß. Im Editor wird die Größe des rechts ausgewählten Feldes über die mittlere Schaltfläche „GROESSE“ zyklisch geändert; die Kennzahlzeile zeigt K, M oder G. Die Größe wird unabhängig für jede Kennzahl und jede Datenseite gespeichert. Die Größenstufe verändert sowohl die Schriftgröße als auch Breite und Höhe der jeweiligen Kachel. Die Positionen folgen den fünf gespeicherten Rasterplätzen (oben links/rechts, unten links/rechts oder unten mittig); größere Kacheln nutzen innerhalb ihres Platzes mehr Fläche. Bestehende Einstellungen der bisherigen einzelnen eigenen Datenseite werden als erste eigene Datenseite weiterverwendet; ein bisheriges großes Feld wird als Größenstufe „groß“ übernommen.

**Noch nicht umgesetzt:** Mehr als vier Kennzahlen gleichzeitig auf einer eigenen Seite anzeigen, die Feldpositionen frei auf der Uhr anordnen und die Konfiguration direkt in der KAJO-Web-App statt auf der Uhr bearbeiten.

## 4. Trainingsplan-Synchronisierung

Nach dem Öffnen der Startansicht ruft die Uhr über den gekoppelten Geräte-Endpunkt geplante Einheiten aus `public.user_data.data.planned` ab. Das ist dieselbe Datenquelle, die der bestehende KAJO-Cloud-Snapshot verwendet; die separate Tabelle `planned_sessions` wird nicht als neue führende Quelle eingeführt.

Übertragen werden die Basisfelder:
- `id`, `date`, `name`, `type`
- `duration`, `targetTss`, `category`, `desc`

Bei Wochenplänen, die über den bestehenden Saisonplan-Workflow in den Kalender übernommen werden, bleiben zusätzlich die getrennten Angaben `discipline`, `raceFormat`, `waterType`, `intensity`, `objective`, `warmup`, `mainSet`, `cooldown` und `notes` erhalten. Optional kann eine strukturierte Liste `steps` übertragen werden. Jeder Schritt enthält `id`, `type` (warmup/work/recovery/cooldown/other), `label`, `durationSeconds` und optional `target`. Die Web-App begrenzt die Liste auf 40 Schritte; die Edge Function prüft Typ, Bezeichnung und Dauer erneut. Ältere oder manuell angelegte Kalendereinträge ohne diese Felder bleiben kompatibel.

Die Uhr lädt Einheiten von gestern bis 14 Tage in die Zukunft, maximal 30 Einträge. Textfelder werden für die begrenzte Watch-Anzeige gekürzt. Der Menüpunkt „Trainingsübersicht“ öffnet eine paginierte Liste des lokal synchronisierten Plans. Ein Eintrag öffnet die Detailansicht mit Name, Datum, Trainingsart, Dauer, Ziel-Load, Kategorie und – bei strukturiert übertragenen Wochenplänen – Rennformat/Gewässer, Ziel, Intensität, Hauptteil, Aufwärmen und Abwärmen. Die Watch-Ansicht zeigt aktuell nur kurze, gekürzte Textzeilen; längere Inhalte werden nicht vollständig dargestellt. Ruhetage werden gesondert dargestellt.

Wichtig: `mainSet` bleibt ein Freitextfeld. Die strukturierte Schrittfolge ist ein separates optionales Feld und wird nicht aus Freitext automatisch abgeleitet. Bei manuell geplanten Einheiten kann sie direkt in der Trainingsplanung angelegt werden. Bei KI-Wochenplänen darf der Coach Schritte nur aus eindeutig geordneten Vorgaben mit ausdrücklich genannten Dauern erzeugen; unklare Abläufe bleiben Freitext und erhalten `steps: []`.

Der zuletzt synchronisierte Trainingsplan wird lokal gespeichert und bleibt bei fehlender Verbindung als Offline-Ansicht verfügbar. Die Synchronisierung ist im Branch vorbereitet, aber noch nicht end-to-end getestet.

## 5. Herzfrequenzzonen

KAJO berechnet die Zonen; die Uhr übernimmt die vier oberen Zonengrenzen für Z1 bis Z4. Die Uhr ordnet die aktuelle Garmin-Herzfrequenz Z1 bis Z5 zu und zeigt die Zone mit einem fünfteiligen Balken auf der Übersichts- und Herzfrequenzseite.

Die Berechnung folgt der bestehenden KAJO-Logik in `js/training-load.js`:
- adaptive Ruhe-HF als Median gültiger Garmin-Ruhe-HF-Tageswerte im konfigurierten Rückblick;
- wenn mindestens 60 % der Tage (mindestens drei Messwerte) nicht vorliegen, wird eine gültige Profil-Ruhe-HF als gekennzeichneter Fallback verwendet;
- Karvonen-Grenzen bei 60/70/80/90 % der Herzfrequenzreserve.

Die Uhr berechnet keine eigene HFmax, Ruhe-HF oder abweichende Zonen. Die aktuellen Grenzwerte werden lokal mit Datum gespeichert; veraltete Tageswerte werden nicht als aktuelle Zonen übernommen. Ohne gültige Grenzen erscheint „ZONE --“.

Die lokale Verlaufsliste `kajoActivityHistory` speichert Anzeigeformate und zusätzlich ISO-Datum, Dauer in Sekunden sowie – sofern verfügbar – Distanz in Metern und numerischen Durchschnittspuls. Fehlende Messwerte werden ausgelassen und nicht als Null gespeichert. Diese Historie ist weiterhin nicht mit dem KAJO-Konto synchronisiert.

## 6. Noch offen

- Die KAJO-Web-App enthält einen Editor für drei eigene Datenseiten mit jeweils bis zu vier Kennzahlen, Reihenfolge, individueller Größenstufe und Position in einem begrenzten Raster (oben links/rechts, unten links/rechts oder unten mittig). Die Einstellungen werden im benutzerspezifischen `settings.kajoConnectDisplayLayouts` gespeichert und durch die bestehende Cloud-Synchronisierung übertragen.
- Die Edge Function `kajo-connect` validiert die Layouts und gibt sie über die bestehende `sync`-Antwort zurück. Die Startansicht der Uhr übernimmt die drei Layouts nach erfolgreicher Synchronisierung in den lokalen Garmin-Speicher; die Aktivitätsansicht liest diese Einstellungen beim Öffnen ein.
- Diese Übertragung ist im Quellcode vorbereitet, aber noch nicht mit einem Garmin-Build, einer bereitgestellten Edge Function oder einem echten Gerät getestet.
- Pixelgenaue freie Feldpositionen und mehr als vier Kennzahlen pro Seite sind weiterhin nicht umgesetzt. Die Positionierung ist bewusst auf fünf kollisionsfreie Rasterplätze begrenzt.
- Backend-Tabellen, Edge-Function-Deployment und erforderliche Secrets.
- End-to-end-Test von Pairing, Trainingsplan-Synchronisierung, strukturierten Trainingsschritten und Herzfrequenzzonen.
- Prüfung der Schritt-Timer, automatischen Übergänge und manuellen Vor-/Zurücksteuerung auf der Garmin Venu 3S.
- Prüfung der FIT-Aktivität in Garmin Connect und des anschließenden Imports über die vorhandene KAJO-Garmin-Verbindung.
- Prüfung der physischen Tasten, GPS-Aufzeichnung, Datenseiten und Offline-Cache auf der Garmin Venu 3S.
- Ein direkter FIT-Upload an KAJO und eine Upload-Queue sind nicht implementiert.

## 7. Build und Installation auf der Garmin Venu 3S

Für einen lokalen Windows-Build liegt unter `KajoConnect/build.ps1` ein PowerShell-Skript. Es ist ausschließlich auf das Produktprofil `venu3s` eingestellt und erzeugt eine signierte Release-PRG-Datei. Compiler-Warnungen werden ausgegeben. Der Garmin-SDK-Ordner und der private Developer-Key werden als Parameter übergeben; der Key bleibt außerhalb des Repositorys.

Im Ordner `KajoConnect` ausführen:

```powershell
.\build.ps1 -SdkPath "C:\Pfad\zum\ConnectIQ-SDK" -DeveloperKeyPath "F:\Pfad\zum\developer_key"
```

Das Skript erzeugt `bin\KajoConnect-venu3s.prg`. Es prüft, ob Compiler, Projektdatei und Developer-Key vorhanden sind, ob der Compiler erfolgreich beendet wurde und ob eine nicht leere Ausgabedatei entstanden ist. Der Build wurde in dieser Entwicklungsumgebung noch nicht ausgeführt, da Garmin-SDK und privater Developer-Key nur auf dem lokalen Windows-Rechner verfügbar sind. Ein installationsfähiges PRG liegt daher noch nicht vor.

### PRG auf der Venu 3S installieren

1. Build erfolgreich ausführen und die Datei `KajoConnect/bin/KajoConnect-venu3s.prg` kontrollieren.
2. Venu 3S per USB-Datenkabel mit dem PC verbinden.
3. Im Gerätespeicher den Ordner `GARMIN/APPS` öffnen.
4. Die PRG-Datei in diesen Ordner kopieren.
5. Uhr sicher vom PC trennen und die App auf der Uhr unter Aktivitäten/Apps öffnen.

Garmin beschreibt dieses Sideload-Verfahren für Connect-IQ-Entwicklungsbuilds in der offiziellen Developer-FAQ: https://forums.garmin.com/developer/connect-iq/w/wiki/4/new-developer-faq.

### Was vor einer vollständigen Freigabe noch geprüft werden muss

1. Erfolgreiche Kompilierung mit dem installierten Connect-IQ-SDK 9.3.0.
2. Start, Bedienung und Speichern einer FIT-Aktivität auf der echten Venu 3S.
3. GPS-Verhalten bei gutem, schwachem und fehlendem Empfang.
4. Physische Tasten, Touch-Steuerung, Datenseiten und strukturierte Trainingsschritte.
5. Offline-Verhalten und Wiederöffnung der App nach Unterbrechung.
6. Pairing und Trainingsplansynchronisierung erst nach Bereitstellung und Test des KAJO-Connect-Backends.

Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. Er ersetzt keine Simulator- und Gerätetests.

Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. Anzeige, Persistenz, Tasten, FIT-Datei und Synchronisierung müssen zusätzlich im Simulator und auf den echten Geräten geprüft werden.


## 8. Gestaltung der Aktivitätsübersicht

Die erste Aktivitätsseite verwendet ein eigenständiges KAJO-Dashboard statt des klassischen Garmin-Datenfeldrasters. Der Trainingsname und die Trainingsart der für den aktuellen lokalen Tag synchronisierten Einheit stehen oben. Herzfrequenz, Zeit und Distanz erhalten die größte visuelle Priorität; Geschwindigkeit wird bewusst kleiner dargestellt. Der äußere Ring zeigt fünf farblich unterschiedene Herzfrequenzzonen und hebt die aktuell ermittelte Zone hervor. KAJO-Logo und Bootsklasse werden in dieser Trainingsansicht nicht als Überschrift angezeigt.

Die Trainingsübersicht greift auf den lokal gespeicherten Plan unter `kajoPlannedSessions` zurück. Wenn eine strukturierte Schrittfolge vorhanden ist, erscheint eine zusätzliche Seite „Trainingsablauf“ mit aktuellem Schritt, Abschnittstyp, verbleibender Zeit, optionalem Ziel und Vorschau auf den nächsten Schritt. Der Countdown startet mit der Aufzeichnung und wechselt nach Ablauf automatisch zum nächsten Schritt. Auf dieser Seite steuern die linke und rechte Touch-Fläche den vorherigen bzw. nächsten Schritt; nach Abschluss kann links zum vorherigen Schritt zurückgegangen oder rechts die Folge neu gestartet werden. Die physische untere Taste bleibt die FIT-Rundenmarkierung. Ohne strukturierte Schritte bleibt die bisherige kompakte Textseite für Intensität, Ziel, Aufwärmen, Hauptteil und Abwärmen erhalten.
