# KAJO – Supabase-Datenbestands- und Sicherheitsaudit

**Stand:** 16.11.2026  
**Geprüfter Branch:** \`integration/coach-ai-v2-latest\`  
**Zweck:** Read-only-Bestandsaufnahme vor der Einführung einer wissenschaftlichen Wissensdatenbank.

## 1. Prüfungsumfang

Geprüft wurden:
- Repository-Konfiguration und vorhandene SQL-Migrationsdateien.
- Remote-Projektstatus, Tabellen, Spalten, RLS-Aktivierung und Migrationseinträge.
- Ausgewählte Policies, Tabellenrechte und Funktionsdefinitionen.
- Supabase Security Advisor.
- Storage-Buckets und Storage-Policies.

Es wurden keine individuellen Trainings- oder Gesundheitsinhalte abgefragt. Es wurden keine Datenbankobjekte, Policies, Funktionen, Buckets, Extensions oder Secrets verändert. Es wurden keine Tests ausgeführt.

## 2. Projekt- und Datenbankbestand

- Projekt-Ref: \`zgvargkfzgekokuisarv\`
- Status zum Prüfzeitpunkt: \`ACTIVE_HEALTHY\`
- Region: \`eu-central-1\`
- PostgreSQL: \`17.11.0.018\`
- 22 Tabellen im Schema \`public\`; die Tabellenübersicht meldet für alle RLS aktiviert.
- Vorhandene Bereiche umfassen Nutzerprofile, Aktivitäten, geplante Einheiten, Check-ins, Gesundheitslogs, Wettkämpfe, Krafttraining, Garmin-Verbindungen, Garmin-Aktivitäten, Garmin-Gesundheitsdaten, Telemetrie und Push-Benachrichtigungen.
- Es wurden keine Tabellen für wissenschaftliche Paper, Dokumente, Text-Chunks, Embeddings oder Evidenzdatensätze gefunden.

### 2.1 Persönliche Daten und Cloud-Synchronisierung

Die App enthält lokale Datenspeicher-Module sowie einen vorbereiteten Cloud-Sync über:
- \`public.user_data(user_id, data, version, updated_at)\`
- \`public.save_user_data(p_data jsonb, p_expected_version integer)\`

Die Remote-Tabelle existiert. RLS-Policies erlauben authentifizierten Nutzern INSERT, SELECT und UPDATE für den eigenen Datensatz über \`auth.uid() = user_id\`; eine DELETE-Policy wurde nicht gefunden.

Die RPC-Funktion:
- läuft als \`SECURITY INVOKER\`,
- setzt einen leeren \`search_path\`,
- bezieht die User-ID aus \`auth.uid()\` statt aus einem Client-Parameter,
- prüft, dass \`p_data\` ein JSON-Objekt ist,
- behandelt Versionskonflikte,
- hat EXECUTE-Rechte für \`authenticated\` und \`postgres\`, nicht für \`anon\`.

Der Code-Kommentar beschreibt die Synchronisierung weiterhin als vorbereitet und nicht automatisch gestartet. Das Vorhandensein der Tabelle und Funktion beweist daher nicht, dass die App-Synchronisierung produktiv aktiviert ist.

## 3. Abgleich Repository-Migrationen und Remote-Historie

### 3.1 Repository-Dateien

Im geprüften Branch liegen folgende vier Dateien:

| Repository-Datei | Inhalt laut SQL-Datei |
|---|---|
| \`20261115000100_garmin_activity_telemetry.sql\` | Tabelle \`garmin_activity_telemetry\`, RLS, SELECT-/INSERT-Policies und Grants |
| \`202611150001_garmin_activity_sync_days.sql\` | Tabelle \`garmin_activity_sync_days\`, RLS-Aktivierung, Tabellenkommentar |
| \`20261115000200_kajo_push_delivery_tracking.sql\` | Spalte \`last_sent_local_date\` auf \`kajo_notification_schedules\` |
| \`20261115000300_garmin_activity_telemetry_update_policy.sql\` | UPDATE-Grant und UPDATE-Policy für Garmin-Telemetrie |

### 3.2 Remote-Befund

Die Remote-Migrationshistorie enthält zum Prüfzeitpunkt nur:
- Version \`20261115224846\`
- Name \`garmin_activity_sync_days\`

Die zugehörige Tabelle ist remote vorhanden. Die drei weiteren Repository-Migrationsdateien erscheinen nicht als eigene Einträge in der abgefragten Remote-Historie.

Gleichzeitig sind auch die von den anderen Dateien beschriebenen Änderungen remote sichtbar:
- \`garmin_activity_telemetry\` existiert.
- Die Tabelle besitzt SELECT-, INSERT- und UPDATE-Policies für \`authenticated\`.
- \`kajo_notification_schedules.last_sent_local_date\` existiert.

**Schlussfolgerung:** Der aktuelle Remote-Schemazustand enthält Änderungen, die in der Remote-Migrationshistorie nicht vollständig nachvollziehbar sind. Das kann beispielsweise durch manuelle Ausführung im SQL Editor oder eine abweichende Migrationserfassung entstanden sein; die konkrete Ursache wurde nicht festgestellt. Die Dateien dürfen deshalb nicht blind erneut ausgeführt oder als vollständig synchronisiert behandelt werden.

### 3.3 Auffälligkeit: Garmin-Sync-Tage

Die Migration für \`garmin_activity_sync_days\` aktiviert RLS, erstellt aber keine Policy. Der Security Advisor bestätigt, dass aktuell keine Policies für diese Tabelle existieren. Das kann beabsichtigt sein, wenn ausschließlich vertrauenswürdige serverseitige Funktionen mit privilegiertem Zugriff schreiben und lesen. Die tatsächliche Edge-Function-Nutzung und benötigten Berechtigungen müssen vor einer Änderung geprüft werden.

### 3.4 Erforderlicher Migrationsabgleich

Vor einer weiteren Migration:
1. Die vier SQL-Dateien gegen die tatsächlichen Remote-Definitionen und Policies abgleichen.
2. Für jede bereits vorhandene Änderung klären, ob und wie sie historisch registriert wurde.
3. Keine Migration rückwirkend in die Remote-Historie eintragen, ohne vorher den Supabase-Migrationszustand und die CLI-/Dashboard-Konventionen zu prüfen.
4. Eine neue, additive Migration mit einer noch nicht verwendeten Versionskennung erstellen.
5. Die neue Migration zunächst reviewen; eine Anwendung erfolgt nur nach ausdrücklicher Freigabe.

## 4. RLS, Policies und Tabellenrechte

### 4.1 Vorhandene Schutzregeln

Die geprüften persönlichen Tabellen verwenden überwiegend \`auth.uid()\` als Eigentumsprüfung. Für \`activities\`, \`daily_checkins\` und \`health_logs\` existieren zusätzlich SELECT-Policies für aktive Coach-Beziehungen über \`has_active_coach_access(user_id)\`.

Für Garmin-Daten sind die Policies stärker getrennt:
- Garmin-Verbindungen und Garmin-Gesundheitsdaten: SELECT für den jeweiligen Eigentümer.
- Garmin-Aktivitätsdetails: SELECT für den jeweiligen Eigentümer.
- Garmin-Telemetrie: SELECT, INSERT und UPDATE für den jeweiligen Eigentümer.
- Garmin-Personal-Credentials und Garmin-Sync-Tage: keine RLS-Policies; die Tabellen sind nicht für normale Browserzugriffe freigegeben.

### 4.2 Breite Tabellen-Grants

Die Abfrage der Tabellenrechte zeigte für mehrere persönliche Tabellen – darunter \`activities\`, \`daily_checkins\`, \`health_logs\`, \`user_data\`, \`garmin_activity_telemetry\` und \`garmin_activity_sync_days\` – breite Grants an \`anon\` und/oder \`authenticated\`. Teilweise umfassen diese Rechte neben SELECT/INSERT/UPDATE auch DELETE, TRUNCATE, REFERENCES und TRIGGER.

RLS schützt zeilenbezogene SELECT/INSERT/UPDATE/DELETE-Operationen, ersetzt aber keine minimale Vergabe von Tabellenrechten. Insbesondere ist TRUNCATE nicht durch normale RLS-Zeilenpolicies begrenzt. Die tatsächliche Erreichbarkeit einzelner SQL-Rechte über die verwendete API wurde in diesem Audit nicht getestet.

**Empfehlung:** Grants nach dem Least-Privilege-Prinzip prüfen und auf tatsächlich benötigte Rollen und Operationen begrenzen. Das darf nicht pauschal geschehen: Vorhandene App-Pfade, Coach-Zugriffe, Garmin-Edge-Functions, Upserts und administrative Prozesse müssen berücksichtigt werden. Es wurden keine Grants verändert.

## 5. Storage

- Der einzige gefundene Bucket ist \`garmin-fit\`; er ist privat.
- Für \`storage.objects\` wurden in der abgefragten Policy-Übersicht keine Policies zurückgegeben.
- Der Bucket ist für Garmin-FIT-Dateien vorgesehen und wird nicht für Paper-Uploads zweckentfremdet.
- Ein eigener Bucket und eigene Policies für wissenschaftliche Dokumente existieren noch nicht.

Für die Scientific Knowledge Base müssen private Nutzer-Uploads und gemeinsam kuratierte Quellen getrennt werden. Storage-Policies müssen den Objektpfad und die Dokumentberechtigung kontrollieren; Tabellen-RLS allein schützt keine Storage-Dateien.

## 6. Vektorsuche und Scientific Knowledge Base

- Die Extension \`vector\` ist in Version \`0.8.2\` verfügbar, aber nicht installiert.
- Es gibt keine wissenschaftlichen Tabellen und keine Embedding-Daten.
- Eine Vektorsuche ist daher aktuell nicht aktiv.
- Die Dimension der Embeddings darf erst nach Auswahl und Dokumentation des Embedding-Modells festgelegt werden.
- Die Extension soll, falls freigegeben, im Schema \`extensions\` installiert werden und nicht in \`public\`.

## 7. Security Advisor

Der Security Advisor meldete zum Prüfzeitpunkt:

| Befund | Einordnung |
|---|---|
| RLS ohne Policies auf \`garmin_activity_sync_days\` und \`garmin_personal_credentials\` | Kann für serverseitige Tabellen beabsichtigt sein; Zugriffspfade prüfen |
| Veränderlicher \`search_path\` bei \`set_updated_at\` und \`set_user_data_version\` | Warnung; Funktionen sollten qualifizierte Objektnamen und festen Suchpfad erhalten |
| \`pg_net\` in Schema \`public\` | Warnung; Extension-Schema und Abhängigkeiten prüfen |
| \`handle_new_user()\` als SECURITY DEFINER für anon/authenticated ausführbar | Advisor-Warnung; Triggerfunktion und tatsächliche RPC-Erreichbarkeit prüfen, nicht unbesehen ändern |
| \`has_active_coach_access(uuid)\` als SECURITY DEFINER für anon/authenticated ausführbar | Advisor-Warnung; Funktion wird von bestehenden RLS-Policies verwendet, daher Abhängigkeiten und benötigte Rollen prüfen |
| Schutz vor kompromittierten Passwörtern deaktiviert | Auth-Einstellung; bewusste Aktivierung prüfen |

Die beiden SECURITY DEFINER-Funktionen haben unterschiedliche Aufgaben:
- \`handle_new_user()\` ist eine Triggerfunktion, die ein Profil beim Anlegen eines Nutzers erzeugt. Sie setzt bereits einen leeren \`search_path\`.
- \`has_active_coach_access(uuid)\` wird in RLS-Policies zur Prüfung einer aktiven Coach-Beziehung verwendet. Sie setzt \`search_path = public\` und \`row_security = off\`.

Die Advisor-Meldung ist ein Prüfhinweis und allein kein Beleg für eine ausnutzbare Schwachstelle. Insbesondere muss bei einer Triggerfunktion geprüft werden, ob sie überhaupt über die REST-RPC-Schnittstelle aufrufbar ist. Keine der Funktionen wurde geändert.

## 8. Konsequenzen für die Scientific Knowledge Base

1. Bestehende persönliche Trainings-, Gesundheits- und Garmin-Daten bleiben unverändert.
2. Wissenschaftliche Quellen werden relational und getrennt von \`user_data\` gespeichert.
3. Gemeinsame kuratierte Literatur und private Uploads erhalten getrennte Tabellen-/Storage-Zugriffsregeln.
4. Keine pauschalen \`anon\`-Grants für neue wissenschaftliche Tabellen.
5. Gemeinsame Quellen sind für angemeldete Nutzer lesbar, aber nur durch einen explizit definierten Kurations- oder serverseitigen Prozess veränderbar.
6. Private Dokumente und deren Chunks müssen dieselbe Eigentums- und Sichtbarkeitslogik verwenden.
7. Embedding-Modell, Dimension, Lizenzgrundlage und Kosten werden vor der Vektor-Migration festgelegt.
8. Bestehende Security-Advisor-Befunde werden separat bewertet; keine globale Rechteänderung als Nebenwirkung der Literatureinführung.

## 9. Nicht durchgeführt

- Keine Tabellen, Policies, Funktionen, Grants, Buckets oder Secrets verändert.
- Keine Extension installiert.
- Keine Migration angewendet oder rückwirkend registriert.
- Keine individuellen Nutzer- oder Gesundheitsdaten abgefragt.
- Keine Tests ausgeführt.
- Kein Merge und kein Deployment.
