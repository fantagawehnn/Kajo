# KAJO – Garmin-Datenbasis und KI-Coach: technischer Audit

Stand: 27.11.2026  
Verbindliche Codebasis: `fantagawehnn/Kajo`, Branch `v2`  
Übernahme der Garmin-Datenqualitätsänderungen: PR [#4](https://github.com/fantagawehnn/Kajo/pull/4), Merge-Commit `228b9ef7c0b9eeaca939eca3c23593c1cb93797f`

## 1. Ergebnis in Kürze

Die Garmin-Datenqualitäts- und Coverage-Änderungen aus PR #35 wurden gezielt in KAJO V2 übernommen. Garmin-Telemetrie wird zentral über eine Herkunftsprüfung bereitgestellt. Nicht verifizierte generische Telemetrie bleibt zur Datenerhaltung bestehen, wird aber nicht mehr als Garmin-Zeitreihe ausgewertet.

Die Belastungsberechnung unterscheidet bestätigte Ruhetage von unbekannten oder unvollständigen Tagen. Fehlende Daten werden nicht mehr automatisch als Load 0 fortgeschrieben. Die CI-Prüfungen für Syntax, Navigation, Regression und Garmin-Load/Coverage waren auf dem anschließenden V2-Stand `81d55b3a4ddcd596c49a1080eb347953b9427c75` erfolgreich.

**Wichtig:** Der Code-Audit belegt, welche Datenpfade in der Anwendung vorhanden sind. Er belegt nicht, welche Datensätze aktuell im verbundenen Supabase-Konto tatsächlich gespeichert sind oder über welchen Zeitraum sie vollständig vorliegen. Dafür ist eine zusätzliche, lesende Bestandsabfrage der Datenbank erforderlich.

## 2. Tatsächlich nachvollziehbare Datenpfade

| Datenbereich | Im Code nachvollziehbar | Einschränkung |
|---|---|---|
| Garmin-Aktivitätsübersichten | Abruf aus `garmin_activities` in `js/main.js`; Zuordnung zu `state.rawActivities` | Tatsächliche Zeilenanzahl und Zeitraum nicht aus dem Repository ableitbar |
| FIT-Dateien und Messzeitreihen | Abruf über die Garmin-Serverfunktion; Verarbeitung in `applyGarminFitDetail()`; Speicherung im Aktivitätsobjekt unter `garminTelemetry` | In KAJO V2 ist keine separate persistente FIT-Telemetrie-Tabelle im Repository vorhanden. Die verarbeiteten Details werden in den lokalen App-Daten gespeichert |
| Garmin-Gesundheitsdatensätze | Abruf aus `garmin_health_records` mit `data_type`, `record_date` und `payload` | Rohdatensätze werden nicht sämtlich in Kennzahlen überführt |
| Tägliche Check-ins aus Garmin | Zuordnung von HRV, Ruhepuls, Schlafdauer, Schlafscore, Atemfrequenz und Gewicht in `loadGarminHealthRecordsIntoCheckins()` | Vorhandene Check-in-Werte haben Vorrang und werden nicht überschrieben |
| Body Battery, Stress, SpO₂ und weitere Datentypen | Datentypen werden in der Synchronisierungshistorie aufgeführt und als Garmin-Datensätze gespeichert | Keine entsprechende vollständige Check-in- oder Analyseintegration im geprüften Importpfad nachgewiesen |
| VO₂max | Feld im Athletenprofil (`js/profile.js`) | Kein Garmin-VO₂max-Import im geprüften Check-in-Import nachgewiesen; Messquelle und Messart sind im Profilfeld nicht getrennt |
| Krankheit und Verletzung | Manuelle Health-Logs in `state.healthLogs` | Keine automatische medizinische Erkennung; keine Diagnosefunktion |
| RPE und subjektive Check-ins | Manuelle Eingaben in Aktivitäten und Check-ins | RPE-Herkunft und Skala müssen methodisch einheitlich gehalten werden |

## 3. Datenqualität und Berechnung

### 3.1 Garmin-Telemetrie

`js/data-source.js` stellt mit `isGarminActivity()` und `getGarminTelemetry()` einen zentralen Zugriff bereit. Das allgemeine Feld `activity.telemetry` ist kein Ersatz mehr für `activity.garminTelemetry`. Die Herkunft älterer, generischer Telemetrie wird nicht nachträglich als Garmin bestätigt.

Aktivitätsdetails, Herzfrequenzzonen, Kalender und Diagramme verwenden den zentralen Garmin-Zugriff. Damit wird verhindert, dass nicht eindeutig zugeordnete Zeitreihen in Garmin-basierte Auswertungen einfließen.

### 3.2 Belastungsmodelle

In `js/training-load.js` bleiben folgende Methoden getrennt:

- Garmin-eigener Training Load
- KAJO-HF-Zonen-Load aus Garmin-FIT-Herzfrequenzdaten
- manuelles sRPE (Dauer × RPE)

Externe TSS-Werte werden nicht als Ersatzquelle verwendet. Die Anwendung wählt bei Garmin-Daten derzeit automatisch zwischen Garmin-native Load und HF-Zonen-Load: Es wird die Quelle mit mehr berechenbaren Aktivitäten verwendet. Die Methoden werden nicht addiert; die automatische Auswahl kann sich aber ändern, wenn neue Aktivitäten importiert werden. Eine verbindliche, dauerhaft stabile Auswahlstrategie ist noch festzulegen.

Die aktuelle sRPE-Implementierung akzeptiert ganzzahlige RPE-Werte von 1 bis 10. Das Berechnungsdokument beschreibt eine Skala von 0 bis 10. Diese Abweichung muss vor einer Änderung fachlich entschieden werden.

Wenn individuelle HF-Zonen fehlen, kann der bestehende HF-Zonenpfad ersatzweise Zonen aus Prozentwerten der maximalen Herzfrequenz ableiten. Das ist als Schätzung zu kennzeichnen und nicht mit individuell bestimmten Schwellen gleichzusetzen.

### 3.3 Datenabdeckung und CTL/ATL

`js/calculations.js` verwendet ausschließlich erfolgreich synchronisierte Garmin-Aktivitätszeiträume aus `settings.garminActivityCoverageRanges`:

- Ein Tag ohne Aktivität gilt nur innerhalb eines bestätigten, abgeschlossenen Synchronisierungszeitraums als Ruhetag.
- Ein Tag mit Aktivität, aber ohne berechenbaren Load-Wert, bleibt unvollständig.
- Tage außerhalb bestätigter Zeiträume bleiben unbekannt.
- Unbekannte oder unvollständige Tage unterbrechen die EWMA-Modellkette; CTL/ATL werden nicht mit künstlichen Nullwerten über die Lücke fortgeschrieben.
- CTL verwendet 42 Tage, ATL 7 Tage.

Die Coverage wird nach erfolgreicher Aktivitätslistensynchronisierung gespeichert. Der laufende lokale Kalendertag wird nicht als abgeschlossener Zeitraum gewertet. Bereits vorhandene historische Aktivitäten erhalten nicht automatisch rückwirkend eine bestätigte Coverage. Die betroffenen Zeiträume müssen erneut erfolgreich synchronisiert werden.

Die Coverage-Bereiche werden aktuell über die lokalen Benutzerdaten in den Einstellungen gespeichert. Da die vorbereitete Cloud-Snapshot-Synchronisierung laut `js/cloud-sync.js` nicht automatisch in den App-Lebenszyklus eingebunden ist, ist eine geräteübergreifende Verfügbarkeit dieser lokalen Coverage- und FIT-Daten noch nicht nachgewiesen.

## 4. Recovery: offene Provenienzfrage bei HRV

Der Garmin-Import sucht HRV-Werte über Feldnamen wie `lastNightAvg`, `lastNightAverage`, `averageHrv`, `avgHrv` oder `hrv`. Der übernommene Check-in-Wert erhält in diesem Importpfad keine eindeutige Kennzeichnung, ob er RMSSD, SDNN oder ein anderer aggregierter Garmin-Wert ist.

Manuelle HRV-Eingaben werden in `js/health.js` dagegen mit `source: manual`, `metric: unspecified` und `unit: ms` markiert. Die Garmin-Zuordnung ergänzt diese Provenienzmetadaten derzeit nicht entsprechend.

Die Readiness-Berechnung in `js/dashboard.js` nutzt HRV-Werte aus den Check-ins für eine persönliche Vergleichsbasis. Solange die Metrikidentität nicht eindeutig ist, darf daraus keine methodisch gesicherte RMSSD-Baseline abgeleitet werden. Einzelne HRV-Werte dürfen zudem nicht allein eine Trainingsentscheidung auslösen.

### Ergänzung: HRV-Vergleichbarkeit in den Frontend-Auswertungen

Die Frontend-Auswertungen verwenden inzwischen eine gemeinsame HRV-Messidentität aus Quelle, Messmethode und Einheit. Gesundheitsverlauf, persönliche HRV-Baseline, Readiness und Analysekontexte vergleichen nur Werte mit derselben Identität. Unterstützte Sekundenwerte werden vor der Anzeige und Baseline-Berechnung in Millisekunden umgerechnet; nicht unterstützte Einheiten bleiben unberücksichtigt.

**Einschränkung bleibt bestehen:** Der derzeit geprüfte Garmin-Importpfad kennzeichnet die konkrete HRV-Messmethode nicht eindeutig. Garmin-Werte ohne entsprechende Metadaten werden deshalb nur als `garmin:unspecified:ms` behandelt. Die Oberfläche kann in diesem Fall RMSSD und SDNN nicht nachträglich unterscheiden. Eine methodenspezifische Auswertung ist erst möglich, wenn die Datenquelle die Messmethode nachweislich liefert und der Import sie speichert. Diese Änderung ergänzt keine Importmetadaten und verändert keine gespeicherten Daten.

## 5. Aktueller Stand des KI-Coaches

`js/coach.js` bleibt ein lokaler, regelbasierter Chat-Prototyp. Er liest die letzte Zeile von `state.dailyTimeline` und gibt Belastungswerte beziehungsweise Hinweise auf fehlende Daten aus.

Er erhält derzeit keinen strukturierten Athletenkontext mit:
- vollständiger Trainingshistorie und einzelnen Aktivitäten,
- FIT-Zeitreihen,
- HRV-, Schlaf- und weiteren Gesundheitsverläufen,
- subjektiven Check-ins,
- Leistungsdaten und Testhistorie,
- Athletenprofil und individuellen Trainingszonen,
- Saisonplanung und A–E-Wettkampfprioritäten.

Die Garmin-Datenqualitätsänderungen sind deshalb eine notwendige Grundlage, aber noch keine KI-Coach-Integration.

## 6. Verbindliche nächste Umsetzungsschritte

1. **Supabase Edge Function vervollständigen:** Der Quellcode von `garmin-personal` liegt derzeit nicht im KAJO-Repository. Die lokale UTC-Offset-Übergabe im Frontend ist ergänzt; die Edge Function muss den Offset bei Datumsvalidierung und Synchronisierung tatsächlich auswerten. Anschließend kontrollierter Live-Test, kein ungeprüftes Deployment.
2. **Historische Coverage herstellen:** Nach erfolgreichem Backend-Test die relevanten historischen Aktivitätszeiträume erneut synchronisieren. FIT-Nachimport, Rate Limits und unvollständige Aktivitäten gesondert prüfen.
3. **Reale Dateninventur durchführen:** In einer lesenden Datenbankabfrage Zeilenanzahl, Datumsabdeckung, Datentypen, fehlende Tage und Importstatus der Tabellen `garmin_activities` und `garmin_health_records` ermitteln. Zusätzlich klären, wie FIT-Zeitreihen und lokale Coverage dauerhaft und geräteübergreifend verfügbar gemacht werden.
4. **Recovery-/Performance-Provenienz ergänzen:** HRV-Metrik und Quelle explizit speichern; Garmin-VO₂max von manuellen und extern diagnostischen Messungen trennen; Body Battery, Stress und weitere Gesundheitsfelder erst nach Feld- und Einheitenprüfung integrieren.
5. **Berechnungsmethodik festlegen:** RPE-Skala entscheiden, Auswahl des Load-Modells stabilisieren und Schätzungen aus maximaler Herzfrequenz klar von individuellen Schwellen unterscheiden.
6. **Zentralen Athlete Context entwickeln:** Eine zentrale, benutzerbezogene Schnittstelle stellt aufbereitete Kennzahlen, Trends, Aktivitätsdetails, Datenherkunft, Vollständigkeit und Zeitfenster bereit. Der Coach soll keine parallelen Belastungsberechnungen durchführen.
7. **KI-Coach anbinden und validieren:** Erst danach echte KI-Backend-Anbindung, sportartspezifische Interpretation für Kanu-Wildwasserrennsport und Tests mit realen Trainingsverläufen.

## 7. Sicherheits- und Änderungsgrenzen

- Keine Supabase-Migration ohne nachgewiesene Notwendigkeit und Rückwärtskompatibilitätsprüfung.
- Keine Änderung an produktiven Garmin-Credentials oder bestehenden Gesundheitsdaten im Rahmen dieses Audits.
- Keine privilegierten Secrets im Frontend oder Repository.
- Keine medizinischen Diagnosen.
- Keine Aussage über tatsächliche Datenvollständigkeit oder Datenzeiträume ohne lesende Prüfung der gespeicherten Datensätze.
