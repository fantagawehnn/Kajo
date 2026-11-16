# KAJO – Cloudflare Queues für wissenschaftliche Dokumente

**Status: Architekturentscheidung / Implementierungsentwurf. Nicht deployed.**

## 1. Ziel

KAJO nutzt bereits Cloudflare Workers für die App-Auslieferung und den passiven AI-Coach sowie Supabase für Auth, PostgreSQL und Storage. Für wissenschaftliche PDFs soll keine dritte Laufzeitplattform eingeführt werden.

Empfohlener Aufbau:

- **Supabase Auth:** authentifiziert Nutzer.
- **Supabase PostgreSQL:** Quelle, Dokumentmetadaten, Status, Chunks und spätere Embeddings.
- **Supabase Storage:** dedizierter privater Bucket für PDF-Originale.
- **Supabase Edge Function `scientific-ingestion`:** legt private Upload-Intents und Metadaten an und liefert den Dokumentstatus.
- **Cloudflare Worker `kajo-scientific-ingestion`:** eigener Worker für Upload-Abschlussprüfung und Queue-Produktion.
- **Cloudflare Queues:** dauerhafte asynchrone Job-Zustellung mit Retries und Dead-Letter-Queue.
- **Cloudflare Queue Consumer:** lädt das Dokument serverseitig aus Supabase Storage, prüft es und verarbeitet es nach erfolgreichem Parser-PoC.
- **Bestehender Worker `kajo`:** bleibt für App-Assets und Coach zuständig. Kein Service-Role-Key wird in diesen bestehenden Coach-Worker aufgenommen.

## 2. Warum ein separater Cloudflare Worker?

Der bestehende `worker.js` enthält bereits den Coach-Endpunkt und das statische Asset-Fallback. Die wissenschaftliche Dokumentverarbeitung benötigt zusätzliche privilegierte Supabase-Zugriffe und Queue-Bindings.

Ein eigener Worker isoliert:
- den Supabase-Service-Role-Key,
- die Queue-Bindings,
- Upload-Verifikation und Job-Statusübergänge,
- Parser-Abhängigkeiten und deren Ressourcenverbrauch.

Der Service-Role-Key gehört ausschließlich als Cloudflare Secret in den separaten Ingestion-Worker. Er darf weder in `wrangler`-Klartextkonfiguration noch im Browser, GitHub-Repository oder Coach-Worker landen.

## 3. Geplanter Ablauf

1. Browser ruft `scientific-ingestion` mit Supabase-JWT auf.
2. Edge Function validiert den Nutzer, erzeugt Quelle/Dokument und den exakten Storage-Pfad.
3. Browser lädt die PDF direkt in den privaten Supabase-Bucket hoch (`upsert: false`; bei größeren Dateien TUS/resumable).
4. Browser ruft den separaten Cloudflare Worker mit JWT und `document_id` auf: `POST /api/knowledge/confirm-upload`.
5. Worker validiert den JWT gegen Supabase Auth. Er liest die Dokumentmetadaten mit Nutzerkontext und prüft Eigentümer, private Sichtbarkeit und erwarteten Status.
6. Worker prüft das Objekt serverseitig im exakten Bucket/Pfad, tatsächliche Dateigröße, PDF-Signatur und MIME-Konsistenz.
7. Worker setzt den Status bedingt von `pending` auf `uploaded` und sendet nur eine kleine Queue-Nachricht mit `document_id` und Schema-Version. **Nie die PDF oder den extrahierten Text in die Queue-Nachricht legen.**
8. Queue Consumer lädt die Metadaten erneut, prüft Eigentümer/Sichtbarkeit/Status und beansprucht den Auftrag atomar durch bedingten Übergang `uploaded → extracting`.
9. Consumer extrahiert Text mit Seitenzuordnung, schreibt Chunks idempotent und setzt danach `extracted`; private Dokumente werden anschließend `private_ready`.
10. Bei permanenten Fehlern wird der Status nachvollziehbar auf `failed` gesetzt. Wiederholte Queue-Fehler gelangen in die DLQ und werden nicht stillschweigend verworfen.

## 4. Idempotenz und konkurrierende Zustellungen

Cloudflare Queues arbeitet mit wiederholter Zustellung. Die Anwendung darf daher keine Exactly-once-Verarbeitung voraussetzen.

- Queue-Nachrichten enthalten nur `document_id`, `schema_version` und optional eine nicht-sensitive Korrelations-ID.
- Consumer beansprucht einen Auftrag über einen atomaren bedingten Datenbank-Übergang `uploaded → extracting`. Nur ein Consumer darf erfolgreich beanspruchen.
- Bereits `extracting`, `extracted`, `private_ready`, `failed` oder `rejected` befindliche Dokumente werden anhand einer expliziten Retry-Regel behandelt, nicht erneut blind verarbeitet.
- Chunk-Unique-Key bleibt `(document_id, extraction_version, chunk_index)`.
- Chunk-Ergebnisse einer fehlgeschlagenen Extraktion dürfen nicht in Retrieval gelangen.
- Retry und DLQ sind getrennt: transiente Fehler können wiederholt werden; dauerhaft defekte oder nicht unterstützte PDFs erhalten einen fachlichen Fehlerstatus.

## 5. Laufzeitgrenzen: Cloudflare ist nicht unbegrenzt

Die aktuelle Cloudflare-Dokumentation nennt für Workers 128 MB Speicher pro Isolate. Workers Paid erlaubt bis zu fünf Minuten CPU-Zeit pro Invocation (Standardwert typischerweise 30 Sekunden, konfigurierbar); Workers Free ist auf 10 ms CPU begrenzt. Queue-Consumer können bis zu 15 Minuten Wall-Clock-Zeit laufen, die CPU-Grenze bleibt jedoch maßgeblich.

Cloudflare Queues begrenzt eine Nachricht auf 128 KB; Consumer-Batches können konfiguriert werden. Die Queue bietet Retries und eine Dead-Letter-Queue.

**Konsequenz:** Queues lösen das Problem der dauerhaften Job-Zustellung und Wiederholung, nicht automatisch das Problem speicherintensiver PDF-Extraktion. Ein einzelner großer PDF-Parserlauf kann auch im Cloudflare Worker die 128-MB-Grenze überschreiten. Deshalb:
- Parser-PoC mit repräsentativen Papers vor der produktiven Verarbeitung;
- kleine Consumer-Batches (MVP: 1 Dokument pro Nachricht);
- begrenzte maximale PDF-Größe erst nach PoC festlegen;
- Seiten-/Dokumentgrößen und Extraktionsdauer messen;
- bei großen Dokumenten gegebenenfalls mehrstufige Verarbeitung mit page-range Jobs erwägen;
- Workers Free ist für CPU-intensive PDF-Verarbeitung voraussichtlich ungeeignet; tatsächlichen Tarif und CPU-Einstellungen vor Umsetzung prüfen.

## 6. Cloudflare-Konfiguration (konzeptionell)

Geplante Queue-Namen:
- `kajo-scientific-documents`
- `kajo-scientific-documents-dlq`

Geplante Queue-Consumer-Parameter für den MVP:
- `max_batch_size: 1`
- `max_batch_timeout: 5`
- `max_retries: 5`
- `dead_letter_queue: kajo-scientific-documents-dlq`
- begrenzte `max_concurrency` nach Parser-PoC

Queue-Erstellung und Worker-Deployment erfolgen erst nach ausdrücklicher Freigabe. Es wurden keine Queues in Cloudflare angelegt.

## 7. Secrets / Bindings

Separater Worker benötigt:
- `SUPABASE_URL` (nicht geheim, aber als Worker-Variable)
- `SUPABASE_ANON_KEY` (für Auth-/Nutzerkontext)
- `SUPABASE_SERVICE_ROLE_KEY` (Secret, nur serverseitig im separaten Worker)
- Queue Producer Binding
- Queue Consumer Binding

Bestehender Coach-Worker bleibt ohne `SUPABASE_SERVICE_ROLE_KEY`. Keine Secrets im Repository speichern. Die Edge Function `scientific-ingestion` behält ihre eigenen Supabase Secrets.

## 8. Supabase bleibt Daten- und Dateiquelle

PDF-Dateien verbleiben im privaten Supabase Storage. Cloudflare Queues speichert nur Auftragsreferenzen. Die Worker laden Dokumente zur Verarbeitung serverseitig über die Supabase Storage API und speichern Ergebnis-Metadaten/Chunks in PostgreSQL.

Für größere Uploads empfiehlt Supabase TUS-resumable Uploads (insbesondere bei Dateien über 6 MB oder instabilen Verbindungen). Das Uploadverfahren wird im Frontend umgesetzt; Cloudflare soll keine PDF-Upload-Proxy-Strecke bereitstellen.

## 9. Offene Punkte vor Code und Deployment

- Cloudflare Tarif/CPU-Einstellungen des Accounts bestätigen.
- Konkretes PDF-Größenlimit anhand des Parser-PoC festlegen.
- Parser-Library und Version pinnen; Deno-/Workers-Kompatibilität, Lizenz, WASM/Worker-Unterstützung und Speicher messen.
- Atomare Statusübergänge und Chunk-Schreibstrategie festlegen.
- Storage-Policy und tatsächliche Objektprüfung finalisieren.
- Queue- und DLQ-Retention festlegen.
- Logging ohne PDF-Inhalte, Tokens, Titel/Autoren oder unnötige personenbezogene Daten.
- Private Uploads bleiben privat; Shared-Literatur erfordert separaten Curator-Workflow.

## 10. Quellen

- [Cloudflare Queues – Limits](https://developers.cloudflare.com/queues/platform/limits/)
- [Cloudflare Queues – Konfiguration](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Cloudflare Queues – JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)
- [Cloudflare Workers – Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Supabase Edge Functions – Limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase Storage – Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

## 11. Umsetzungsstatus

Dieses Dokument beschreibt die Zielarchitektur. Es wurden keine Cloudflare Queues erstellt, keine Worker-Bindings konfiguriert, keine Cloudflare Secrets gesetzt, keine Supabase Tabellen/Policies/Buckets verändert und kein Deployment gestartet. Es wurden keine Tests ausgeführt.
