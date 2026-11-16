# KAJO – Migrationsreihenfolge Scientific Knowledge Base

**Stand:** 16.11.2026  
**Branch:** `integration/coach-ai-v2-latest`  
**Status:** Ausführungsreihenfolge als Entwurf; keine Migration angelegt oder ausgeführt.

## 1. Grundsatz: Erst Baseline klären

Die bestehende Supabase-Migrationshistorie ist nicht deckungsgleich mit dem Repository. Remote existiert ein Historieneintrag (`20261115224846_garmin_activity_sync_days`), während vier ältere SQL-Dateien im Branch liegen und ihre beschriebenen Schemaänderungen teilweise bereits remote sichtbar sind.

Daher werden die wissenschaftlichen SQL-Entwürfe vorerst **nicht** nach `supabase/migrations/` kopiert und erhalten noch keine Versionsnummer. Zuerst muss die bestehende Baseline reproduzierbar dokumentiert und das zulässige Vorgehen für die abweichende Historie geklärt werden. Keine alten Migrationen rückwirkend registrieren, neu ausführen oder umbenennen, nur um die Historie optisch anzugleichen.

## 2. Vorgesehene Reihenfolge

| Reihenfolge | Artefakt | Abhängigkeiten | Ergebnis |
|---|---|---|---|
| 0 | Remote-/Repository-Baseline | vollständiger Schema-, Grant-, Policy- und History-Abgleich | Freigegebene Ausgangsbasis und eindeutige neue Versionskennung |
| 1 | `SCIENTIFIC_KNOWLEDGE_PHASE1_DDL_DRAFT.sql` | Baseline abgeschlossen | `scientific_sources`, `scientific_documents`, `scientific_document_chunks`, RLS und Tabellenrechte |
| 2 | `SCIENTIFIC_INGESTION_RPC_DRAFT.sql` | Phase-1-Tabellen vorhanden | Upload-Intent-, Extraktions-, Chunk- und Completion-RPCs sowie Extraktions-/Upload-Checkpoint-Spalten |
| 3 | `SCIENTIFIC_UPLOAD_CLEANUP_RPC_DRAFT.sql` | Phase-1-Tabellen und Upload-Checkpoint-Spalten vorhanden | Cleanup-Claim-/Lease-Spalten und -RPCs |
| 4a | Bucket `kajo-scientific-documents` | Dateigrößenlimit und MIME-Regeln entschieden | Separater privater Bucket; nicht `garmin-fit` |
| 4b | `SCIENTIFIC_STORAGE_POLICIES_DRAFT.sql` | Tabellen, Upload-Intent-RPC, Cleanup-Spalten und privater Bucket vorhanden | INSERT-only-Policy für exakt autorisierte Upload-Intents |
| 5 | `scientific-ingestion` Edge Function | Migrationen 1–3, Bucket und Policy, Function-Secrets | Authentifizierte Upload-/Status-/Extraktionsaktionen |
| 6 | Frontend-TUS-Modul | Function und Bucket konfiguriert; Uploadvertrag im Zielprojekt verifiziert | Kontrollierter, resumierbarer PDF-Upload |
| 7 | `scientific-upload-cleanup` Edge Function | Cleanup-RPCs, Bucket und eigener Trigger-Secret | Serverseitige, deaktiviert startende Bereinigung |
| 8 | Scheduler | Cleanup-Function separat verifiziert; Secret und Monitoring vorhanden | Periodischer Cleanup-Aufruf mit kleiner Batchgröße |
| 9 | Ende-zu-Ende-Freigabe | Alle obigen Schritte und explizite Testfreigabe | Aktivierung nach kontrollierter Verifikation |

Die Reihenfolge 4a/4b ist bewusst geteilt: Die Bucket-Konfiguration wird separat über einen unterstützten Storage-Verwaltungsweg erstellt und geprüft. Der Policy-Entwurf enthält nur eine kommentierte Bucket-Vorlage und ist kein vollständiges Bucket-Provisioning.

## 3. Vertragsabhängigkeiten

### 3.1 Tabellen und RPCs

- Phase 1 muss vor allen RPC-Entwürfen angewendet werden.
- Der Ingestion-RPC-Entwurf ergänzt die Spalten `extraction_page_count`, `expected_chunk_count`, `extracted_character_count`, `extraction_completed_at`, `upload_confirmed_at` und `upload_intent_expires_at`.
- Der Cleanup-RPC-Entwurf ergänzt `upload_cleanup_claimed_at`, `upload_cleanup_claim_token` und `upload_cleanup_quiesced_at`.
- Der Cleanup-Claim liefert `document_id`, `source_id`, `owner_id`, `storage_path`, `claim_token`, `lease_expires_at` und `cleanup_ready_at). Die Function validiert den Objektpfad als `owner_id/document_id/original.pdf`. `source_id` ist ausdrücklich nicht die Nutzer-ID.
- Alle RPCs sind als `SECURITY INVOKER` mit leerem `search_path` vorgesehen; die vorgesehenen Ausführungsrechte liegen ausschließlich bei `service_role`. Die Edge Functions bleiben daher die Authentifizierungs- und Autorisierungsgrenze.

### 3.2 Storage

- Bucket-ID in Frontend und Functions: `kajo-scientific-documents`.
- Bucket muss privat sein und ein explizites positives Dateigrößenlimit sowie PDF-MIME-Regeln besitzen.
- Die INSERT-Policy setzt voraus, dass authentifizierte Nutzer ihren eigenen `pending`-Dokumentdatensatz lesen dürfen, damit die `EXISTS`-Prüfung funktioniert.
- Die Policy muss nach Anlage der Cleanup-Spalte erstellt werden, weil sie `upload_cleanup_claim_token is null` prüft.
- Browser-Uploads verwenden `upsert=false`; direkte Browser-SELECT-/UPDATE-/DELETE-Policies sind nicht vorgesehen.
- Der Bucket darf nicht durch SQL-Metadatenmanipulation als bereits korrekt konfiguriert angenommen werden. Vorhandene Bucket-Konfiguration muss geprüft werden.

### 3.3 Function- und Frontend-Reihenfolge

- `scientific-ingestion` benötigt reguläre Nutzer-JWTs und serverseitige Supabase-Secrets. Es erhält keinen Cleanup-Bypass.
- `scientific-upload-cleanup` ist separat und verwendet einen eigenen zufälligen Trigger-Secret plus deaktivierenden Feature-Schalter. `verify_jwt = false` ist nur zusammen mit dieser eigenen Authentifizierung vertretbar.
- Die TUS-Frontend-Datei ist vorbereitet, aber noch nicht in den App-Flow integriert. Sie darf nicht als nutzbarer Uploadprozess kommuniziert werden.
- Der Scheduler wird zuletzt eingerichtet. Vorher darf keine periodische Cleanup-Ausführung gestartet werden.

## 4. Nicht-rerun-sichere Stellen

Die SQL-Entwürfe sind keine idempotenten Reparaturskripte. Insbesondere:
- Phase-1-DDL verwendet reguläre `CREATE TABLE`- und `CREATE POLICY`-Anweisungen.
- Die RPC-Entwürfe verwenden `CREATE OR REPLACE FUNCTION`, aber enthalten auch Constraint-Anlagen, die bei wiederholter Ausführung kollidieren können.
- Die Storage-Policy wird ohne vorherige Existenzprüfung angelegt.
- Die Cleanup-RPC- und Storage-Policy-Entwürfe müssen als zusammengehöriger Vertragsstand versioniert werden.

Eine spätere echte Migration muss als einmalig angewendete, transaktional geprüfte Migration aus der geklärten Baseline entstehen. Vorher sind SQL-Syntax, Grants, Policies und Remote-Abhängigkeiten fachlich zu reviewen. Ein fehlgeschlagener oder teilweise angewendeter Vorgang darf nicht durch blindes Wiederholen „repariert“ werden.

## 5. Vor der ersten Migration noch erforderlich

1. Remote-Schema und vorhandene vier Migrationen vollständig abgleichen; Historienabweichung klären.
2. Prüfen, ob die wissenschaftlichen Tabellen oder gleichnamige Policies inzwischen angelegt wurden.
3. Default Privileges und effektive Rechte von `service_role` sowie `authenticated` gegen den Entwurf prüfen.
4. Die SQL-Entwürfe gemeinsam statisch reviewen; insbesondere Constraints, Funktionssignaturen, Rückgabespalten und Policy-Subqueries.
5. Bucket-Dateigrößenlimit anhand des tatsächlichen Upload- und Browserverhaltens festlegen.
6. Den TUS-Uploadvertrag mit der konkreten Supabase-Storage-Konfiguration verifizieren.
7. Erst danach neue Migrationen mit eindeutigen, noch nicht verwendeten Zeitstempeln erstellen.

## 6. Aktueller Aktivierungsstand

- Keine wissenschaftliche Migration in `supabase/migrations/` erstellt.
- Keine SQL-Datei ausgeführt und keine Migration rückwirkend registriert.
- Keine Tabelle, RPC, Policy, Bucket oder Extension in Supabase angelegt.
- Keine Secrets gesetzt und keine Edge Function deployed.
- Kein Scheduler eingerichtet.
- Keine Tests ausgeführt.
- Kein Merge, Rebase oder Production-Deployment.

**Nächster sicherer Schritt:** den Remote-Baseline-Abgleich für die wissenschaftlichen Objekte unmittelbar vor einer späteren Migration wiederholen und die Migrationshistorie mit Supabase CLI/Dashboard-Prozess klären. Bis dahin bleibt die Implementierung in Entwurfs- und Scaffold-Status.


## 7. Nachprüfung vom 16.11.2026 – Baseline weiterhin gesperrt

Die erneute read-only Abfrage der Remote-Migrationshistorie und der Tabellen-/Policy-/Funktionsmetadaten ist am 16.11.2026 wegen eines Supabase-Connection-Timeouts fehlgeschlagen. Die Remote-Baseline konnte in diesem Durchgang daher nicht aktualisiert werden. Die in älteren Auditnotizen festgehaltenen Remote-Objekte sind nur der zuletzt bekannte Stand.

Die statische Vertragsprüfung bestätigt im Repository:
- Ingestion-Request und Edge-Function erwarten dieselben Felder.
- Der Cleanup-Claim liefert getrennte `source_id` und `owner_id`; der Storage-Pfad wird gegen `owner_id/document_id/original.pdf` geprüft.
- Die Storage-Policy ist für neue Uploads mit `upsert=false` als INSERT-only entworfen. Das entspricht der aktuellen Supabase-Dokumentation; TUS im Zielprojekt bleibt ungetestet.
- Supabase dokumentiert eine TUS-Upload-URL-Gültigkeit von bis zu 24 Stunden. Die zusätzliche Cleanup-Karenz bleibt eine vorsichtige Designannahme, keine Laufzeitgarantie.

**Entscheidung unverändert:** Keine Migrationen erzeugen oder anwenden, bis die Remote-Migrationshistorie und das tatsächliche Schema wieder zuverlässig lesbar sind. Keine Tests oder Deployments.
