# KAJO – Schemaentwurf für die Scientific Knowledge Base

**Status:** Entwurf, nicht ausführbar und nicht angewendet  
**Stand:** 16.11.2026  
**Ziel:** Relationale, quellengebundene Literatur- und Evidenzdatenbank für Ausdauersport mit Schwerpunkt Kanusport.

Dieses Dokument konkretisiert die Zielarchitektur. Es ist ausdrücklich **keine Supabase-Migration**. Es wurden keine Tabellen, Policies, Buckets oder Extensions verändert.

## 1. Vorbedingungen

Vor einer Migration sind folgende Punkte zu erledigen:

1. Die vier SQL-Dateien in \`supabase/migrations\` mit der Remote-Migrationshistorie abgleichen. Remote ist derzeit nur ein Migrationseintrag dokumentiert.
2. Die offenen Security-Advisor-Befunde bewerten. Keine bestehenden Funktionen oder Policies ohne Prüfung der Abhängigkeiten ändern.
3. Das Embedding-Modell festlegen und Dimension, Sprache, Lizenzbedingungen, Laufzeit und Kosten dokumentieren.
4. Die vector-Extension in einem eigenen, freigegebenen Schritt im Schema \`extensions\` installieren. Sie ist verfügbar, aber aktuell nicht installiert.
5. Den Kurations-/Admin-Berechtigungsmechanismus festlegen. Keine Rechte aus \`user_metadata\` für Autorisierung verwenden.

## 2. Datenräume

### 2.1 Gemeinsamer Literaturbestand

Enthält nur Metadaten, extrahierte Inhalte und Dokumente, deren Speicherung und Nutzung für KAJO rechtlich zulässig ist. Sichtbar für angemeldete KAJO-Nutzer, aber nur durch vertrauenswürdige serverseitige Prozesse oder autorisierte Kuratoren veränderbar.

### 2.2 Private Uploads

Vom Nutzer hochgeladene Paper bleiben standardmäßig privat. Sie dürfen nicht in der gemeinsamen Suche erscheinen und nicht in gemeinsame Evidenzdatensätze kopiert werden, solange keine ausdrückliche Freigabe und Rechteprüfung erfolgt ist.

### 2.3 Persönliche Athletendaten

Trainingsdaten, Check-ins, Profile und Gesundheitsinformationen bleiben vollständig getrennt. Sie werden weder in Paper-Chunks noch in gemeinsame Evidenzdatensätze geschrieben.

## 3. Vorgeschlagene Tabellen

| Tabelle | Zweck | Kernfelder |
|---|---|---|
| \`scientific_sources\` | Bibliografische Quelle | id, title, authors, year, journal, doi, source_url, abstract, language, publication_type, access_basis, license_note, review_status |
| \`scientific_documents\` | Datei- und Extraktionsversion | id, source_id, owner_id, visibility, storage_path, mime_type, checksum, version, processing_status, extraction_version |
| \`scientific_chunks\` | Suchbare Abschnitte | id, document_id, source_id, owner_id, visibility, chunk_index, page_start, page_end, section_title, content, embedding, embedding_model, embedding_version |
| \`scientific_topics\` | Kontrollierte Themen | id, slug, label, parent_id, description |
| \`scientific_source_topics\` | Quellen-Themen-Zuordnung | source_id, topic_id, relevance_note |
| \`scientific_evidence\` | Strukturierte Studienbefunde | id, source_id, chunk_id, study_design, population, sport_context, intervention, outcome, finding, limitations, transferability, certainty_note |
| \`scientific_sport_profiles\` | Sport- und Disziplinprofile | id, slug, name, parent_id, taxonomy_version |
| \`scientific_evidence_sports\` | Evidenz-Sport-Zuordnung | evidence_id, sport_profile_id, relation_type, transferability_note |

### Regeln für Metadaten und Inhalte

- Alle Primärschlüssel als UUID; Fremdschlüssel und Löschverhalten explizit.
- DOI und SHA-256-Prüfsumme zur Dublettenprüfung nutzen, nicht als alleinige Identitätsprüfung.
- DOI-Eindeutigkeit gilt nur für den gemeinsamen Katalog. Private Uploads dürfen dieselbe DOI mehrfach enthalten und nicht mit privaten Uploads anderer Nutzer oder einem Shared-Eintrag kollidieren. Ein nicht eindeutiger Index unterstützt die Suche innerhalb privater Uploads.
- Autoren als strukturierte Liste speichern; Original-Schreibweise und Reihenfolge erhalten.
- Seiten- und Abschnittsbezüge pro Chunk speichern.
- Embedding-Modell, Modellversion und Dimension pro Indexgeneration dokumentieren.
- Chunk-Inhalte nicht ohne Rechteprüfung öffentlich ausliefern.
- Automatisch extrahierte Befunde bleiben als solche gekennzeichnet und benötigen fachliche Prüfung, bevor sie als kuratierte Evidenz gelten.

## 4. Zugriffskonzept

### Gemeinsame Quellen

- SELECT: nur \`authenticated\` und nur Quellen mit freigegebenem Status und gemeinsamer Sichtbarkeit.
- INSERT/UPDATE/DELETE: nicht direkt aus dem Browser. Pflege über vertrauenswürdige serverseitige Prozesse oder ein ausdrücklich autorisiertes Kurationsmodell.
- Keine pauschalen Grants an \`anon\`.

### Private Dokumente

- SELECT: nur wenn \`owner_id = auth.uid()\`.
- INSERT: nur mit \`owner_id = auth.uid()\`, oder über eine serverseitig geprüfte Upload-Funktion.
- UPDATE/DELETE: nur durch den Eigentümer oder vertrauenswürdige serverseitige Prozesse.
- Für Chunks dieselbe Sichtbarkeitsregel wie für das zugehörige Dokument. Die RLS-Policy muss die Parent-Dokumentberechtigung prüfen; ein vom Client frei gesetztes \`visibility\`-Feld darf nicht genügen.

### Storage

- Bestehender Bucket \`garmin-fit\` bleibt ausschließlich für Garmin-Dateien.
- Private Paper erhalten einen eigenen privaten Bucket.
- Objektpfade müssen eine eindeutige Nutzerzuordnung enthalten, z. B. \`users/<auth.uid()>/<document-id>/original.pdf\`.
- Policies werden auf \`storage.objects\` separat angelegt. Tabellen-RLS vererbt sich nicht auf Storage.
- Gemeinsame Open-Access-Quellen müssen nicht zwingend als PDF gespeichert werden; bevorzugt Metadaten und zulässige Quell-URLs speichern. Volltexte nur bei passender Lizenz/Nutzungsgrundlage.

## 5. Vektor- und Hybrid-Suche

Die Vektorspalte darf erst nach Modellentscheidung typisiert werden. Eine feste Dimension wird nicht vorweggenommen.

- Einheitliches Embedding-Modell für Dokument-Chunks und Suchanfragen.
- Modellwechsel erzeugt eine neue Indexgeneration und erfordert Re-Embedding.
- Vektorsuche mit Metadatenfiltern kombinieren: Sprache, Sportart, Disziplin, Themen, Studiendesign, Publikationsjahr, Zugriffsstatus.
- Ergänzend Volltext-/Schlüsselwortsuche einsetzen. Relevanz nicht allein anhand semantischer Ähnlichkeit bestimmen.
- Suchfunktion begrenzt die Zahl der zurückgegebenen Chunks und liefert Source-ID, Chunk-ID, Seitenbereich und Metadaten.
- Private Treffer müssen durch RLS und zusätzlich durch Parent-Dokumentberechtigungen geschützt bleiben.

## 6. Sportwissenschaftliche Taxonomie und Metadatenebenen

Die verbindlichen Felddefinitionen und kontrollierten Werte sind in `docs/SCIENTIFIC_METADATA_CONTRACT.md` beschrieben. Für das spätere Schema gelten insbesondere:

- Quelle, Studienkontext und einzelner Befund sind getrennte Ebenen. Ein Review kann mehrere Studienkontexte und Befunde umfassen.
- Sportbereich, Sportart, Kanudisziplin, Bootsklasse, Wildwasserformat, Gewässerumgebung und Studien-Setting sind getrennte Dimensionen.
- K1/C1/C2 sind Bootsklassen, keine eigenständigen Disziplinen.
- `canoe_sprint` (Flachwasserdisziplin) darf nicht mit `wildwater_format = sprint` (Sprintformat im Wildwasserrennsport) vermischt werden.
- Messkontext (Labor/Feld/Training/Wettkampf/Regeneration) ist getrennt vom Sport- bzw. Disziplinbezug zu speichern.
- Themenklassifikation, Studiendesign, Population, Outcome, Transferierbarkeit und Evidenzqualität sind unterschiedliche Metadaten.
- Fehlende, nicht berichtete und nicht anwendbare Angaben müssen unterscheidbar bleiben.

Die aktuelle DDL-Skizze bildet diese Struktur noch nicht vollständig ab. Insbesondere fehlen relationale Studien- und Befundentitäten sowie die vollständigen Kontextzuordnungen. Vor der Migration muss das logische Modell deshalb überarbeitet werden; die bestehende DDL darf nicht als vollständige Umsetzung der Taxonomie verstanden werden.

Allgemeine Ausdauerforschung darf nicht als direkte Evidenz für Kanusport dargestellt werden. Jede Übertragung braucht eine sichtbare, fragestellungsbezogene Kennzeichnung und eine kurze Begründung.

## 7. Retrieval-Vertrag zum Coach

Jeder abgerufene Evidenztreffer muss mindestens enthalten:

- source_id und chunk_id
- Titel, Autor(en), Jahr und DOI/Quell-URL, soweit vorhanden
- Seiten- oder Abschnittsbezug
- Textauszug
- Sportart-/Disziplinbezug
- Studiendesign und Population, soweit dokumentiert
- Einschränkungen und Transferability-Label

Der Worker darf nur aus tatsächlich übergebenen Evidenztreffern zitieren. Ohne Treffer muss der Coach offenlegen, dass keine passende Literaturquelle abgerufen wurde. Das Modell darf keine bibliografischen Angaben ergänzen.

## 8. Migrations- und Sicherheitsleitplanken

- Die vorhandene Remote-Migrationshistorie ist nicht deckungsgleich mit den vier SQL-Dateien im Repository. Eine neue Migration darf erst nach dokumentierter Reconciliation erstellt und angewendet werden.
- Die Remote-Tabellen zeigen teilweise breite Grants für `anon` und `authenticated`, darunter Rechte, die über normale CRUD-Operationen hinausgehen. Neue Knowledge-Base-Tabellen sollen davon ausdrücklich nicht abgeleitet werden.
- RLS schützt Zeilen, nicht jede Tabellenoperation. Insbesondere TRUNCATE-Rechte müssen separat betrachtet werden.
- Bestehende Coach-Zugriffs-Policies verwenden `has_active_coach_access(uuid)`. Diese Funktion und ihre SECURITY DEFINER-Eigenschaften werden durch die Knowledge-Base-Einführung nicht verändert.
- Der bestehende private Bucket `garmin-fit` bleibt unberührt. Paper erhalten einen getrennten privaten Bucket mit eigenen `storage.objects`-Policies.

## 9. Noch nicht umgesetzt

- Keine Scientific-Knowledge-Tabellen
- Keine Vektor-Extension aktiviert
- Keine Embedding-Modelle festgelegt
- Keine Storage-Buckets oder Storage-Policies für Paper
- Keine produktive PDF-Extraktion oder dauerhafte Chunking-Pipeline (lokaler PDF.js-Vorschau-PoC ist inzwischen vorhanden)
- Keine Retrieval-Funktion oder Worker-Integration
- Keine SQL-Migration angewendet

## 10. Referenzen

- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Supabase Semantic Search: https://supabase.com/docs/guides/ai/semantic-search
- Supabase Vector Columns: https://supabase.com/docs/guides/ai/vector-columns


## 11. Status- und Retrieval-Gating

Der SQL-Entwurf unter `docs/drafts/SCIENTIFIC_KNOWLEDGE_PHASE1_DDL_DRAFT.sql` wurde nach einer RLS-Prüfung präzisiert:

- `manual_review_required` ist ein eigener technischer Dokumentstatus für Scans bzw. nicht zuverlässig extrahierbare PDFs.
- Private Chunks sind nur lesbar, wenn das Parent-Dokument `private_ready` ist und der Parent-Source dem authentifizierten Nutzer gehört.
- Shared-Chunks sind nur lesbar, wenn das Dokument `review_pending` ist und die übergeordnete Quelle `approved` ist.
- Chunks aus `pending`, `uploaded`, `extracting`, `extracted`, `failed`, `rejected` oder `manual_review_required` sind nicht über die normale authentifizierte SELECT-Policy sichtbar.

Diese Regeln betreffen ausschließlich den Entwurf. Die Migration wurde nicht angewendet; vor Umsetzung sind Policy-Syntax und tatsächliche Grants weiterhin separat zu prüfen.

## 12. Transaktionsentwurf für die Ingestion

Für die spätere private Chunk-Persistenz wurde `docs/drafts/SCIENTIFIC_INGESTION_RPC_DRAFT.sql` ergänzt. Der Entwurf fügt Status-/Umfangsfelder am Dokument hinzu und beschreibt drei eng begrenzte RPCs: Extraktion beanspruchen, Chunk-Batches idempotent speichern und die Extraktion erst nach lückenloser Chunk-Prüfung auf `private_ready` setzen.

Die RPCs sind als `SECURITY INVOKER` konzipiert; Ausführung ist nur für `service_role` vorgesehen. Die Edge Function bleibt für JWT-Validierung, Eigentumsprüfung und private Sichtbarkeit verantwortlich, bevor sie einen RPC-Aufruf ausführt. Die RPCs sind nicht für Browser-Aufrufe freigegeben und erlauben keine Freigabe gemeinsamer Quellen.

Der SQL-Entwurf ist nicht angewendet. Er muss mit der tatsächlichen Remote-Schemaversion, den bestehenden Grants und der Migration-Historie abgeglichen werden. Insbesondere bleibt zu entscheiden, wie Upload-Verifikation, Abbruch/Resume und die Kennzeichnung von PDFs ohne extrahierbaren Text umgesetzt werden.


## 13. DOI-Deduplizierung nach Datenraum

Die DOI-Unique-Constraint im ersten DDL-Entwurf war zu weit gefasst: Ein global eindeutiger DOI-Index hätte private Uploads nutzerübergreifend kollidieren lassen. Der Index ist deshalb auf Quellen mit `visibility = 'shared'` begrenzt. Für private Uploads gibt es nur einen nicht eindeutigen Suchindex über Eigentümer und normalisierte DOI. Damit können mehrere Nutzer dieselbe Publikation privat hochladen; ebenso bleibt ein privater Upload neben einem kuratierten Shared-Datensatz möglich. Diese Korrektur ist ausschließlich im Entwurf vorgenommen und noch nicht auf Supabase angewendet.


## 14. Präzisierung durch Metadatenvertrag

`docs/SCIENTIFIC_METADATA_CONTRACT.md` ist die fachliche Referenz für die Trennung von Quelle, Studie und Befund sowie für Sportkontext, Population, Studiendesign, Outcomes, Transferierbarkeit und Provenienz. Die DDL muss vor einer späteren Migration an diesen Vertrag angepasst werden. Bis dahin bleiben alle zusätzlichen Felder konzeptionell und nicht produktiv.
