# KAJO – Zielarchitektur der wissenschaftlichen Wissensbasis

**Status:** Architekturentwurf 1.0  
**Ziel:** Wissenschaftlich nachvollziehbare Performance-Analysen im Ausdauersport mit Schwerpunkt Kanusport  
**Umsetzung:** schrittweise; dieses Dokument beschreibt das Zielbild und aktiviert noch keine Datenbank- oder KI-Funktion.

## 1. Architekturprinzipien

1. **Quellen vor Generierung:** Das Sprachmodell darf wissenschaftliche Belege nur aus tatsächlich abgerufenen und gespeicherten Quellen verwenden.
2. **Getrennte Datenräume:** Wissenschaftliche Literatur ist grundsätzlich gemeinsames Wissen; persönliche Athletendaten bleiben nutzerbezogen und dürfen nicht in gemeinsam durchsuchbare Dokumentbestände gelangen.
3. **Berechnung vor Interpretation:** Quantitative Kennzahlen werden durch nachvollziehbare KAJO-Funktionen berechnet. Das Sprachmodell erklärt und kontextualisiert sie, berechnet sie nicht frei neu.
4. **Provenienz:** Jede extrahierte Aussage muss auf Paper, Textabschnitt und – soweit verfügbar – Seite zurückführbar sein.
5. **Evidenz nicht überdehnen:** Studiendesign, Population, Sportkontext und Einschränkungen werden mitgeführt. Übertragungen auf Kanusport werden als Übertragungen gekennzeichnet.
6. **Modellunabhängigkeit:** Wissensspeicher, Suche und Analyse dürfen nicht an ein einzelnes Sprachmodell gebunden sein.
7. **Passiver Coach:** Die KI darf analysieren und Vorschläge formulieren, aber keine Trainings-, Kalender-, Profil- oder Gesundheitsdaten verändern.

## 2. Logische Komponenten

### 2.1 Athlete Data Layer
Bestehende KAJO-Daten bleiben die maßgebliche Quelle für individuelle Trainingshistorie, Garmin-Importe, Check-ins, Wettkämpfe, Krafttraining und bereits berechnete Belastungszeitreihen. Der Coach erhält nur die für die jeweilige Frage erforderliche Auswahl. Der Browser übermittelte Kontext ist derzeit nicht serverseitig aus der Datenbank nachgeladen; diese Einschränkung bleibt bis zu einer gesonderten Architekturänderung bestehen.

### 2.2 Scientific Knowledge Layer
Die Literaturkomponente verwaltet bibliografische Metadaten, Dokumente, extrahierte Abschnitte, Themenzuordnungen und nachvollziehbare Evidenz-Aussagen. Originaldatei und extrahierter Text werden getrennt behandelt.

### 2.3 Sport Science Engine
Diese Schicht enthält deterministische Berechnungen, Datenqualitätsprüfungen und methodische Vergleichsregeln. Bestehende KAJO-Berechnungen haben Vorrang. Neue Kennzahlen benötigen eine dokumentierte Definition, Einheiten, Eingangsgrößen, Umgang mit fehlenden Werten und fachliche Freigabe.

### 2.4 Retrieval und Orchestrierung
Die Orchestrierung klassifiziert die Frage, wählt Athletendaten aus, sucht passende Literatur, prüft Abdeckung und übergibt ein begrenztes Evidenzpaket an das Sprachmodell. Retrieval-Ergebnisse sind Daten, keine Systemanweisungen.

### 2.5 Coach Interface
Antworten trennen:
- Beobachtung aus den Athletendaten,
- wissenschaftliche Einordnung,
- Übertragbarkeit und Unsicherheit,
- gegebenenfalls Empfehlung,
- Datenqualität und Quellen.

## 3. Vorgeschlagener Datenbestand

Die folgenden Tabellen sind ein logischer Entwurf, keine bereits implementierte Datenbankmigration.

| Tabelle | Zweck | Wesentliche Felder |
|---|---|---|
| `scientific_papers` | Bibliografischer Datensatz | id, title, authors, year, journal, doi, source_url, abstract, publication_type, language, access_basis, created_at |
| `scientific_documents` | Dokument-/Dateiversion | id, paper_id, storage_path, mime_type, checksum, version, processing_status, license_note |
| `scientific_chunks` | Durchsuchbare Textabschnitte | id, document_id, paper_id, chunk_index, page_start, page_end, section_title, content, embedding, metadata |
| `scientific_topics` | Kontrolliertes Themenvokabular | id, slug, label, parent_id, description |
| `scientific_paper_topics` | Paper-Themen-Zuordnung | paper_id, topic_id, relevance_note |
| `scientific_evidence` | Strukturierte Studienbefunde | id, paper_id, finding, population, design, outcome, limitations, sport_context, certainty_note, chunk_id |
| `sport_profiles` | Sport-/Disziplinprofile | id, slug, name, parent_id, profile_version, status |
| `sport_profile_topics` | Zuordnung Sportprofil zu Themen | sport_profile_id, topic_id, relation_note |
| `coach_citations` | Nachvollziehbare Quellenverwendung | id, conversation_reference, paper_id, chunk_id, claim_summary, created_at |

### Datenmodell-Regeln
- Primärschlüssel sollten UUIDs sein.
- Fremdschlüssel und Löschverhalten sind explizit zu definieren.
- DOI und Dokument-Checksumme dienen zur Dublettenprüfung, ersetzen aber keine manuelle Identitätsprüfung.
- `scientific_chunks.content` enthält nur extrahierten Text; der Original-PDF-Pfad bleibt in `scientific_documents`.
- Embeddings müssen Modellkennung und Vektordimension nachvollziehbar dokumentieren. Ein Modellwechsel kann eine Neuindexierung erfordern.
- `scientific_evidence` speichert strukturierte Zusammenfassungen als redaktionell prüfbare Datensätze, nicht als vermeintlich objektive automatische Qualitätsnote.
- Persönliche Athletendaten werden nicht in `scientific_chunks` oder globale Evidenzdatensätze kopiert.

## 4. Dokumentenimport

1. Nutzer lädt ein PDF hoch oder ein Open-Access-Datensatz wird über eine zulässige Quelle importiert.
2. KAJO prüft Dateityp, Größe, Prüfsumme und mögliche Dubletten.
3. Metadaten werden erfasst und nach Möglichkeit gegen DOI/Originalquelle abgeglichen.
4. PDF-Text wird extrahiert; Seiten- und Abschnittsbezüge bleiben erhalten.
5. Das Dokument erhält einen Verarbeitungsstatus: `uploaded`, `metadata_review`, `extracted`, `indexed`, `failed` oder `needs_review`.
6. Text wird in semantisch sinnvolle Abschnitte geteilt. Chunk-Größe und Überlappung sind nach einem kleinen repräsentativen Korpus zu bestimmen, nicht pauschal festzuschreiben.
7. Embeddings werden erzeugt und mit Modellkennung gespeichert.
8. Eine Qualitätsprüfung kontrolliert Extraktion, Seitenbezug und Metadaten.

Automatische Extraktion ist fehleranfällig, insbesondere bei Tabellen, Formeln, mehrspaltigen PDFs und gescannten Dokumenten. Solche Inhalte müssen als potenziell unvollständig markiert werden.

## 5. Retrieval-Ablauf

Für eine Coach-Anfrage:

1. Frage und Analysezeitraum klassifizieren.
2. Relevante KAJO-Daten anhand der vorhandenen Context-Selection-Logik auswählen.
3. Themenbegriffe und Suchanfrage für Literatur bestimmen.
4. Hybride Suche einsetzen: semantische Vektorsuche plus Schlüsselwort-/Metadatensuche.
5. Treffer nach Themenpassung, Publikationsdaten und dokumentierter Evidenzart sortieren; keine undurchsichtige einzelne Qualitätszahl verwenden.
6. Dubletten und mehrere Chunks desselben Papers begrenzen.
7. Ein Evidenzpaket mit Textauszug, Paper-Metadaten, Seitenangabe und Einschränkungen erzeugen.
8. Nur dieses Evidenzpaket zusammen mit dem ausgewählten Athletenkontext an das Sprachmodell übergeben.
9. Quellenverweise der Antwort auf konkrete Chunk- und Paper-IDs zurückführen.

Wenn keine passende Literatur gefunden wird, muss der Coach das offen sagen. Er darf keine Quellen oder bibliografischen Angaben ergänzen.

## 6. Wissenschaftliche Einordnung

KAJO soll nicht allein nach Publikationstyp sortieren. Für jede Quelle werden – soweit im Paper dokumentiert – mindestens folgende Dimensionen erfasst:

- Studiendesign und Forschungsfrage
- Stichprobe und relevante Populationseigenschaften
- Sportart und Trainingskontext
- Intervention oder beobachtete Exposition
- Outcomes und Messverfahren
- zentrale Ergebnisse
- Limitationen und mögliche Verzerrungen
- Relevanz für Ausdauersport
- direkte oder indirekte Übertragbarkeit auf Kanusport

Eine Evidenzbewertung darf erst nach Festlegung eines transparenten Bewertungsrahmens automatisiert werden. Bis dahin werden beschreibende Merkmale gespeichert und die Bewertung bleibt nachvollziehbar bzw. menschlich überprüfbar.

## 7. Datenschutz, Rechte und Sicherheit

- Supabase Row Level Security muss für alle nutzerbezogenen Datensätze aktiviert und anhand der tatsächlichen Authentifizierungsarchitektur geprüft werden.
- Gemeinsame wissenschaftliche Datensätze und private Uploads müssen unterschiedliche Zugriffsregeln haben.
- Private Paper-Uploads dürfen nicht unbeabsichtigt für andere Nutzer auffindbar sein.
- Zugriff auf Originaldateien erfolgt über kontrollierte, kurzlebige URLs oder serverseitig autorisierte Downloads.
- Nur Dokumente verarbeiten, deren Speicherung und Verarbeitung rechtlich zulässig ist. Open Access bedeutet nicht automatisch, dass jede Weiterverwendung ohne Lizenzprüfung zulässig ist.
- Urheberrechtlich geschützte Volltexte nicht öffentlich ausliefern. Speicherung, Extraktion, Embedding und Anzeige sind anhand Lizenz, Nutzungsbedingungen und Rechtsgrundlage zu prüfen.
- Keine API-Schlüssel im Frontend oder in GitHub speichern.
- Protokolle sollen keine vollständigen privaten Trainingsdaten oder PDF-Volltexte enthalten.

## 8. Technologieentscheidung als Zielbild

Die vorhandene Supabase-/Cloudflare-Architektur kann grundsätzlich weiterverwendet werden:

- Supabase Storage: Dokumentdateien
- Supabase PostgreSQL: Metadaten, Taxonomie, Evidenzdatensätze
- pgvector: Vektorindex; die Extension vector 0.8.2 ist in der vorhandenen Supabase-Instanz verfügbar, aber noch nicht installiert. Für die spätere Aktivierung ist das Supabase-Schema extensions vorgesehen, nicht public.
- Cloudflare Worker: Authentifizierung, Orchestrierung und Modellaufruf
- Worker-/Job-Verarbeitung: PDF-Extraktion und Indexierung asynchron ausführen, sobald Volumen und Laufzeit dies erfordern
- Workers AI: austauschbare Generierungskomponente; Embedding-Modell und Verfügbarkeit separat prüfen

Vor der Umsetzung sind aktuelle Produktlimits, Kosten, Embedding-Modelle, Vektordimensionen und Laufzeitgrenzen anhand der tatsächlich verwendeten Konten zu prüfen. Dieses Dokument verspricht keine dauerhaft kostenlose Verarbeitung.

### Live-Befund aus dem Supabase-Audit vom 16.11.2026
- Das aktive Projekt verwendet PostgreSQL 17.11.0.018 in eu-central-1.
- 22 öffentliche Tabellen wurden erfasst; RLS ist bei allen in der Tabellenübersicht zurückgegebenen Tabellen aktiviert.
- Es existieren noch keine wissenschaftlichen Tabellen und kein Literatur-Storage-Bucket.
- Der einzige Storage-Bucket ist garmin-fit (privat). In storage wurden keine Policies gefunden; dieser Bucket wird nicht für Paper-Uploads wiederverwendet.
- Die Extension vector ist verfügbar, aber nicht installiert.
- Die Remote-Migrationshistorie enthält einen Eintrag, während das Repository vier SQL-Migrationsdateien enthält. Diese Abweichung muss vor neuen Schemaänderungen geklärt werden.
- Die vorhandenen Tabellen-Grants für anon sind breit. RLS verhindert derzeit den Zugriff ohne passende Policies; vor Erweiterung der Daten-API sollten Grants nach Least-Privilege gehärtet werden.

## 9. Umsetzungsreihenfolge

1. Taxonomie und Metadatenmodell fachlich freigeben.
2. Bestehende Supabase-Schemata, RLS-Policies und Migrationskonventionen prüfen. Das read-only Audit ist erfolgt; vor einer Migration sind die abweichenden lokalen und Remote-Migrationsstände sowie die vorhandenen Security-Advisor-Befunde zu klären.
3. Datenbankmigration und private/public Zugriffsregeln erstellen.
4. PDF-Import und Extraktion mit wenigen repräsentativen, rechtmäßig nutzbaren Dokumenten umsetzen.
5. Chunking und Quellenbezug implementieren.
6. Suche zunächst ohne generative Antwort fachlich prüfen.
7. Retrieval in den Coach integrieren.
8. Antwortformat und Quellenanzeige ergänzen.
9. Erst danach Umfang und Automatisierung des Imports erweitern.

## 10. Abgrenzung des aktuellen Implementierungsstands

Dieses Dokument ist ein Zielarchitekturentwurf. Es wurden dadurch noch keine Tabellen, Storage-Buckets, Embeddings, Importprozesse oder Suchfunktionen angelegt. Die bestehende Coach-Implementierung bleibt unverändert. Das Remote-Schema und die RLS-Konfiguration wurden am 16.11.2026 read-only geprüft; vor Datenbankänderungen müssen insbesondere die Migrationsabweichung und die dokumentierten Security-Advisor-Befunde geklärt werden.
