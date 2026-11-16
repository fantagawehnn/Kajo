# KAJO – Taxonomie für Sportwissenschaft und Sportprofile

**Version:** 1.1 – Entwurf  
**Geltungsbereich:** Ausdauersport mit Schwerpunkt Kanusport  
**Zweck:** Einheitliches Vokabular für Paper-Metadaten, Literatur-Retrieval und sportartspezifische Kontextualisierung.

Diese Taxonomie ist zunächst ein Klassifikationsschema. Sie behauptet nicht, dass für jeden Themenbereich bereits kanuspezifische Evidenz vorliegt. Die Zuordnung eines Papers zu einem Thema ist eine Metadatenentscheidung und kein Qualitätsurteil.

## 1. Übergeordnete wissenschaftliche Themen

| Topic-Slug | Themenbereich | Beispiele für Suchbegriffe |
|---|---|---|
| `endurance-physiology` | Ausdauerphysiologie | aerobe Kapazität, VO2max, Sauerstoffaufnahme |
| `energy-systems` | Energiestoffwechsel | oxidative und glykolytische Energiebereitstellung |
| `thresholds` | Schwellen und Intensitätsbereiche | Laktatschwelle, ventilatorische Schwellen |
| `high-intensity-training` | Hochintensives Training | HIIT, Sprintintervalle, wiederholte intensive Belastung |
| `training-load` | Trainingsbelastung | externe und interne Belastung, sRPE |
| `periodization` | Trainingsperiodisierung | Makro-, Meso- und Mikrozyklen, Tapering |
| `strength-conditioning` | Kraft und Athletik | Maximalkraft, Schnellkraft, Kraftausdauer |
| `neuromuscular` | Neuromuskuläre Aspekte | Ermüdung, Koordination, neuromuskuläre Leistung |
| `recovery` | Regeneration | Erholung, Ermüdungsmanagement |
| `sleep` | Schlaf | Schlafdauer, Schlafqualität, Schlafverhalten |
| `hrv-autonomic` | HRV und autonome Regulation | HRV, RMSSD, Ruhepuls |
| `nutrition-hydration` | Ernährung und Flüssigkeit | Kohlenhydrate, Protein, Hydration |
| `injury-prevention` | Prävention und Belastungsverträglichkeit | Verletzungsrisiko, Prävention, Beschwerden |
| `performance-testing` | Leistungsdiagnostik | Feldtests, Labortests, Reliabilität |
| `technique-skill` | Technik und Fertigkeit | Technikökonomie, Bewegungskoordination |
| `competition-performance` | Wettkampfleistung | Pacing, Wettkampfstrategie, Wiederholungsbelastung |
| `environmental-factors` | Umweltbedingungen | Temperatur, Höhe, Wasser- und Wetterbedingungen |

## 2. Sportprofil-Hierarchie

### 2.1 Gemeinsamer Kern
- `endurance-sport`: übergeordnete Kategorie für Ausdauersport.
- `canoe-sport`: Kanusport als Schwerpunktmodul.

### 2.2 Kanusport – Disziplin- und Kontextdimensionen\n\nDie eigenständige Disziplin **Kanu-Sprint (Flachwasser)** ist strikt vom **Sprintformat im Wildwasserrennsport** zu unterscheiden. Ein gemeinsames Feld „Sprint“ wäre mehrdeutig. Die detaillierten kontrollierten Werte und Regeln stehen im `SCIENTIFIC_METADATA_CONTRACT.md`.

Diese Dimensionen sollten getrennt gespeichert werden, statt sie in einem einzelnen Freitextfeld zu vermischen:

| Dimension | Vorgesehene Werte / Beispiele |
|---|---|
| Bootsklasse | K1, C1, C2, andere nur nach späterer fachlicher Ergänzung |
| Kanudisziplin | Wildwasserrennsport, Kanu-Sprint (Flachwasser), Kanu-Slalom, Kanu-Marathon, andere / unbekannt |\n| Wildwasser-Wettkampfformat | Classic, Sprint; nur für Wildwasserrennsport |\n| Bootsklasse | K1, C1, C2, andere / nicht berichtet |
| Gewässer-/Umgebungskontext | Wildwasser, Flachwasser |
| Aktivitätsrolle | Hauptdisziplin, ergänzende Trainingsform |
| Trainingsziel | Technik, Ausdauer, Kraft, wettkampfspezifisch, Regeneration |
| Messkontext | Training, standardisierter Test, Wettkampf |
| Vergleichsbedingungen | Strecke, Dauer/Distanz, Wasserstand/Strömung, Wetter/Wind, soweit dokumentiert |

Die Werte sind Klassifikationsmerkmale. Sie ersetzen keine Prüfung, ob zwei Einheiten tatsächlich vergleichbar sind.

## 3. Ergänzende Ausdauersportarten

Laufen, Radfahren, Schwimmen und andere ergänzende Aktivitäten können in der Gesamtbelastung berücksichtigt werden, soweit die Daten und Messmethoden dies zulassen. Sie werden nicht automatisch zu eigenständigen Leistungszielen der Athletin bzw. des Athleten. Diese Unterscheidung folgt den im bestehenden KAJO-Coach-Regelwerk festgelegten Vorgaben.

## 4. Evidenz- und Übertragbarkeitsmerkmale

Jede Quelle sollte – sofern aus dem Paper feststellbar – mit folgenden kontrollierten Merkmalen versehen werden:

- `sport_specificity`: `direct_canoe`, `related_paddlesport`, `other_endurance`, `general_sport_science`, `unclear`
- `evidence_type`: `systematic_review`, `meta_analysis`, `randomized_trial`, `controlled_trial`, `observational`, `cross_sectional`, `case_study`, `consensus_guideline`, `narrative_review`, `other`, `unknown`
- `population_type`: z. B. elite, trained, recreational, mixed, unreported
- `study_context`: training, competition, laboratory, field_test, recovery, mixed, unknown
- `transferability_status`: keine globale Quelleneigenschaft; wird relativ zur konkreten Fragestellung als `direct_canoe`, `related_paddlesport`, `other_endurance`, `general_sport_science` oder `unclear` begründet.

Diese Merkmale beschreiben die Quelle. Sie ergeben nicht automatisch eine Evidenzstärke oder eine Empfehlung.

## 5. Retrieval-Regeln

1. Zuerst nach dem engsten passenden Sport- und Disziplinkontext suchen.
2. Falls die direkte kanuspezifische Literatur nicht ausreicht, schrittweise auf andere Ausdauersportarten und anschließend allgemeine Trainingswissenschaft erweitern.
3. In der Antwort sichtbar machen, aus welcher Ebene die Evidenz stammt.
4. Keine indirekte Evidenz als direkte Kanusport-Forschung darstellen.
5. Mehrere Publikationen aus derselben Stichprobe oder Forschungsgruppe nicht automatisch als unabhängige Bestätigung zählen.
6. Abstracts und Metadaten nicht so behandeln, als läge der vollständige Methoden- und Ergebnisteil vor.
7. Bei fehlendem Zugriff auf Volltext keine Aussagen zu nicht sichtbaren Details des Papers erfinden.

## 6. Offene fachliche Entscheidungen

Vor einer produktiven Taxonomie müssen noch geklärt werden:

- Welche Kanudisziplinen neben Wildwasserrennsport sollen in der ersten Version unterstützt werden?
- Welche Wettkampfformate werden tatsächlich in KAJO gespeichert?
- Welche Felder sind im aktuellen Aktivitätsmodell bereits vorhanden und welche müssten ergänzt werden?
- Welche Evidenzbewertungsmethode soll später verwendet werden?
- Welche Sprachen und Dokumenttypen sollen beim Import unterstützt werden?

Bis diese Fragen geklärt sind, bleiben die Kategorien erweiterbar und werden nicht als abschließende Sportwissenschaftssystematik verstanden.
\n\n## 7. Präzisierung des Metadatenmodells\n\nDie Version 1.1 trennt Kanudisziplin und Wettkampfformat. Insbesondere darf `canoe_sprint` (Flachwasserdisziplin) nicht mit `wildwater_format = sprint` gleichgesetzt werden. Außerdem werden Quelle, Studienkontext und einzelner Befund getrennt klassifiziert; ein Review kann mehrere Sportarten, Populationen und Befunde umfassen. Fehlende Angaben werden nicht inferiert.\n\nDie verbindlichen Felddefinitionen, Werte und Regeln sind in `docs/SCIENTIFIC_METADATA_CONTRACT.md` festgehalten. Die hier genannten Werte sind Entwurfswerte und noch nicht in Datenbank oder App aktiviert.\n