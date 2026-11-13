# KAJO V2 – Technischer Bestandsaudit

Stand: 13.11.2026  
Referenzcode: `fantagawehnn/Endurance-AI`, Branch `main`  
V2-Ziel: `fantagawehnn/Kajo`, Branch `v2`

## 1. Übernommene technische Basis

Die modularisierte Browser-App wurde als Ausgangsbasis in das KAJO-V2-Repository übernommen. Dazu gehören das HTML-Grundgerüst, CSS, PWA-Dateien, das KAJO-Branding sowie die vorhandenen JavaScript-Fachmodule für Authentifizierung, Dashboard, Kalender, Aktivitäten, Import, Belastung, Recovery/Health, Wettkämpfe, Planung, Krafttraining, Routen, Ernährung, Profil und Einstellungen.

Die öffentliche Supabase-Konfiguration verweist weiterhin auf das bestehende Projekt. Die App verwendet Supabase Auth; die User-ID wird aus der authentifizierten Sitzung abgeleitet. Die vorhandene Garmin-Edge-Function und die bestehenden Tabellen bleiben im bisherigen Supabase-Projekt. V2 hat keine neue Datenbankmigration ausgeführt und keine produktiven Tabellen oder Secrets verändert.

## 2. Garmin und Identität

- Der vorhandene Garmin-Zugriff erfolgt serverseitig über die Edge Function `garmin-personal`.
- Die Funktion leitet bei normalen Nutzeranfragen die Identität aus dem Supabase-Bearer-Token ab.
- Bestehende Garmin-Credentials sind benutzerbezogen gespeichert und serverseitig verschlüsselt.
- Die bestehende Edge Function wird nicht in den Browser verlagert und ihre Secrets werden nicht in das Repository übernommen.
- Die Wiederverwendung derselben User-ID ist die Voraussetzung dafür, dass bestehende Verknüpfungen und Daten demselben Account zugeordnet bleiben.

**Noch nicht abgenommen:** Ein echter Login mit dem bestehenden Account und ein Live-Test der Garmin-Synchronisierung in der V2-Oberfläche stehen aus.

## 3. FIT-Import

Im vorhandenen `js/import.js` ist ein FIT-Parser eingebunden. Der Parser liest Sessions, Records und Laps aus und extrahiert unter anderem:

- Session-Datum, Dauer und Distanz,
- durchschnittliche und maximale Herzfrequenz,
- Herzfrequenz-, Geschwindigkeits- und Zeitreihen,
- Rundeninformationen.

**Auditbefund:** Der aus FIT erzeugte Aktivitätsdatensatz erhält aktuell `tss` aus `session.training_load` und eine Telemetrie-Struktur mit `labels`, `hr`, `speed` und `time`. Der erzeugte Datensatz setzt an dieser Stelle jedoch nicht eindeutig `source: 'garmin'`, `garminTrainingLoad` oder `garminFitImported`.

Die FIT-Aktivität bleibt bewusst als `source: 'fit'` klassifiziert und wird dadurch nicht automatisch als Garmin-Aktivität in der Garmin-Load-Logik behandelt. Für die Aktivitätsdetailansicht ist inzwischen ein eigener, provenance-geprüfter Zugriff ergänzt: Telemetrie aus `activity.telemetry` wird dort nur genutzt, wenn `source === 'fit'` oder `sources` explizit `fit` enthält. Mehrdeutige Legacy-Telemetrie bleibt ausgeschlossen.

## 4. Belastungsberechnung

Vorhanden sind drei unterschiedliche Pfade:

1. sRPE: Dauer in Minuten × subjektive Belastung.
2. Herzfrequenzzonen: gewichtete Zeit in fünf Zonen (Faktor 1 bis 5); die Implementierung bezeichnet das Ergebnis als `EA-HF-Punkte`.
3. Native Garmin Load: wird über `garminTrainingLoad` erkannt.

**Wichtige Abweichungen bzw. offene Entscheidungen:**

- Der Code wählt bei vorhandenen Garmin-Datensätzen automatisch zwischen nativem Garmin Load und dem eigenen HF-Zonen-Modell – abhängig davon, welches Modell mehr berechenbare Aktivitäten liefert. Diese automatische Methodenwahl muss gegen die verbindliche Vorgabe geprüft werden, dass Garmin Training Load, KAJO-HF-Zonen-Load/Edwards TRIMP und sRPE getrennte Kennzahlen bleiben.
- Das sRPE-Modell akzeptiert derzeit ganzzahlige RPE-Werte von 1 bis 10. Das Berechnungsdokument definiert die Skala als 0 bis 10. Die Skala muss vor einer Anpassung eindeutig festgelegt und durch Tests abgesichert werden.
- Für HF-Zonen werden sportartspezifische Grenzen verwendet, wenn vorhanden. Fehlen diese, erzeugt der Code ersatzweise Grenzen aus Prozentwerten der maximalen Herzfrequenz. Das Berechnungsdokument bevorzugt individuelle Schwellenzonen.
- Die Intensitätsverteilung nach drei Schwellenzonen ist als eigene Kennzahl von der fünfstufigen gewichteten HF-Zonenbelastung zu trennen.
- Die Performance-Timeline verwendet eine tägliche EWMA-Logik mit 42 Tagen für CTL und 7 Tagen für ATL. Tage ohne berechenbare Belastung erhalten aktuell im Zeitverlauf den Wert 0. Das darf nur als Ruhetag gelten, wenn die Tagesdaten vollständig genug sind; andernfalls ist der Datenstatus eingeschränkt bzw. nicht berechenbar auszuweisen.

**Folgerung:** Die bestehenden Berechnungen werden zunächst nicht verändert. Zuerst werden Methoden, Quellenfelder, Zeitreihenabdeckung und UI-Bezeichnungen in einem eigenen Berechnungs-Audit abgeglichen.

## 5. Recovery, Performance und Health

Der bestehende Importpfad enthält Felder für HRV, Ruhepuls, Schlafdauer/-score/-qualität, Atemfrequenz, Gewicht und VO₂max.

Noch zu prüfen bzw. zu ergänzen sind:

- klare Trennung von Garmin-Schätzungen und direkt gemessenen VO₂max-Werten,
- eindeutige Herkunft und Einheit der importierten HRV-Werte,
- Abgrenzung von RMSSD, SDNN und aggregierten Garmin-Werten,
- persönliche HRV-Baseline und Trendberechnung: Neue Intervals-Wellnesswerte werden im Check-in unter `measurementSources.hrv` als `source: intervals`, `metric: rmssd`, `unit: ms` gekennzeichnet. Manuelle Eingaben werden als `source: manual`, `metric: unspecified`, `unit: ms` markiert. Historische Werte ohne diese Metadaten bleiben `unknown`; sie werden nicht rückwirkend klassifiziert. `hrvSDNN` wird weiterhin nur diagnostisch gezählt und nicht als Check-in-Messwert übernommen. Eine adaptive Baseline bleibt offen, bis Statistik, Mindestdatenbasis und Ausreißerbehandlung verbindlich festgelegt sind.
- Datenvollständigkeit bei Schlaf- und Gesundheitsdaten,
- Krankheitstage, Verletzungen und Trainingsverfügbarkeit als getrennte Health-Daten.

KAJO leitet keine medizinischen Diagnosen ab.

## 6. UI-/UX-Bestand

Die übernommene Anwendung nutzt ein großes HTML-Grundgerüst, Tailwind-Klassen und eine umfangreiche Stylesheet-Datei. Die verbindlichen Designrichtlinien verlangen ein gemeinsames, kompaktes System mit konsistenten Ringen, Farben, Abständen, Icons und Interaktionsmustern.

Die V2-Übernahme ist deshalb eine funktionsfähige Ausgangsbasis, aber noch keine abgeschlossene Designsystem-Überarbeitung. Vorhandene Tokens und Komponenten müssen zunächst vollständig inventarisiert werden; Berechnungen und fachliche Inhalte dürfen bei der UI-Überarbeitung nicht verändert werden.

## 7. Navigation und Seitenstruktur

Die verbindliche Fünf-Tab-Navigation ist in V2 umgesetzt: Heute, Kalender, Training, Analyse und Mehr. Auf Desktop und Smartphone sind die fünf Hauptbereiche getrennt erreichbar. Training besitzt die Unterbereiche Aktivitäten und Trainingsplanung; Analyse besitzt die Unterbereiche Training Load, Recovery, Performance und Health.

Die Kalenderansichten Tag, Woche, Monat und Jahr sind verfügbar; die Woche ist Standard. Die Aktivitätsliste ist in den Trainingsbereich eingeordnet. Profil, Sporteinstellungen, Garmin-/Datenverwaltung und App-Einstellungen sind unter Mehr gruppiert.

Die Heute-Seite enthält die vorhandenen Recovery-/Load-/Fitnessindikatoren, Wearable-Kennzahlen, Tagesplanung, den nächsten Wettkampf und eine interaktive Wochenübersicht. Die CTL-Anzeige ist als Fitnessindikator gekennzeichnet und nicht als direkter Leistungstest zu verstehen. Load nutzt den bestehenden ATL-Wert. Die Anzeige ändert keine Berechnungsformeln.

Bei Tages- und Wochensummen werden Dauer und Load nur dann summiert, wenn die jeweiligen Werte für alle berücksichtigten Aktivitäten vorhanden sind. Fehlende Werte werden nicht als Nullwerte ausgegeben. Die Trainingsverfügbarkeit wird nicht berechnet, solange die erforderliche Datenbasis nicht vollständig nachgewiesen ist.

Die technische Zuordnung und offenen manuellen Abnahmen stehen in [docs/NAVIGATION.md](NAVIGATION.md).

## 8. Teststatus

- GitHub-Actions-Workflow prüft JavaScript-Syntax, Navigation-Smoke-Tests und Regression-Smoke-Tests.
- Die Tests wurden an die bestehende, bewusst geschützte benutzerbezogene Speicherung angepasst: globale Legacy-Daten werden nicht automatisch in einen Account importiert.
- Die Regression-Smoke-Tests und Navigation-Smoke-Tests liefen im aktuellen V2-Branch erfolgreich durch (zuletzt Commit `eb2c6f53d66898aa4d89d45bdca775b2d1be3bc1`).
- Der Jekyll-/Pages-Build-Schritt war für Commit `c589bba8229e43c790aece8eac80c2336a612e1b` erfolgreich. Die anschließende Veröffentlichung scheiterte mit HTTP 404, weil GitHub Pages im Repository noch nicht aktiviert ist. Es wurde keine Veröffentlichung erzwungen.
- Login, Garmin-Live-Sync, Datenqualität, Dark/Light Mode und mobile Darstellung sind noch nicht end-to-end abgenommen.

## 9. Sicherheits- und Änderungsgrenzen

- Keine produktiven Supabase-Migrationen ohne gesonderte Prüfung und ausdrückliche Freigabe.
- Keine Änderungen an Garmin-Credentials oder bestehenden Nutzerdaten im Rahmen der UI-Übernahme.
- Keine privilegierten Secrets im Frontend oder Git-Repository.
- Keine automatische Übernahme globaler Legacy-Daten in einen Account.
- Keine Änderung einer Berechnung allein aus gestalterischen Gründen.


## 10. Analyse-Seiten – visuelle Verfeinerung

Die Analyse-Seiten besitzen nun eine einheitliche Hero-Kennzahl mit gleicher Kreisgröße/-position, einen gemeinsamen Zeitraumfilter und kompakte Kennzahlenreihen. Die UI-Schicht `js/analysis-ui.js` liest bestehende Werte und berechnet keine neue Trainingslast oder Readiness.

- Training Load zeigt ATL als kurzfristige Belastungsgröße; CTL, ATL, Saldo und ACWR werden ergänzend dargestellt.
- Recovery nutzt HRV als unveränderten Einzelmesswert im Hauptkreis und erzeugt keinen zusätzlichen Gesamtscore. Wearable- und subjektive Werte werden nur angezeigt, wenn sie vorhanden sind.
- Performance zeigt VO₂max nur als importierten Wellnesswert, wenn vorhanden. Die Messart ist im bestehenden Datenfeld nicht ausreichend getrennt; daher wird keine direkte Leistungsdiagnostik behauptet. CTL bleibt als Belastungs-/Fitnessindikator gekennzeichnet.
- Health weist Trainingsverfügbarkeit weiterhin als nicht berechenbar aus, solange die erforderliche Datenverknüpfung fehlt. Dokumentierte Krankheit und Verletzung werden getrennt gezählt und über 28 Tage visualisiert.
- Für Wearable-Detailverläufe wird transparent ausgewiesen, dass noch kein methodisch freigegebener adaptiver persönlicher Normalbereich hinterlegt ist.

**Additive Provenienz-Erweiterung:** Das bestehende Check-in-Objekt erhält optional `measurementSources` als Metadatenfeld pro Messwert. Vorhandene Messwerte und Berechnungsformeln bleiben unverändert; historische HRV-Werte ohne Metadaten werden nicht verändert oder rückwirkend einer Quelle zugeordnet. Die adaptive Baseline wird weiterhin nicht implementiert, bis Mindestdatenbasis, robuste Statistik, Ausreißerbehandlung und schrittweise Aktualisierung verbindlich festgelegt sind.

Die CSS-Komponenten enthalten Light-Theme-Variablen für `data-theme="light"`. Auf dem Feature-Branch `kajo-v2-athlete-profile-design` wurde zusätzlich eine persistente Theme-Auswahl (System, Hell, Dunkel) in den Einstellungen ergänzt. Die appweite visuelle Endabnahme aller Module und realer Geräte steht weiterhin aus.


## 11. KAJO-Designsystem und Athletenprofil – additive Umsetzung auf Feature-Branch

Auf Branch `kajo-v2-athlete-profile-design` wurden die Design-Tokens für Hintergrund, Oberflächen, Text, Rahmen, Brand und semantische Statusfarben zentral in `css/styles.css` ergänzt. Die Statusfarben sind in Dark und Light Mode getrennt definiert; Sportartenfarben bleiben davon unabhängig und werden weiterhin aus der zentralen Sportartenkonfiguration bezogen.

Das Athletenprofil wurde auf eine kompakte Übersicht mit direkt auswählbaren Bereichen umgestellt. Ergänzt wurden strukturierte Felder für Land, Profilbild-URL, Wettkampfformate, Stärken/Entwicklungsfelder, Titel, Wettkampfgeschichte, persönliche Bestleistungen und sportlichen Werdegang. Die bestehenden Profilwerte bleiben im bisherigen Profilobjekt gespeichert; es wurde keine Datenbankmigration vorgenommen. Das Profilbild akzeptiert ausschließlich HTTP(S)-URLs und bleibt optional. Die Karrierehistorie wird als vertikale Timeline, Ergebnis- und Rekordlisten werden kompakt dargestellt.

Eine tatsächliche Profilfortschrittsanzeige basiert auf dem Verhältnis ausgefüllter zu verfügbaren Profilfeldern. Sie ist keine Leistungs- oder Trainingskennzahl. Es werden keine Fortschrittsringe für nicht messbare Ziele erzeugt.

Die Theme-Auswahl bietet System, Hell und Dunkel und speichert die Präferenz lokal auf dem Gerät. Die UI-Änderungen greifen nicht in Trainingsberechnungen, Garmin-Synchronisierung oder Supabase-Tabellen ein. Die Umsetzung ist bis zum Abschluss der CI- und visuellen Endabnahme als Feature-Branch-Änderung zu verstehen.


## 12. Aktivitätsdetailansicht – technischer Stand auf Branch v2

### Vorhandene Datenpfade
- Die Detailansicht wird in js/activities.js über openCSVDetailsModal aufgebaut.
- Die zentrale Aktivitätstelemetrie wird in js/charts.js dargestellt.
- Der manuelle FIT-Import erfolgt in js/import.js über fit-file-parser mit speedUnit: km/h und lengthUnit: km.
- Im manuellen FIT-Import werden vorhandene Record-Felder für Herzfrequenz, Geschwindigkeit, Leistung, Kadenz, Höhe, Distanz, Zeitstempel und GPS-Koordinaten übernommen. Fehlende Felder werden nicht ergänzt. Die Aktivitätsdetailansicht nutzt diese Zeitreihen nur bei expliziter FIT-Provenienz; Garmin-verknüpfte Telemetrie bleibt die bevorzugte Quelle.
- FIT-Runden werden mit ihrem vorhandenen Trigger als manuell, automatisch oder nicht zugeordnet klassifiziert. Vorhandene Runden-Leistung und -Kadenz werden zusätzlich gespeichert. Zeitbereiche werden nur gespeichert, wenn Startzeit und Dauer tatsächlich vorliegen.
- Bereits gespeicherte Garmin-FIT-Diagnosedaten (garminFitData.recordFields und messageGroups) bleiben verfügbar; die Detailansicht nutzt diese nur, wenn sie im Aktivitätsdatensatz tatsächlich vorhanden sind.

### UI- und Interaktionsstand
- Ein zentraler Diagrammbereich bietet ausschließlich Messreihen mit mindestens zwei gültigen Werten an.
- Die Messgrößen werden einzeln umgeschaltet. Es gibt kein zweites FIT-Zeitreihendiagramm.
- Bei gültiger, monotoner Zeitreihe wird die Achse als Zeit seit Start geführt. Andernfalls werden vorhandene Uhrzeitlabels oder ein Messpunktindex verwendet und der Datenstatus als eingeschränkt gekennzeichnet.
- Tooltips und die Auswahl eines Messpunkts zeigen Zeit und Messwert. Pace wird als min/km beziehungsweise min/100 m formatiert. Zeitlich zugeordnete FIT-Runden können angewählt werden und markieren ihren Zeitraum im zentralen Diagramm. GPS-Streckenpunkte können den entsprechenden Diagrammpunkt fokussieren, aber nur wenn Zeit-, GPS- und ausgewählte Messreihe indexgenau zusammenpassen.
- Eine Leaflet-Streckenkarte wird nur gerendert, wenn mindestens zwei gültige GPS-Koordinatenpaare gespeichert sind und die Kartenbibliothek verfügbar ist. Ohne GPS-Daten bleibt der Kartenbereich verborgen.
- Kanu-Aktivitäten können um einen manuell dokumentierten Gewässertyp (Flachwasser/Wildwasser) ergänzt werden.
- Die Sportartenfarbe für Aktivitätskopf, Kennzahlenakzent und Telemetrieverlauf wird aus getSportsCatalog() bezogen; reine Messwerte bleiben neutral und werden nicht willkürlich als Status eingefärbt. Die Detailansicht zeigt Quelle, Messpunktumfang, Zeitachsenqualität, GPS-Verfügbarkeit und vorhandene Runden an.
- Die Detailansicht besitzt explizite Light-Theme-Overrides für data-theme="light".

### Belastung und Vergleiche
- Garmin Training Load, KAJO HF-Zonen-Load und sRPE-Load werden getrennt angezeigt. Ein Edwards-TRIMP-Wert erscheint nur, wenn ein entsprechendes Feld im Aktivitätsdatensatz explizit vorhanden ist. Die UI erzeugt kein separates Edwards-TRIMP-Feld.
- Vergleichskandidaten werden konservativ gefiltert: gleiche Sportart, Trainingskategorie, Rennformat und auf 0,01 km gleiche Distanz. Bei Kanu kommen gleiche gespeicherte Strecke, dokumentierter Gewässertyp, Pegel und Abfluss hinzu; bei C2 zusätzlich derselbe dokumentierte Trainingspartner. Fehlen erforderliche Angaben, wird kein Kanuvergleich angeboten.
- Die Dauer und Geschwindigkeit werden als Ergebniswerte verglichen; die Dauer ist kein Ausschlusskriterium. Nicht gespeicherte Wind-, Wetter- oder Linienwahlbedingungen werden nicht angenommen.
- Der Vergleich ist aktuell eine kompakte Gegenüberstellung, kein synchronisiertes Mehrfach-Zeitreihendiagramm.

### Offene Abnahme
- Die automatisierten Syntax-, Navigations- und Regressionstests sind erfolgreich. Die manuelle Browserprüfung mit realen Garmin-Aktivitäten, FIT-Dateien mit und ohne GPS, mobilen Geräten sowie Dark/Light Mode steht weiterhin aus.
- Die Verfügbarkeit und Einheit der einzelnen Garmin-FIT-Felder muss anhand realer importierter Datensätze geprüft werden. Die bloße Existenz einer FIT-Datei gilt nicht als Nachweis für eine gespeicherte Zeitreihe.
- Die Aktivitätsdetailänderungen verändern keine zentralen Trainingsberechnungsformeln oder Supabase-Tabellen.
