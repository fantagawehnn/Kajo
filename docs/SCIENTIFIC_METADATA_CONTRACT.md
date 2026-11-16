# KAJO – Metadatenvertrag für wissenschaftliche Quellen und Evidenz

**Status:** Fachlicher Implementierungsentwurf, nicht migriert  
**Stand:** 16.11.2026  
**Geltungsbereich:** Ausdauersport mit Schwerpunkt Kanusport  
**Zweck:** Einheitliche, nachvollziehbare Metadaten für Import, Kuration, Suche und Coach-Ausgaben.

## 1. Grundprinzip: drei unterschiedliche Ebenen

KAJO trennt bibliografische Quelle, untersuchte Studie und einzelne Evidenzaussage. Diese Ebenen dürfen nicht in einem einzigen Feld zusammenfallen.

1. **Quelle (publication/source):** bibliografische Publikation, z. B. Artikel, Review oder Leitlinie.
2. **Studienkontext (study):** Population, Sportart, Disziplin, Design, Setting und Intervention der darin beschriebenen Untersuchung. Ein Review kann mehrere Studien und Populationen umfassen.
3. **Befund (finding):** konkrete Ergebnis-/Aussageeinheit mit Outcome, Richtung, Einschränkungen und Fundstelle.

Ein Paper kann mehrere Studienkontexte und mehrere Befunde enthalten. Wenn eine Publikation mehrere Sportarten, Populationen oder Interventionen untersucht, darf nicht ein einzelner pauschaler Sportkontext für alle Ergebnisse gesetzt werden. Wo die Granularität nicht zuverlässig extrahiert werden kann, bleibt die Zuordnung auf Quellenebene und wird als solche gekennzeichnet.

## 2. Bibliografische Quellenmetadaten

Pflicht bzw. soweit vorhanden:

- Titel im Originalwortlaut
- Autoren in Originalreihenfolge und -schreibweise
- Publikationsjahr
- Publikationstyp
- Journal/Verlag bzw. Konferenz
- DOI und/oder stabile Quell-URL
- Sprache
- Abstract nur, wenn rechtmäßig verfügbar
- Zugriffs-/Rechtsgrundlage und Lizenznotiz
- Volltextstatus: nicht vorhanden, Link-only, privat bereitgestellt oder rechtmäßig im Bestand gespeichert
- Review-/Kurationsstatus

Bibliografische Angaben werden nicht aus Modellwissen vervollständigt. Nicht verifizierte Werte bleiben unbekannt und erhalten bei Bedarf einen Prüfstatus.

## 3. Kontrollierte Sportkontext-Taxonomie

Sportkontext wird als strukturierte, kombinierbare Dimensionen gespeichert. Nicht jede Dimension ist für jede Publikation relevant.

| Feld | Kontrollierte Werte / Format | Regel |
|---|---|---|
| `sport_domain` | `endurance_sport`, `paddlesport`, `other_sport`, `general_exercise`, `unknown` | Grobe Einordnung; keine Disziplinableitung |
| `sport` | kontrollierter Sport-Slug, z. B. `canoe`, `kayak`, `rowing`, `cycling`, `running`, `swimming`, `other`, `unknown` | Nur wenn im Paper belegt |
| `canoe_discipline` | `wildwater_racing`, `canoe_sprint`, `canoe_slalom`, `canoe_marathon`, `other_canoe`, `unknown`, null | Nur bei Kanubezug; spätere Erweiterung versionieren |
| `boat_class` | `K1`, `C1`, `C2`, `other`, `not_reported`, null | Mehrfachwerte möglich; nur explizit berichtet |
| `wildwater_format` | `classic`, `sprint`, `not_applicable`, `not_reported`, null | Ausschließlich Wildwasserrennsport; nicht mit Canoe Sprint verwechseln |
| `water_environment` | `whitewater`, `flatwater`, `pool_tank`, `not_applicable`, `not_reported`, null | Setting nur übernehmen, wenn berichtet |
| `study_setting` | `laboratory`, `field`, `training`, `competition`, `recovery`, `mixed`, `not_reported` | Kann als Mehrfachkontext nötig sein |
| `activity_role` | `primary_sport`, `supplementary_training`, `comparison_group`, `not_reported` | Beschreibt Rolle innerhalb der Studie, nicht automatisch das Nutzerziel |

**Wichtige Abgrenzung:** `canoe_sprint` bezeichnet die eigenständige olympische Flachwasserdisziplin. `wildwater_format = sprint` bezeichnet dagegen das Sprintformat im Kanu-Wildwasserrennsport. Beide dürfen nicht unter einem gemeinsamen, mehrdeutigen Feld `Sprint` gespeichert werden.

Für die erste Version werden K1/C1/C2 und Wildwasser Classic/Sprint als relevante Filterdimensionen geführt. Andere Kanudisziplinen bleiben erweiterbare Taxonomieoptionen; ihre Aufnahme behauptet keine vorhandene Datenabdeckung.

## 4. Studiendesign und Population

### 4.1 Studiendesign

Kontrollierte Werte:

- `systematic_review`
- `meta_analysis`
- `randomized_trial`
- `controlled_trial`
- `observational`
- `cross_sectional`
- `case_study`
- `consensus_guideline`
- `narrative_review`
- `methodological`
- `other`
- `unknown`

Die Kategorien beschreiben die methodische Anlage. Sie sind keine automatische Rangfolge der Qualität.

### 4.2 Population

Wenn berichtet, strukturiert speichern:

- Leistungsniveau: `elite`, `trained`, `recreational`, `untrained`, `mixed`, `other`, `not_reported`
- Geschlecht/sex reporting: Originalangabe bzw. Studiendefinition; keine Ableitung aus Namen oder Bildern
- Alter: berichtete Spanne oder Kennwerte mit Originaleinheit
- Stichprobengröße: getrennt nach Gesamtstichprobe und relevanten Gruppen
- Gesundheits-/Trainingsstatus nur soweit wissenschaftlich relevant und im Paper berichtet

Keine pauschale Übertragung von Erwachsenen-, Männer-, Freizeit- oder Laborstichproben auf Elite-Kanuathletinnen bzw. andere Zielgruppen ohne explizite Begründung.

## 5. Themen und Outcomes

- `topics` klassifizieren den thematischen Schwerpunkt der Quelle bzw. des Befunds, z. B. Ausdauerphysiologie, Energiestoffwechsel, Trainingsbelastung, Regeneration oder Leistungsdiagnostik.
- `outcome` bezeichnet die tatsächlich gemessene Zielgröße, z. B. VO2max, Laktat, Zeit, Leistung, Herzfrequenz oder HRV.
- Messmethode, Einheit, Messzeitpunkt und Testprotokoll sind – soweit verfügbar – getrennte Metadaten.
- Ein Topic-Slug ersetzt keine präzise Outcome-Definition.
- Ergebnisse unterschiedlicher Messverfahren dürfen nicht allein wegen ähnlicher Bezeichnungen als direkt vergleichbar gelten.

## 6. Transferierbarkeit und Evidenzqualität getrennt halten

### 6.1 Transferierbarkeit zum angefragten KAJO-Kontext

Kontrollierte Werte für das Retrieval:

- `direct_canoe`: die konkrete Studie untersucht Kanusport und einen für die Frage passenden Kontext.
- `related_paddlesport`: andere, verwandte Paddelsportart.
- `other_endurance`: andere Ausdauersportart.
- `general_sport_science`: allgemeine Trainings-/Bewegungswissenschaft ohne direkten Sportbezug.
- `unclear`: Angaben reichen nicht für eine belastbare Zuordnung.

Zusätzlich wird eine kurze Begründung verlangt. Das Label ist immer relativ zur konkreten Fragestellung. Eine Studie kann für eine allgemeine Regenerationsfrage relevant, für eine spezifische C1-Wildwasser-Sprintfrage aber nur indirekt übertragbar sein.

### 6.2 Evidenzqualität

In der ersten Version kein automatischer Gesamtscore. Getrennt dokumentiert werden:

- Studiendesign
- Stichprobe und Population
- Messverfahren und Datenqualität
- Bias-/Limitationen, sofern bewertet
- Präzision/Unsicherheit der Ergebnisse, sofern berichtet
- Interessenkonflikte und Finanzierung, sofern berichtet
- Status der fachlichen Prüfung

Ein Review oder eine randomisierte Studie wird nicht allein anhand des Publikationstyps als hochwertig oder unmittelbar sportartspezifisch eingestuft.

## 7. Fundstellen und Provenienz

Jeder extrahierte Befund muss, soweit technisch möglich, auf folgende Provenienz verweisen:

- source_id und document_id
- chunk_id oder andere stabile Textreferenz
- PDF-Seitenbereich und/oder Abschnittsüberschrift
- Extraktionsstatus: automatisch extrahiert, manuell geprüft, kuratiert
- Originaltextauszug bzw. knappe strukturierte Paraphrase mit Rückverfolgbarkeit

Fehlt ein zuverlässiger Seitenbezug, darf keiner erfunden werden. Automatisch extrahierte Befunde bleiben ungeprüft, bis eine fachliche Prüfung dokumentiert ist.

## 8. Umgang mit fehlenden und mehrdeutigen Angaben

- Fehlende Angabe ist nicht gleich null, „nein“ oder „nicht zutreffend“.
- `not_reported` bedeutet, dass das Paper die Information nicht berichtet.
- `unknown` bedeutet, dass sie noch nicht verlässlich klassifiziert wurde.
- `not_applicable` bedeutet, dass die Dimension für den untersuchten Kontext tatsächlich nicht anwendbar ist.
- SQL-NULL bedeutet, dass kein Wert gesetzt wurde; die semantische Bedeutung muss über Status/Erfassungsregeln klar sein.
- Keine Ableitung von Bootsklasse, Gewässer, Wettkampfformat oder Leistungsniveau aus Titel, Autoren, Institution oder allgemeinem Wissen.
- Mehrfachwerte sind zulässig, wenn eine Publikation mehrere Kontexte tatsächlich untersucht; die Zuordnung soll dann möglichst auf Studien- oder Befundebene erfolgen.

## 9. Zuordnung zum bestehenden Entwurf

Dieser Vertrag präzisiert die bestehenden Dokumente:

- `SPORT_SCIENCE_TAXONOMY.md`: kontrollierte Themen- und Sportkontextwerte.
- `SCIENTIFIC_KNOWLEDGE_SCHEMA_DRAFT.md`: spätere relationale Abbildung in Quelle, Studie, Befund und Zuordnungstabellen.
- `SCIENTIFIC_COACH_RETRIEVAL_CONTRACT.md`: Rückgabe der tatsächlich verfügbaren Kontext- und Transferierbarkeitsmetadaten.

Die aktuelle DDL-Skizze enthält noch keine vollständige Studien-/Befundstruktur und keine vollständigen Sportkontextfelder. Diese Lücke wird bewusst dokumentiert und nicht durch unüberprüfte SQL-Felder kaschiert.

## 10. Nicht umgesetzt / nächste Freigabepunkte

- Keine Datenbanktabellen oder Spalten ergänzt.
- Keine Migration erstellt oder angewendet.
- Keine Taxonomie in der App oder im Import-Frontend aktiviert.
- Keine Paper automatisch klassifiziert.
- Vor SQL-Umsetzung: Metadatenmodell fachlich freigeben, bestehende Remote-Struktur erneut abgleichen und Migrationen reconciliieren.
- Vor produktiver Nutzung: kontrollierte Werte versionieren, Kuration und Rechteprüfung festlegen sowie Klassifikationsqualität anhand realer Paper evaluieren.
