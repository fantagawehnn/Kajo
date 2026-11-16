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

## 6. Sportwissenschaftliche Taxonomie

Mindestens folgende Unterscheidungen müssen filterbar sein:

- Sportbereich: Ausdauersport, Kanusport und weitere tatsächlich unterstützte Sportarten.
- Kanusport: K1, C1, C2.
- Wettkampfformat: Classic, Sprint.
- Gewässer: Wildwasser, Flachwasser.
- Evidenzkontext: direkte Kanustudie, andere Ausdauersportart, allgemeine Trainings-/Bewegungswissenschaft.
- Studientyp: Interventionsstudie, Beobachtungsstudie, Review, Meta-Analyse, Positionspapier, methodische Arbeit.
- Messkontext: Labor, Feld, Training, Wettkampf.

Allgemeine Ausdauerforschung darf nicht als direkte Evidenz für Kanusport dargestellt werden. Jede Übertragung braucht eine sichtbare Kennzeichnung und eine kurze Begründung.

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

## 8. Noch nicht umgesetzt

- Keine Scientific-Knowledge-Tabellen
- Keine Vektor-Extension aktiviert
- Keine Embedding-Modelle festgelegt
- Keine Storage-Buckets oder Storage-Policies für Paper
- Keine PDF-Extraktion oder Chunking-Pipeline
- Keine Retrieval-Funktion oder Worker-Integration
- Keine SQL-Migration angewendet

## 9. Referenzen

- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Supabase Semantic Search: https://supabase.com/docs/guides/ai/semantic-search
- Supabase Vector Columns: https://supabase.com/docs/guides/ai/vector-columns
