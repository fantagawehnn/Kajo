# KAJO – Supabase-Datenbestandsaudit

**Stand:** 14.11.2026  
**Geprüfter Branch:** `feat/coach-athlete-context-v2`  
**Zweck:** Bestandsaufnahme vor der Einführung einer wissenschaftlichen Wissensdatenbank.

## 1. Prüfungsumfang und Einschränkung

Geprüft wurden die Repository-Konfiguration und die aktuelle Remote-Datenbank read-only über Supabase-Management- und SQL-Abfragen. Es wurden keine Datenbankinhalte einzelner Nutzer gelesen und keine Änderungen vorgenommen.

Die frühere Codeprüfung vom 14.11.2026 wurde damit um einen Live-Schema-Audit am 16.11.2026 ergänzt. Die Ergebnisse beziehen sich auf den zu diesem Zeitpunkt aktiven Supabase-Stand.

## 2. Festgestellte Architektur

### 2.1 Authentifizierung
- `js/supabase-config.js` enthält die öffentliche Supabase-Projekt-URL und einen Publishable-Key.
- `js/supabase-client.js` erstellt daraus den Browser-Client mit `@supabase/supabase-js`.
- `js/auth.js` verwendet Supabase Auth für Registrierung, Login, Session-Wiederherstellung und Logout.
- Die Anwendung leitet die Benutzeridentität aus der authentifizierten Supabase-Session ab.

Der Publishable-/Anon-Key ist für die Browsernutzung vorgesehen und kein Ersatz für RLS. Privilegierte Schlüssel dürfen weiterhin ausschließlich serverseitig gespeichert werden.

### 2.2 Persönliche Trainingsdaten
`js/storage.js` und `js/user-storage.js` zeigen, dass die persönlichen Datensammlungen derzeit lokal und benutzerbezogen gespeichert werden:
- Aktivitäten
- geplante Einheiten
- Check-ins
- Gesundheitslogs
- Wettkämpfe
- Krafttraining und Kraft-Bestleistungen
- Supplements
- Profil und Einstellungen

Der lokale Speicherzugriff wird an die authentifizierte User-ID gebunden. Globale Legacy-Daten werden ausdrücklich nicht automatisch in ein Konto migriert.

### 2.3 Vorbereitete Cloud-Synchronisierung
`js/cloud-sync.js` implementiert einen vorbereiteten Zugriff auf:
- Tabelle `user_data`, Spalten `user_id`, `data`, `version`, `updated_at`
- RPC-Funktion `save_user_data` mit Parametern `p_data` und `p_expected_version`

Die Remote-Tabelle und RPC-Funktion sind vorhanden. Die Live-Definition von save_user_data bestätigt: SECURITY INVOKER, leerer search_path, Ermittlung der User-ID über auth.uid(), Prüfung auf JSON-Objekt und Versionskonfliktbehandlung. EXECUTE ist für authenticated und postgres, nicht für anon, vergeben.

Der Modulkommentar sagt weiterhin, dass die Synchronisierung vorbereitet und nicht automatisch gestartet wird. Die tatsächliche Aktivierung in der App ist davon getrennt.

### 2.4 Migrationen und Schema
Im aktuellen Repository existieren vier SQL-Migrationsdateien für Garmin-Telemetrie, Garmin-Sync-Tage und Push-Delivery-Tracking. Die Remote-Migrationsliste enthält zum Prüfzeitpunkt jedoch nur einen Eintrag (20261115224846, garmin_activity_sync_days). Repository-Migrationsdateien und Remote-Migrationshistorie sind damit nicht vollständig deckungsgleich und müssen vor weiteren Schemaänderungen abgeglichen werden.

Daraus folgt nicht, dass im Remote-Supabase-Projekt keine Tabellen existieren. Es bedeutet ausschließlich, dass deren Definitionen im untersuchten Branch nicht revisionssicher dokumentiert sind.

## 3. Sicherheitsbefunde und offene Nachweise

| Bereich | Befund aus Repository | Noch erforderlicher Nachweis |
|---|---|---|
| Authentifizierung | Supabase Auth im Browser implementiert | tatsächliche Auth-Konfiguration und Redirect-URLs |
| Publishable Key | öffentliche Konfiguration vorhanden | bestätigen, dass kein privilegierter Schlüssel verwendet wird |
| Persönliche Trainingsdaten | lokal und userbezogen gespeichert | tatsächliche lokale Daten-/Backupstrategie |
| `user_data` | vom Cloud-Sync-Modul erwartet | Remote-Tabellendefinition, Constraints und Indizes |
| `save_user_data` | RPC-Aufruf im Code vorhanden | Funktionsdefinition, SECURITY INVOKER/DEFINER, Grants und Suchpfad |
| RLS | keine Policy-Definition im Repository gefunden | tatsächliche RLS-Aktivierung und Policies im Remote-Projekt |
| Garmin-Daten | bestehende Edge Function wird laut Architektur wiederverwendet | Tabellen- und Policy-Nachweis sowie Function-Konfiguration |
| Wissenschaftliche Daten | noch kein Schema implementiert | getrennte öffentliche und private Zugriffsmodelle |

**Wichtig:** Es wäre nicht seriös, auf Basis des Browsercodes zu behaupten, dass die vorhandenen Tabellen oder RPC-Funktionen sicher sind. Insbesondere muss bei `save_user_data` geprüft werden, ob die Datenbankfunktion die User-ID serverseitig aus `auth.uid()` ableitet und nicht einer vom Client frei übergebenen ID vertraut.

## 4. Konsequenz für die Scientific Knowledge Base

Die Literaturdatenbank soll nicht in den bestehenden JSON-Snapshot `user_data.data` aufgenommen werden. Sie benötigt ein eigenes relationales Schema.

Vorgesehene Trennung:

### Gemeinsamer Literaturbestand
- bibliografische Paper-Metadaten
- rechtmäßig gespeicherte Dokumente
- extrahierte Textabschnitte und Embeddings
- Themenzuordnungen
- redaktionell prüfbare Evidenzdatensätze

### Private Dokumente und persönliche Inhalte
- private Paper-Uploads, sofern nicht zur gemeinsamen Nutzung freigegeben
- nutzerbezogene Notizen und Annotationen
- private Coach-Verläufe und Quellenverwendungsprotokolle, falls gespeichert

Die Trennung muss auf Datenbankebene durch RLS, Berechtigungen und gegebenenfalls getrennte Storage-Buckets/Policies abgesichert werden. Ein UI-Filter ist kein Sicherheitsmechanismus.

## 5. Empfohlene nächste Schritte

1. Remote-Schema des bestehenden Supabase-Projekts read-only erfassen.
2. Definition und Berechtigungen von `user_data` und `save_user_data` prüfen.
3. RLS-Policies der vorhandenen benutzerbezogenen Tabellen und Garmin-Tabellen dokumentieren.
4. Bestehende Migrationen aus dem ursprünglichen Projekt/Repository auffinden und als Referenz sichern.
5. Erst nach diesem Abgleich eine additive Migration für `scientific_papers`, `scientific_documents`, `scientific_chunks`, `scientific_topics` und Zuordnungstabellen entwerfen.
6. Storage- und Datenbankzugriffe für öffentliche Literatur und private Uploads getrennt definieren.

## 6. Nicht durchgeführt

- Kein Zugriff auf Remote-Datenbankinhalte.
- Keine Änderung an Supabase-Tabellen, Policies, Functions, Buckets oder Secrets.
- Keine SQL-Migration erstellt oder ausgeführt.
- Keine Tests ausgeführt.
- Kein Merge und kein Deployment.

## 7. Ergebnis

Die bestehende Anwendung hat Supabase Auth und einen vorbereiteten Cloud-Snapshot-Mechanismus. Die persönliche Trainingsdatenhaltung ist im geprüften Code weiterhin lokal. Das tatsächliche Remote-Schema und die RLS-Konfiguration sind vor einer neuen Datenbankmigration zu verifizieren.

Die nächste sinnvolle technische Aufgabe ist daher ein read-only Schema-Audit des bestehenden Supabase-Projekts, bevor das Scientific-Knowledge-Schema implementiert wird.


## 8. Ergebnisse des read-only Remote-Audits vom 16.11.2026

### 8.1 Projekt und Tabellen
- Supabase-Projekt: fantagawehnn's Project, Ref zgvargkfzgekokuisarv.
- Status: ACTIVE_HEALTHY; Region eu-central-1; PostgreSQL 17.11.0.018.
- Im Schema public wurden 22 Tabellen gefunden. Für alle in der Tabellenübersicht zurückgegebenen Tabellen ist RLS aktiviert.
- Vorhanden sind unter anderem user_data, user_profiles, activities, planned_sessions, daily_checkins, health_logs, competitions, strength_sessions sowie getrennte Garmin-Tabellen für Verbindungen, Metadaten, Details, Gesundheitsdaten, Sync-Status und Telemetrie.
- Es wurden keine Tabellen für wissenschaftliche Paper, Dokumente, Text-Chunks oder Evidenzdatensätze gefunden.

### 8.2 user_data und save_user_data
- public.user_data existiert mit user_id als Primärschlüssel, data jsonb, version bigint und updated_at.
- RLS-Policies erlauben authenticated das eigene INSERT, SELECT und UPDATE über auth.uid() = user_id. Eine DELETE-Policy ist nicht vorhanden.
- save_user_data(p_data jsonb, p_expected_version integer) existiert. Die Funktion ist SECURITY INVOKER, setzt einen leeren search_path, leitet die User-ID aus auth.uid() ab und prüft JSON-Objekt sowie Versionskonflikte.
- EXECUTE ist für authenticated und postgres vergeben; nicht für anon.
- Diese Funktion ist für die geplante Literaturdatenbank nicht zu verwenden: Der wissenschaftliche Bestand soll relational und getrennt vom persönlichen JSON-Snapshot bleiben.

### 8.3 RLS, Grants und Storage
- Die Tabellenübersicht bestätigt RLS auf allen 22 erfassten öffentlichen Tabellen.
- Die abgefragten Policies für persönliche Daten verwenden grundsätzlich auth.uid() als Eigentumsprüfung. Für mehrere Trainings- und Gesundheitsdaten-Tabellen existieren zusätzliche SELECT-Policies für aktive Coach-Zugriffe.
- Die Tabellen-Grants für anon und authenticated sind auf öffentlichen Tabellen sehr breit vergeben. Die aktuell gefundenen RLS-Policies richten sich bei persönlichen Daten an authenticated; für anon wurden dort keine entsprechenden Policies gefunden. RLS schützt damit derzeit die Zeilen, die pauschalen Grants sollten aus Least-Privilege-Sicht dennoch überprüft und reduziert werden.
- Storage enthält einen privaten Bucket garmin-fit. In storage wurden keine RLS-Policies gefunden. Es existiert kein eigener Bucket für wissenschaftliche Literatur oder private Paper-Uploads.
- garmin_personal_credentials und garmin_activity_sync_days haben laut Security Advisor RLS ohne Policies. Das kann einem bewusst serverseitigen Zugriff entsprechen; die Berechtigungen sollten vor einer späteren Nutzung durch Browser-Clients nicht erweitert werden.

### 8.4 Vektor-Suche
- Die Extension vector ist in Supabase mit Version 0.8.2 verfügbar, aber nicht installiert (installed_version = null).
- Eine Vektor-Suche kann daher noch nicht verwendet werden. Die Installation muss als explizite, additive Schemaänderung geplant werden.
- Embedding-Modell und Dimension sind vor der Tabellendefinition festzulegen; eine willkürliche Dimension würde spätere Modellwechsel erschweren.

### 8.5 Edge Functions und Security Advisor
- Aktive Edge Functions: garmin-personal (Version 42) und kajo-push-scheduler (Version 5). Beide werden in der Projektübersicht mit verify_jwt = false geführt; die jeweilige interne Authentifizierung ist bei Bedarf separat zu prüfen.
- Der Security Advisor meldet:
  - RLS ohne Policies bei garmin_activity_sync_days und garmin_personal_credentials.
  - veränderlichen search_path bei set_updated_at und set_user_data_version.
  - pg_net in Schema public.
  - öffentlich ausführbare SECURITY DEFINER-Funktionen handle_new_user() und has_active_coach_access(uuid).
  - deaktivierten Schutz vor kompromittierten Passwörtern.
- has_active_coach_access wird in bestehenden RLS-Policies zur Prüfung aktiver Coach-Beziehungen verwendet. Eine Änderung an dieser Funktion oder ihren Grants darf daher nicht ohne Prüfung der Coach-Zugriffslogik erfolgen.
- Diese Advisor-Befunde wurden dokumentiert, aber nicht verändert.

## 9. Konsequenzen für die Scientific Knowledge Base

1. Vor jeder neuen Migration müssen die vier Repository-Migrationen mit der Remote-Migrationshistorie abgeglichen werden.
2. Die vorhandenen persönlichen Trainingsdaten und user_data bleiben unverändert.
3. Der gemeinsame, frei zugängliche Literaturbestand und private Nutzer-Uploads benötigen getrennte Zugriffspfade.
4. Der private Upload-Bereich benötigt eine eigene Storage-Policy mit Nutzerzuordnung; der bestehende Garmin-Bucket wird nicht zweckentfremdet.
5. Die geplanten Paper- und Chunk-Tabellen benötigen RLS, dokumentierte Grants und klare Unterscheidung zwischen öffentlich kuratiertem Bestand und privaten Dokumenten.
6. Die Installation von vector und die Festlegung des Embedding-Modells sind noch nicht erfolgt.

## 10. Nicht durchgeführt
- Keine Tabellen, Policies, Funktionen, Buckets oder Secrets verändert.
- Keine Extension installiert.
- Keine Migration angewendet.
- Keine Tests ausgeführt.
- Kein Merge und kein Deployment.
