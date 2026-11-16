# KAJO – Scientific Ingestion auf Cloudflare Free + Supabase

**Status: Architekturentscheidung / Implementierungsentwurf. Nicht deployed.**  
**Berücksichtigter Tarif:** Cloudflare Workers Free; Supabase-Tarif ist separat zu betrachten.

## 1. Ziel und Entscheidung

KAJO nutzt Cloudflare für App-Auslieferung und den passiven AI-Coach sowie Supabase für Auth, PostgreSQL und Storage. Die wissenschaftliche Dokumentaufnahme soll innerhalb dieser bestehenden Infrastruktur bleiben.

**Entscheidung für den Free-Plan: PDF-Textextraktion zunächst clientseitig im Browser.** Cloudflare Workers Free haben ein CPU-Limit von 10 ms pro HTTP-Invocation. Supabase Edge Functions haben 2 Sekunden CPU-Zeit pro Request. Beides ist keine verlässliche Umgebung für das Parsen umfangreicher wissenschaftlicher PDFs. Die Supabase Edge Function bleibt deshalb bei kurzen, authentifizierten Datenbankaktionen. Ein Cloudflare Queue Consumer wird im MVP nicht für PDF-Parsing eingesetzt.

Zielaufbau:

- **Supabase Auth:** Nutzeridentität.
- **Supabase PostgreSQL:** Quellen-/Dokumentmetadaten, Status und Text-Chunks.
- **Supabase Storage:** eigener privater Bucket für PDF-Originale.
- **Supabase Edge Function `scientific-ingestion`:** Upload-Intent, Statusabfrage, Verifikation des Uploads und kontrollierte Annahme extrahierter Chunk-Batches.
- **Browser:** PDF.js-basierte Extraktion seitenweise und Übermittlung kleiner Chunk-Batches; Verarbeitung bleibt ausdrücklich nutzerinitiiert.
- **Cloudflare:** App-Auslieferung und bestehender Coach-Worker. Für den Ingestion-MVP ist kein zusätzlicher Cloudflare-Worker und keine Queue erforderlich.
- **Bestehender Coach-Worker:** bleibt ohne Service-Role-Key und ohne Schreibzugriff auf wissenschaftliche Dokumente.

## 2. Warum keine serverseitige PDF-Extraktion im Free-Plan?

Die aktuelle Cloudflare-Dokumentation nennt für Workers Free 10 ms CPU-Zeit pro HTTP-Request und 128 MB Speicher pro Isolate. Supabase Edge Functions haben 2 Sekunden CPU-Zeit pro Request und maximal 256 MB Speicher. Ein vollständiger PDF-Parserlauf kann diese CPU-/Speichergrenzen überschreiten; ein längeres Wall-Clock-Limit ändert daran nichts.

Cloudflare Queues sind grundsätzlich auch im Free-Plan verfügbar und können Nachrichten zuverlässig zustellen. Sie erhöhen aber nicht automatisch die CPU-Grenze eines Workers. Eine Queue würde daher das Zustellungsproblem lösen, nicht die eigentliche PDF-Parsing-Begrenzung.

Quellen:
- [Cloudflare Workers – Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Queues – Limits](https://developers.cloudflare.com/queues/platform/limits/)
- [Supabase Edge Functions – Limits](https://supabase.com/docs/guides/functions/limits)

## 3. Geplanter MVP-Ablauf

1. Nutzer erfasst bibliografische Metadaten und wählt ein PDF.
2. Browser ruft `scientific-ingestion` mit Supabase-JWT auf.
3. Edge Function validiert den Nutzer und erzeugt private Quelle, Dokument und serverseitig festgelegten Storage-Pfad.
4. Browser lädt das PDF direkt in den privaten Supabase-Bucket hoch (`upsert: false`; TUS/resumable bei größeren Dateien oder instabiler Verbindung).
5. Browser meldet den Uploadabschluss. Edge Function prüft Eigentümer, erwarteten Status und das konkrete Storage-Objekt; die tatsächliche Dateigröße und PDF-Signatur werden serverseitig kontrolliert.
6. Browser extrahiert PDF-Text seitenweise mit einer fest versionierten PDF.js-basierten Bibliothek. Die Seitenzuordnung wird aus dem Parser übernommen, nicht aus geschätzten Seitenzahlen.
7. Browser übermittelt kleine, sequenzielle Chunk-Batches an die Edge Function. Jeder Request enthält Dokument-ID, Extraktionsversion und Chunk-Daten mit Seitenbezug.
8. Edge Function validiert erneut den JWT, leitet die User-ID aus `auth.getUser()` ab, prüft Dokumenteigentum/Privatstatus und Größen-/Mengenlimits und schreibt ausschließlich für dieses Dokument.
9. Nach vollständiger Übermittlung bestätigt der Browser den Abschluss. Die Funktion prüft Vollständigkeit und setzt das Dokument auf `extracted`, danach `private_ready`. Unvollständige Extraktionen bleiben unveröffentlicht und können fortgesetzt oder verworfen werden.
10. Die spätere Retrieval-Schicht darf nur Dokumente im Status `private_ready` bzw. kuratierte freigegebene Shared-Dokumente berücksichtigen.

## 4. Sicherheits- und Vertrauensgrenzen

Clientseitige Extraktion ist eine bewusste MVP-Abwägung, keine vertrauenswürdige Beweisführung über den Inhalt des PDFs.

- Der Browser darf nur eigene private Dokumente verarbeiten.
- Der Browser kann niemals `owner_id`, `visibility`, `review_status`, Storage-Pfad oder Freigabestatus bestimmen.
- Die Edge Function leitet die Nutzer-ID ausschließlich aus dem validierten Supabase-JWT ab.
- Chunk-Batches werden nur angenommen, wenn das Dokument dem Nutzer gehört, privat ist und sich in einem passenden Verarbeitungsstatus befindet.
- Serverlimits für Batch-Größe, Gesamttextmenge, Chunk-Anzahl und Seitenbereich sind zwingend; Clientlimits allein sind keine Sicherheitskontrolle.
- Chunk-Inhalte gelten als untrusted user-provided content. Sie dürfen nicht in gemeinsame Suche oder Shared-Knowledge einfließen.
- Die gemeinsame Literaturbasis benötigt weiterhin einen getrennten Kuratierungsprozess mit serverseitig kontrollierten Rollen und Rechteprüfung.
- Service-Role-Key bleibt ausschließlich in der Supabase Edge Function. Er wird weder im Browser noch im Cloudflare Coach-Worker oder Repository gespeichert.
- Keine vollständigen PDF-Texte, Tokens oder signierten URLs in Logs.

## 5. Idempotenz, Wiederaufnahme und Status

Für private Uploads:

`pending → uploaded → extracting → extracted → private_ready`

Fehlerzustände:
- `failed`: technischer Fehler, der einen erneuten Versuch erlauben kann.
- `rejected`: ungültige, beschädigte, verschlüsselte oder nicht unterstützte Datei.
- `manual_review_required`: gescannte PDF oder unzureichende Textextraktion; OCR ist nicht Teil des ersten MVP.

Wiederaufnahme:
- Jeder Chunk erhält einen stabilen Index innerhalb von Dokument und Extraktionsversion.
- Der bestehende Unique-Key `(document_id, extraction_version, chunk_index)` verhindert doppelte Einträge.
- Serverseitige Schreibvorgänge müssen idempotent gestaltet werden; ein erneuter Batch darf keinen zweiten Chunk erzeugen.
- Ein Dokument wird erst nach erfolgreicher Abschlussprüfung `private_ready`.
- Bereits gespeicherte Teil-Chunks eines unvollständigen Laufs dürfen im Retrieval nicht sichtbar sein.
- Ein Fortschritts-/Checkpoint-Mechanismus ist vor Implementierung festzulegen; der Browser darf nach Tab-Schließen nicht behaupten, eine Extraktion sei abgeschlossen.

## 6. Grenzen der clientseitigen Verarbeitung

Clientseitige Extraktion verlagert CPU- und Speicherbedarf auf das Gerät des Nutzers. Das ist für den Free-Plan geeigneter, aber nicht unbegrenzt:

- Sehr große oder layoutkomplexe PDFs können Browser-Tabs verlangsamen oder zum Absturz bringen.
- Tabellen, Mehrspaltenlayouts, Formeln und Fußnoten können fehlerhaft oder in falscher Lesereihenfolge extrahiert werden.
- Eingescannte PDFs liefern ohne OCR keinen brauchbaren Text.
- Der Nutzer muss die Browserseite während der Verarbeitung geöffnet lassen, sofern keine robuste Wiederaufnahme implementiert wurde.
- Dateigrößenlimit, Seitenlimit, Batch-Größe und Chunk-Größe werden erst nach einem lokalen Parser-PoC mit repräsentativen Papers festgelegt.
- Original-PDF bleibt maßgebliche Quelle; automatische Extraktion ist keine fachlich geprüfte Zusammenfassung.
- Seitenzahlen müssen aus dem PDF-Parser stammen und dürfen nicht aus Viewer-Seiten, Titelblattzählung oder vermuteter Journal-Paginierung abgeleitet werden.

## 7. Warum der MVP keine Cloudflare Queue benötigt

Für eine clientseitig gestartete, schrittweise Extraktion wird keine serverseitige Hintergrundwarteschlange benötigt. Die Browseranwendung steuert den Fortschritt und übermittelt kleine Batches. Supabase speichert Dokumentstatus und Chunks.

Cloudflare Queues bleiben eine spätere Option, wenn ein geeigneter kosten-/tarifkompatibler Consumer oder eine andere serverseitige Laufzeit für rechenintensive Aufgaben verfügbar ist. Eine Queue darf nicht allein deshalb eingebaut werden, weil sie asynchrone Zustellung bietet; der Consumer muss die tatsächliche PDF-Verarbeitung innerhalb seiner CPU- und Speichergrenzen ausführen können.

## 8. Supabase Storage und Upload

PDF-Dateien verbleiben im privaten Bucket `kajo-scientific-documents`; der bestehende Bucket `garmin-fit` wird nicht wiederverwendet.

- Upload direkt vom Browser zu Supabase Storage, kein Cloudflare-Proxy.
- Storage-Pfad wird serverseitig erzeugt und an den Upload-Intent gebunden.
- Browser erhält nur die notwendigen Uploadrechte für den exakten Pfad.
- Keine Browser-Lese-, Überschreib- oder Löschrechte für beliebige Dokumente.
- Für größere Dateien empfiehlt Supabase TUS/resumable Uploads, insbesondere über 6 MB oder bei instabiler Verbindung.
- Konkretes Bucket-Größenlimit wird erst nach Parser-PoC und Storage-Policy-Prüfung festgelegt.

## 9. Nicht Teil des MVP

- Server-seitiges PDF-Parsing in Cloudflare Free oder Supabase Edge Functions.
- OCR für gescannte Dokumente.
- Cloudflare Queue und Dead-Letter-Queue.
- Gemeinsame Freigabe von Nutzer-Uploads.
- Embeddings und semantisches Retrieval.
- Automatische fachliche Bewertung von Studiendesign, Ergebnissen oder Transferierbarkeit.

## 10. Umsetzungsreihenfolge

1. Supabase-Schemaentwurf und Storage-Policies mit dem tatsächlichen Remote-Schema abgleichen.
2. PDF.js-basierte clientseitige Extraktion lokal evaluieren (Seitenbezug, Unicode, Tabellen, Mehrspaltenlayout, Browser-Speicherbedarf).
3. Limits für Dateigröße, Seiten, Batch-Größe und Gesamttext nach PoC festlegen.
4. Edge Function um Uploadabschluss, Chunk-Batch-Annahme, Idempotenz und Abschlussprüfung erweitern.
5. Frontend-Upload und sichtbaren Fortschritt mit Abbruch-/Wiederaufnahmeverhalten implementieren.
6. Statische Sicherheitsprüfung; Tests erst nach ausdrücklicher Freigabe.
7. Migration, Secrets und Deployment nur nach separater ausdrücklicher Freigabe.

## 11. Secrets und Infrastruktur

Für die bestehende Supabase Edge Function bleiben serverseitig erforderlich:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ORIGIN`
- `MAX_UPLOAD_BYTES`

Die tatsächlichen Secrets müssen vom Nutzer in Supabase hinterlegt werden; keine Secrets im Repository oder Chat. Es ist kein zusätzlicher Cloudflare-Secret und kein Queue-Binding erforderlich.

## 12. Umsetzungsstatus

Dieses Dokument beschreibt die angepasste Free-Plan-Zielarchitektur. Der bestehende Edge-Function-Scaffold enthält weiterhin nur Upload-Intent und Statusabfrage; `process-document` bleibt HTTP 501. Clientseitige PDF-Extraktion, Chunk-Batch-Endpunkte, Bucket, Policies, Datenbankänderungen und Frontend-Upload sind **noch nicht implementiert**.

Es wurden keine Cloudflare Queues angelegt, keine Supabase-Tabellen/Policies/Buckets verändert, keine Secrets gesetzt, keine Tests ausgeführt, kein Merge vorgenommen und kein Deployment gestartet.
