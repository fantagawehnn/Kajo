# KAJO – Supabase-Datenbestandsaudit

**Stand:** 14.11.2026  
**Geprüfter Branch:** `feat/coach-athlete-context-v2`  
**Zweck:** Bestandsaufnahme vor der Einführung einer wissenschaftlichen Wissensdatenbank.

## 1. Prüfungsumfang und Einschränkung

Geprüft wurden die im Repository vorhandenen Supabase-Konfigurations-, Authentifizierungs-, Speicher- und Synchronisationsmodule sowie die Architektur-, Audit- und Roadmap-Dokumentation.

Dieses Audit ist eine **Code- und Repository-Prüfung**, keine direkte Inspektion des produktiven Supabase-Projekts. Es lagen in dieser Prüfung weder ein direkter Datenbankzugriff noch SQL-Migrationsdateien oder ein vollständiger Export des Remote-Schemas vor. Deshalb können tatsächliche Tabellen, Spalten, Constraints, Trigger, Grants und Row-Level-Security-Policies nicht abschließend bestätigt werden.

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

Die Funktion prüft die aktuelle Supabase-Identität, lädt nur den Datensatz der angemeldeten User-ID und verwendet eine erwartete Version, um konkurrierende Überschreibungen zu erkennen.

Der Modulkommentar sagt ausdrücklich, dass die Synchronisierung zunächst vorbereitet und nicht automatisch gestartet wird. Der Repository-Code allein belegt nicht, dass Tabelle und RPC-Funktion im Remote-Projekt tatsächlich existieren oder korrekt abgesichert sind.

### 2.4 Migrationen und Schema
Im rekursiv geprüften Dateibaum des Branches wurde kein Verzeichnis mit Supabase-/SQL-Migrationen gefunden. Auch die Roadmap führt die Dokumentation von Tabellen, RLS und Edge-Function-Secrets als noch offen.

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
