# KAJO – Umsetzungsplan Scientific Knowledge Base

**Stand:** 16.11.2026  
**Branch:** `integration/coach-ai-v2-latest`  
**Status:** Architektur- und Sicherheitsplanung; keine Datenbankänderung

## 1. Ziel und Abgrenzung

Die Scientific Knowledge Base ergänzt den KI-Coach um nachvollziehbare, quellengebundene sportwissenschaftliche Evidenz für Ausdauersport mit Schwerpunkt Kanusport. Sie bleibt technisch und logisch von persönlichen Trainings-, Gesundheits- und Profildaten getrennt.

Der Coach darf nur Quellen zitieren, die tatsächlich über die Retrieval-Schnittstelle bereitgestellt wurden. Allgemeine Ausdauerforschung ist nicht automatisch direkte Evidenz für Kanusport. Der Transfer auf K1, C1 oder C2 sowie Classic, Sprint, Wildwasser und Flachwasser muss explizit gekennzeichnet werden.

## 2. Verifizierter Datenbankstand

Die Prüfung erfolgte lesend am 16.11.2026. Es wurden keine Datenbankobjekte verändert.

- Remote-Migrationshistorie: ein Eintrag, Version `20261115224846`, Name `garmin_activity_sync_days`.
- Im Branch liegen vier SQL-Dateien unter `supabase/migrations/`.
- Die Remote-Datenbank enthält die von allen vier Dateien beschriebenen Schemaänderungen, obwohl drei davon nicht als separate Remote-Migrationseinträge erscheinen.
- `public.garmin_activity_telemetry` existiert mit den erwarteten Spalten und SELECT-, INSERT- sowie UPDATE-Policies für `authenticated`.
- `public.kajo_notification_schedules.last_sent_local_date` existiert.
- `public.garmin_activity_sync_days` existiert und hat RLS aktiviert, aber keine Policies.
- Die Remote-Historie darf deshalb nicht durch blindes erneutes Ausführen der vorhandenen Dateien „repariert“ werden. Die konkrete Ursache der abweichenden Historie ist nicht festgestellt.

### Reconciliation je Datei

| Datei | Remote-Zustand | Konsequenz |
|---|---|---|
| `20261115000100_garmin_activity_telemetry.sql` | Tabelle, Spalten, RLS sowie SELECT-/INSERT-Policies vorhanden | Nicht erneut ausführen |
| `202611150001_garmin_activity_sync_days.sql` | Tabelle und RLS vorhanden; keine Policies | Nicht erneut ausführen; Zugriffspfad der Edge Functions prüfen |
| `20261115000200_kajo_push_delivery_tracking.sql` | Spalte `last_sent_local_date` vorhanden | Nicht erneut ausführen |
| `20261115000300_garmin_activity_telemetry_update_policy.sql` | UPDATE-Grant und UPDATE-Policy vorhanden | Nicht erneut ausführen |

Vor einer zukünftigen Migration müssen lokale Migrationen, Remote-Schema und Remote-Migrationshistorie gemeinsam betrachtet werden. Keine Migration wird rückwirkend registriert oder erneut ausgeführt, nur um die Historie optisch anzugleichen.

## 3. Security-Befunde und Einordnung

### 3.1 RLS ohne Policies

Der Security Advisor meldet fehlende Policies auf `garmin_activity_sync_days` und `garmin_personal_credentials`. Das kann für Tabellen, die ausschließlich von vertrauenswürdigen Edge Functions mit privilegiertem Zugriff verwendet werden, beabsichtigt sein. Vor Änderungen müssen die tatsächlichen Lese- und Schreibpfade der Funktionen geprüft werden. Es wird keine Browser-Policy auf Verdacht ergänzt.

### 3.2 SECURITY DEFINER

- `has_active_coach_access(uuid)` ist `SECURITY DEFINER`, setzt `search_path = public` und `row_security = off`. Die Funktion prüft, ob `auth.uid()` als Coach für die übergebene Athleten-ID aktiv eingetragen ist. Sie wird in bestehenden RLS-Policies verwendet. Ihre Ausführungsrechte dürfen nicht pauschal entzogen werden, ohne diese Abhängigkeiten zu berücksichtigen.
- `handle_new_user()` ist eine Triggerfunktion, die einen Profil-Datensatz anlegt und bereits einen leeren `search_path` setzt. Die Advisor-Warnung zur Ausführbarkeit ist gesondert im Hinblick auf Triggerbindung und RPC-Erreichbarkeit zu bewerten.
- `save_user_data(jsonb, integer)` läuft als `SECURITY INVOKER`, setzt einen leeren `search_path`, bezieht die User-ID aus `auth.uid()` und ist nicht für `anon` ausführbar.

Die Advisor-Meldungen sind Prüfhinweise, nicht automatisch der Nachweis einer ausnutzbaren Schwachstelle. Keine dieser Funktionen wurde geändert.

### 3.3 Weitere Advisor-Hinweise

- `set_updated_at` und `set_user_data_version`: veränderlicher `search_path`; vor einer gezielten Härtung Triggerabhängigkeiten prüfen.
- `pg_net` liegt im Schema `public`; Verschiebung erst nach Prüfung von Abhängigkeiten und Supabase-Konventionen.
- Schutz vor kompromittierten Passwörtern ist deaktiviert; dies ist eine Auth-Konfiguration und separat zu entscheiden.
- Fehlende RLS-Policies und breite Tabellen-Grants sind getrennte Themen. RLS allein ersetzt keine Least-Privilege-Grants, insbesondere nicht für `TRUNCATE`.

## 4. Empfohlene Implementierungsphasen

### Phase A – Schema- und Migrationsabgleich

1. Die vier vorhandenen SQL-Dateien und ihre Remote-Wirkungen als reconciled dokumentieren.
2. Für die fehlenden Remote-Historieneinträge Ursache und zulässiges Vorgehen mit der aktuellen Supabase-Migrationsverwaltung klären.
3. Die Edge-Function-Zugriffe auf `garmin_activity_sync_days` und `garmin_personal_credentials` nachvollziehen.
4. Bestehende Advisor-Befunde getrennt priorisieren. Keine pauschalen Grants- oder Funktionsänderungen.

### Phase B – Metadatenmodell ohne Vektorspalte

Ein erster SQL-Arbeitsentwurf liegt unter [`docs/drafts/SCIENTIFIC_KNOWLEDGE_PHASE1_DDL_DRAFT.sql`](./drafts/SCIENTIFIC_KNOWLEDGE_PHASE1_DDL_DRAFT.sql). Er enthält ausschließlich Quellen- und Dokumentmetadaten mit RLS-Leseregeln; er ist ausdrücklich keine Migration und wurde nicht angewendet.

Zunächst nur relationale Metadaten für Quellen, Dokumente, Themen und Sportkontexte entwerfen. Die erste Schemaerweiterung soll noch keine Embedding-Dimension festschreiben und keine Vektor-Extension voraussetzen.

Vorgesehene Trennung:

- Gemeinsame, kuratierte Quellen: angemeldete Nutzer dürfen ausschließlich freigegebene Datensätze lesen.
- Private Uploads: Eigentümerzugriff über `auth.uid()`; niemals automatisch in die gemeinsame Literaturbasis übernehmen.
- Kuratierung: keine Schreibrechte aus dem Browser. Schreibzugriff ausschließlich über einen später festgelegten vertrauenswürdigen Prozess.
- Persönliche Athletendaten: bleiben in ihren bestehenden Tabellen und werden nicht in Paper-, Chunk- oder Evidenztabellen kopiert.

### Phase C – Dokumente und Rechte

Erst nach Klärung der Lizenz- und Speichergrundlage einen separaten privaten Storage-Bucket für Paper vorsehen. Der bestehende Bucket `garmin-fit` bleibt unverändert.

Storage-Policies müssen Eigentümer und Objektpfad prüfen. Tabellen-RLS schützt Storage-Objekte nicht automatisch. Volltexte werden nur gespeichert, wenn die jeweilige Lizenz oder Nutzungsgrundlage dies zulässt.

### Phase D – Embeddings und Retrieval

Vor Aktivierung der Vektorsuche müssen Modell, Dimension, Sprache, Qualität, Lizenzbedingungen und laufende Kosten feststehen. Erst danach wird `vector` gegebenenfalls im Schema `extensions` installiert und eine passende Vektorspalte angelegt.

Die Retrieval-Antwort muss mindestens Quelle, Autor(en), Jahr, DOI/URL, Seiten- oder Abschnittsbezug, Sportkontext, Studiendesign und Transferability-Hinweis liefern. Ohne passende Treffer darf der Coach keine Literaturbelege erfinden.

### Phase E – Ingestion und Coach-Anbindung

Die Verarbeitung wird innerhalb der bestehenden Cloudflare-/Supabase-Infrastruktur umgesetzt. Da Cloudflare Workers Free auf 10 ms CPU-Zeit pro HTTP-Invocation begrenzt sind und Supabase Edge Functions 2 Sekunden CPU-Zeit pro Request haben, wird die PDF-Textextraktion im ersten MVP clientseitig im Browser durchgeführt. Supabase übernimmt Auth, Metadaten, private PDF-Dateien und Chunk-Persistenz in kleinen, authentifizierten Batches. Der bestehende Coach-Worker bleibt unverändert und ohne Service-Role-Key. Cloudflare Queues sind für diesen MVP nicht vorgesehen, weil sie die CPU-Grenze des Consumers nicht aufheben. Details stehen in [CLOUDFLARE_SCIENTIFIC_INGESTION_ARCHITECTURE.md](./CLOUDFLARE_SCIENTIFIC_INGESTION_ARCHITECTURE.md).

Die Verarbeitung wird schrittweise aufgebaut: Dokumentaufnahme, Rechteprüfung, clientseitige seitenbezogene Textextraktion, Chunking, idempotente Übermittlung, Embedding, fachliche Kuratierung und Retrieval. Automatisch extrahierte Studienbefunde bleiben als ungeprüft gekennzeichnet, bis sie fachlich bestätigt wurden. Browserseitige Extraktion wird vor der Implementierung mit repräsentativen Papers hinsichtlich Seitenbezug, Unicode, Layoutverlusten und Ressourcenbedarf evaluiert.

Der KI-Coach bleibt passiv: Er darf analysieren und Empfehlungen formulieren, aber keine Trainingspläne, Kalender, Profile oder gespeicherten Daten eigenständig verändern.

## 5. Noch offene Entscheidungen

Vor der ersten Datenbankmigration sind mindestens folgende Punkte zu entscheiden:

1. Welche Embedding-Lösung erfüllt die Qualitätsanforderungen und das Kostenlimit?
2. Welche Rolle darf gemeinsame Quellen kuratieren und wie wird diese Rolle sicher vergeben?
3. Welche Dokumenttypen und Lizenzen dürfen als Datei gespeichert werden?
4. Sollen private Uploads zunächst ausschließlich für den jeweiligen Nutzer durchsuchbar sein?
5. Welche Sport- und Evidenz-Taxonomie wird für den MVP verbindlich?

## 6. Nicht durchgeführt

- Keine Migration angewendet oder rückwirkend registriert.
- Keine Tabellen, Policies, Funktionen, Grants, Buckets oder Extensions verändert.
- Keine individuellen Trainings- oder Gesundheitsinhalte abgefragt.
- Keine Tests ausgeführt.
- Kein Merge und kein Deployment.
