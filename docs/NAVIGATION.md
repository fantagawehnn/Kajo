# KAJO – Navigation und Seitenstruktur

Stand: 13.11.2026  
Branch: `redesign-v3`

## Verbindliche Hauptnavigation

Die Anwendung verwendet genau fünf Hauptbereiche:

1. Heute
2. Plan
3. Training
4. Analyse
5. Ich

Die Desktopnavigation ist in der oberen App-Leiste erreichbar. Auf Smartphones wird dieselbe Navigation als kompakte, fixierte Fünf-Tab-Leiste am unteren Bildschirmrand dargestellt. Unterbereiche werden ausschließlich innerhalb ihres Hauptbereichs angezeigt.

## Seitenzuordnung

| Hauptbereich | Unterbereich / Ansicht | Bestehende Implementierung |
|---|---|---|
| Heute | Tagesstatus, Training heute, Wearables, nächster Wettkampf, Trainingswoche | bestehendes Dashboard plus interaktive Wochenübersicht |
| Plan | Kalender (Tag, Woche, Monat, Jahr) | bestehende Kalenderlogik; Woche als Standard |
| Plan | Trainingsplanung und Wettkämpfe | bestehende Planung und Wettkampfverwaltung |
| Analyse | Training Load | bestehende Belastungsübersicht und Belastungsverlauf |
| Analyse | Recovery | Readiness und Gesundheitsmetriken/Verlaufsdiagramme |
| Analyse | Performance | Fitnessindikator, Wettkampfkontext und Leistungsmetriken |
| Analyse | Health | dokumentierte Krankheits- und Verletzungsereignisse sowie Verfügbarkeitsstatus |
| Ich | Persönliches Profil | bestehende Profilansicht |
| Ich | Sportbezogene Daten und Einstellungen | Strecken, Ernährung, Berechnungen, Sportarten und App-Konfiguration |
| Ich | Datenverwaltung | Garmin, Datenquellen, Import und Datenqualität |
| Ich | KI-Coach und App | KI-Coach, Darstellung, Benachrichtigungen und allgemeine Einstellungen |

## Technische Umsetzung

- Die Navigation wird zentral über `switchTab()` geroutet. Bestehende Routen wie `calendar`, `training-planning` und `training-competitions` bleiben als kompatible Ziele erhalten.
- Bestehende Inline-Aktionen werden auf die neuen Haupt- und Unterbereiche abgebildet, damit vorhandene Funktionen weiter funktionieren.
- Die Aktivitätsliste verwendet weiterhin die bestehende Kalender-/Aktivitätsdarstellung. Im Trainingsbereich wird nur der Listenmodus angezeigt; der zuvor ausgewählte Kalenderzeitraum-Modus wird beim Verlassen wiederhergestellt.
- Die vier Analyse-Unterseiten verwenden eine gemeinsame Zeitraumsteuerung. Detailverläufe für Recovery und Performance bleiben in ihrem jeweiligen Analysebereich.
- Die Wochenübersicht auf Heute greift auf vorhandene absolvierte und geplante Einheiten zurück. Trainingseinheiten und Tagesfelder sind anklickbar.
- Der Plan-Bereich bündelt Kalender, Trainingsplanung und Wettkämpfe. Der Kalender verwendet die vorhandenen Tages- und Wochenrenderer. Die Jahresansicht zeigt zwölf kompakte Monatsraster; ein Tag kann in die Tagesansicht geöffnet werden.

## Daten- und Darstellungsregeln

- Die Navigation verändert keine Berechnungsformeln oder Datenmodelle.
- Fehlende Aktivitätsdauer und Belastungswerte werden in Wochen- und Listenansichten nicht als Nullwerte ausgegeben.
- Eine Tages- oder Wochensumme wird nur gezeigt, wenn die dafür erforderlichen Einzelwerte vollständig vorliegen.
- Die Trainingsverfügbarkeit bleibt als nicht berechenbar gekennzeichnet, solange die erforderliche Verknüpfung von Gesundheits- und Planungsdaten nicht nachgewiesen ist.
- Der Performance-Ring auf Heute zeigt den vorhandenen CTL-Fitnessindikator. Er ist ausdrücklich kein direkter Leistungstest.
- Die Load-Anzeige auf Heute nutzt den vorhandenen ATL-Wert. Die Berechnung selbst wurde nicht verändert.

## Qualitätssicherung und offene Abnahme

Automatisiert geprüft werden:
- genau fünf Desktop- und fünf Mobile-Hauptnavigationseinträge (Heute, Plan, Training, Analyse, Ich),
- Existenz der zwei Trainings- und vier Analyse-Unterbereiche,
- Kalender-Modi Tag, Woche, Monat und Jahr sowie Wochenstandard,
- JavaScript-Syntax der zentralen Module,
- bestehende Regression-Smoke-Tests.

Noch manuell/end-to-end zu prüfen:
- Bedienung auf realen Smartphones und Desktop-Browsern,
- alle Übergänge aus Dashboard, Kalender, Aktivitätsdetails und Modals,
- echte Authentifizierung und Garmin-Synchronisierung,
- Datenqualität bei unvollständigen und gemischten Aktivitätsdaten,
- visuelle Abnahme der Ringgrößen, Wochenraster und responsiven Abstände.


## Verfeinerung der Analyse-Seiten

Die vier Analyse-Unterseiten verwenden einen gemeinsamen Zeitraumfilter und eine einheitliche Kennzahlenkreis-Komponente mit identischer Größe und Position. Die Darstellung greift auf vorhandene Zustands- und Berechnungswerte zurück:

- **Training Load:** ATL wird als kurzfristige Belastungskennzahl im Hauptkreis angezeigt. CTL, ATL, Belastungssaldo und ACWR werden kompakt ergänzt. Garmin Training Load und sRPE-Load werden als getrennte Quellen mit eigener Datenabdeckung ausgewiesen. Edwards TRIMP wird nicht als verfügbar behauptet, solange kein eigenständiges Datenfeld nachgewiesen ist; unterschiedliche Belastungsmodelle werden nicht zu einer neuen Kennzahl vermischt.
- **Recovery:** HRV wird als unveränderter Messwert im Hauptkreis angezeigt; es wird kein zusätzlicher Recovery-Gesamtscore gebildet. Ruhepuls, Schlafdauer, Sleep Score, Body Battery (falls im Check-in vorhanden), Stress, Müdigkeit und Muskelkater werden mit Messdatum kompakt ergänzt.
- **Performance:** Ein importierter VO₂max-Wert wird nur als importierter Wellnesswert mit offen ausgewiesener Messart angezeigt. Fehlt er, bleibt der Hauptkreis leer. CTL wird ausdrücklich nicht als direkte Performance-Messung ausgegeben.
- **Health:** Trainingsverfügbarkeit bleibt nicht berechenbar, bis Gesundheits- und Planungsdaten für denselben Zeitraum ausreichend vollständig verknüpft sind. Krankheit und Verletzung werden als dokumentierte Einträge getrennt dargestellt; ein 28-Tage-Ereignisverlauf ergänzt die Ansicht.

Die Wearable-Detailansicht verwendet weiterhin die vorhandenen Messwertverläufe. Neue Intervals-Wellnesswerte werden über `measurementSources.hrv` als RMSSD aus der Quelle `intervals` gekennzeichnet; manuelle HRV-Eingaben erhalten `source: manual` und `metric: unspecified`. Die manuelle Messmethode wird damit nicht als RMSSD vorausgesetzt. Historische HRV-Werte ohne Metadaten bleiben unbekannter Herkunft und werden nicht nachträglich klassifiziert. `hrvSDNN` wird weiterhin nur in der Importdiagnostik erfasst und nicht in den täglichen Check-in übernommen. Eine ln(RMSSD)-Reihe darf deshalb nur eindeutig als Intervals-RMSSD markierte Messungen verwenden. Ein persönlicher Normalbereich wird erst nach Festlegung der statistischen Methode und ausreichender Datenbasis ausgewiesen; die bisherige einfache Mittelwert-/Streuungs-Einordnung wird nicht als persönlicher Normalbereich oder Statusfarbe ausgegeben.

### Noch offene fachliche und technische Punkte

- Vor Implementierung einer adaptiven Baseline ist die statistische Methode verbindlich festzulegen (robuste Lage-/Streuungsmaße, Mindestdatenbasis, Ausreißerbehandlung, Aktualisierungsfenster, Schutz vor kurzfristiger Baseline-Verschiebung und Änderungsprotokoll).
- Für Performance fehlen derzeit eine sportartspezifische, methodisch vergleichbare Hauptkennzahl und ein entsprechend gefilterter Leistungsverlauf. VO₂max bleibt wegen der nicht getrennten Messart ein eingeschränkt interpretierbarer Importwert.
- Eine getrennte, fachlich verifizierte Anzeige von Garmin Training Load, Edwards TRIMP und sRPE erfordert zunächst die eindeutige Zuordnung der vorhandenen Datenfelder.
- Die neuen Light-Theme-CSS-Hooks unterstützen die Analyse-Komponenten, sofern die Oberfläche `data-theme="light"` oder `theme-light` setzt. Ein appweiter Theme-Schalter ist damit noch nicht umgesetzt.
