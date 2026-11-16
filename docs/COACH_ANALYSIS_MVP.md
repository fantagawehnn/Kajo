# KAJO Coach – Analyseebene für die erste Version

**Status:** Portierung auf `integration/coach-ai-current-v2` (nicht deployed)  
**Zweck:** Deterministische, deskriptive Zusammenfassung vorhandener KAJO-Daten als Grundlage für die Interpretation durch den passiven KI-Coach.

## Implementiert

- Neues Modul `js/coach-analysis.js`.
- Übergabe einer `analysisSummary` durch `js/coach-data-context.js`.
- Der Worker weist das Modell an, diese Zusammenfassung zu nutzen, aber weiterhin Datenabdeckung, Zeitraum und Rohdatenkontext zu prüfen.
- Aktivitätsdauer wird aus dem gespeicherten Minutenwert aggregiert. Der manuelle Aktivitätseditor und die Importpfade speichern die Dauer in Minuten.
- Unvollständige Dauern werden kenntlich gemacht; `totalMinutes` bleibt dann `null`. `knownMinutes` ist ausdrücklich nur die Summe der Aktivitäten mit bekannter Dauer.
- Belastungsdaten werden nach Load-Modell getrennt gehalten. Fehlende oder gemischte Load-Daten werden nicht zu einem gemeinsamen Wert zusammengefasst.
- Check-in-Mittelwerte enthalten jeweils die Anzahl der tatsächlich vorhandenen Messwerte, darunter HRV, Ruhepuls, Schlaf, Body Battery und Garmin-Stress, soweit vorhanden. Es wird kein Readiness-Score erzeugt.
- Dokumentierte VO₂max-Werte werden über bis zu 180 Tage für Performance-Fragen deskriptiv verglichen; Messanzahl, erster und letzter Wert sowie Veränderung werden ausgewiesen, ohne daraus eine gesicherte physiologische Anpassung abzuleiten.
- Kanu-Aktivitäten werden anhand der gespeicherten Aktivitätstypen Kayaking (K1), C1 und C2 gruppiert. Dokumentiertes Rennformat (`raceFormat`) und dokumentierte Wasserart (`waterConditions.type`, ersatzweise `waterType`) werden deskriptiv ausgewiesen; fehlende Zuordnungen bleiben sichtbar.
- Hinterlegte Wettkampfergebnisse werden nach Disziplin und Format gruppiert; Anzahl und beste dokumentierte Platzierung werden ausgewiesen. Das ist keine standardisierte Leistungsdiagnostik.
- Geplante Einheiten werden als Planung und nicht als absolviertes Training ausgegeben.
- Saisonfragen mit explizitem Saisonbezug bzw. Jahresangabe wählen den vollständigen verfügbaren Historienmodus.

## Bewusste Grenzen der ersten Ausbaustufe

Die Zusammenfassung ist noch keine vollständige sportwissenschaftliche Analyse-Engine. Insbesondere fehlen derzeit:

- eine weitergehende, sportartspezifische Intensitätsverteilung über Garmin-HF-Zonen hinaus (manuelle RPE-Intensitätsklassifikation, weitere Datenquellen und validierte Trainingszonen),
- eine methodisch abgesicherte, sportartspezifische Vergleichslogik für K1/C1/C2, Classic/Sprint sowie Wildwasser/Flachwasser. Die neue Gruppierung beschreibt zunächst nur die dokumentierte Trainingsverteilung und erlaubt noch keine Leistungsvergleiche,
- standardisierte Leistungs- und Testvergleiche sowie die Validierung von VO₂max-Schätzungen gegenüber sportartspezifischer Leistungsdiagnostik,
- ein wissenschaftlich kuratierter Evidenzkatalog mit Quellenabruf (in der aktuellen Coach-Version noch nicht angebunden),
- eine fachlich validierte Entscheidungslogik, die aus den Kennzahlen eine konkrete Trainingsdosierung ableitet.

Diese Punkte dürfen nicht durch freie Modellinterpretation ersetzt werden. Bis sie umgesetzt und fachlich freigegeben sind, muss der Coach seine Aussagen entsprechend begrenzen.

## Datenschutz und Verhalten

- Es werden nur die bereits ausgewählten und authentifiziert zugeordneten App-Daten in den bestehenden Coach-Kontext aufgenommen.
- Es werden keine neuen Datenbanktabellen oder externen Speicher angelegt.
- Der Coach bleibt passiv und darf weder Trainingsplan noch Kalender oder gespeicherte Daten verändern.

## Datenmodell-Hinweis

- `rawActivities[].duration` wird in Minuten geführt. Die Analyseaggregation übernimmt diesen Wert direkt; eine Division durch 60 wäre eine fehlerhafte Umrechnung.
- K1 wird im Aktivitätseditor als `Kayaking` gespeichert; C1 und C2 als `C1` bzw. `C2`.
- Rennformat wird als `raceFormat` (`classic`/`sprint`) gespeichert.
- Wasserart wird in `waterConditions.type` (`wildwater`/`flatwater`) gespeichert. Der Coach-Kontext überträgt nur die freigegebenen strukturierten Felder dieser Unterstruktur.

## Verifikation

Die Portierung auf den aktuellen V2-Stand wurde begonnen. Die adaptive Herzfrequenzzonenberechnung benötigt Ruhepulswerte aus dem jeweiligen Aktivitätszeitraum; diese werden separat und datensparsam für die Berechnung ausgewählt. Die Änderungen wurden nicht durch Tests ausgeführt. Es erfolgte kein Merge und kein Deployment. Die Integration muss vor Aktivierung in der App in einem späteren, ausdrücklich freigegebenen Verifikationsschritt geprüft werden.
