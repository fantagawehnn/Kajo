# KAJO – Reconciliation der Supabase-Migrationen

**Stand:** 16.11.2026  
**Branch:** \`integration/coach-ai-v2-latest\`  
**Status:** Read-only-Audit; keine Migration ausgeführt.

## 1. Warum ein Abgleich notwendig ist

Die Remote-Migrationshistorie des Supabase-Projekts enthält nur einen Eintrag (\`20261115224846_garmin_activity_sync_days\`). Im Repository liegen vier SQL-Dateien, deren Schemaänderungen teilweise bereits remote sichtbar sind. Die Datenbank ist daher nicht allein anhand der Migrationstabelle reproduzierbar.

## 2. Abgleichmatrix

| Änderung | Repository-Datei | Remote-Schema | Remote-Historie | Bewertung |
|---|---|---|---|---|
| Garmin-Telemetrie-Tabelle | \`20261115000100_garmin_activity_telemetry.sql\` | Tabelle vorhanden; SELECT, INSERT und UPDATE Policies sichtbar | Kein passender Eintrag | Änderung remote vorhanden, aber Historie nicht zugeordnet |
| Garmin-Sync-Tage | \`202611150001_garmin_activity_sync_days.sql\` | Tabelle vorhanden; RLS aktiv, keine Policy | Ein Eintrag mit anderem Zeitstempel/Version | Historieneintrag vorhanden; Policylosigkeit laut Advisor bestätigt |
| Push-Zustelltracking | \`20261115000200_kajo_push_delivery_tracking.sql\` | Spalte \`last_sent_local_date\` vorhanden | Kein passender Eintrag | Änderung remote vorhanden, aber Historie nicht zugeordnet |
| Telemetrie-UPDATE-Policy | \`20261115000300_garmin_activity_telemetry_update_policy.sql\` | UPDATE-Grant und UPDATE-Policy sichtbar | Kein passender Eintrag | Änderung remote vorhanden, aber Historie nicht zugeordnet |

## 3. Was daraus nicht geschlossen werden darf

- Es ist nicht belegt, dass die Änderungen manuell im SQL Editor ausgeführt wurden.
- Es ist nicht belegt, dass eine Migration fehlgeschlagen ist.
- Es ist nicht belegt, dass die Remote-Migrationshistorie vollständig oder aktuell ist.
- Die vorhandenen Tabellen dürfen nicht blind erneut erstellt oder geändert werden.
- Der Eintrag \`20261115224846\` darf nicht ohne Prüfung als identisch mit dem Repository-Dateinamen \`202611150001_garmin_activity_sync_days.sql\` behandelt werden.

## 4. Sichere Vorgehensweise

1. Vor jeder Schemaänderung den vollständigen Inhalt aller vier Dateien und den Remote-Zustand der betroffenen Tabellen, Constraints, Indizes, Grants, Policies und Trigger vergleichen.
2. Die Historie des ursprünglichen Entwicklungs- und Deploymentprozesses ermitteln, soweit sie in GitHub, Supabase CLI oder Dashboard noch verfügbar ist.
3. Den tatsächlichen Zustand als Baseline dokumentieren.
4. Keine alten Migrationen rückwirkend als ausgeführt markieren, bevor die offizielle Supabase-Migrationskonvention und deren Auswirkungen geprüft wurden.
5. Neue Migrationen ausschließlich additiv und mit einer noch nicht verwendeten Versionskennung entwerfen.
6. SQL-Dateien vor Ausführung fachlich und sicherheitstechnisch reviewen.
7. Migrationen nur nach ausdrücklicher Freigabe anwenden.

## 5. Sicherheitsaspekte für neue Migrationen

- Neue wissenschaftliche Tabellen erhalten keine pauschalen Rechte für \`anon\`.
- Tabellenrechte und RLS-Policies werden getrennt festgelegt.
- Keine unnötigen Rechte wie TRUNCATE, TRIGGER oder REFERENCES an Browserrollen vergeben.
- Private Uploads und deren Chunks müssen durch Eigentümer- und Parent-Dokument-Prüfungen geschützt werden.
- Bestehende Coach-Policies und \`has_active_coach_access(uuid)\` werden nicht als Nebeneffekt verändert.
- \`garmin-fit\` bleibt dem Garmin-Bereich vorbehalten.
- Die Installation von \`vector\` erfolgt separat, nachdem Embedding-Modell und Dimension festgelegt sind.

## 6. Freigabestatus

Nicht durchgeführt:
- Keine Schemaänderung.
- Keine Änderung an \`supabase_migrations.schema_migrations\`.
- Keine Policy- oder Grant-Anpassung.
- Keine Extension-Installation.
- Keine Tests, kein Merge und kein Deployment.


## 7. Migrationssperre für Scientific Knowledge Base

Die wissenschaftlichen SQL-Entwürfe bleiben unter `docs/drafts/`. Sie werden nicht als nummerierte Migrationen nach `supabase/migrations/` kopiert, solange die Remote-Historie nicht reconciled ist. Die geplante Abfolge von DDL, Ingestion-RPCs, Cleanup-RPCs, Bucket, Storage-Policies, Functions, TUS und Scheduler ist in [SCIENTIFIC_KNOWLEDGE_MIGRATION_SEQUENCE.md](./SCIENTIFIC_KNOWLEDGE_MIGRATION_SEQUENCE.md) dokumentiert. Es wurden keine wissenschaftlichen Objekte angelegt oder Migrationen ausgeführt.
