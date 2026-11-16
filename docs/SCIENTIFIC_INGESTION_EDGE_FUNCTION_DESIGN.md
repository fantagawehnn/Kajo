# KAJO – Technischer Entwurf der Scientific Ingestion Edge Function

**Status:** Technischer Entwurf, nicht implementiert  
**Zielbranch:** `integration/coach-ai-v2-latest`  
**Bezug:** `SCIENTIFIC_DOCUMENT_INGESTION_SPEC.md` und `drafts/SCIENTIFIC_KNOWLEDGE_PHASE1_DDL_DRAFT.sql`

## 1. Architekturentscheidung für den MVP

Die Dokumentverarbeitung wird als eigenständige Supabase Edge Function unter

`supabase/functions/scientific-ingestion/index.ts`

vorgesehen. Sie bleibt getrennt vom Cloudflare-Chat-Worker und von `garmin-personal`.

Der MVP wird bewusst auf **private Uploads angemeldeter Nutzer** begrenzt. Ein Upload wird nicht automatisch zu einer gemeinsamen Quelle. Gemeinsame Literatur aus Open-Access-Beständen oder autorisierten Einreichungen wird erst in einem getrennten Kuratierungsschritt freigegeben. Damit muss für die erste Version noch kein öffentliches Upload- oder Kuratorensystem gebaut werden.

### Vertrauensgrenzen

- Browser: übermittelt PDF und Metadaten; erhält keine privilegierten Schlüssel.
- Edge Function: authentifiziert Nutzer, legt Upload-Intent an, prüft Dokumente und steuert Statuswechsel.
- Supabase Storage: privater Bucket, getrennte Originaldateien, keine öffentlichen URLs.
- Datenbank: Metadaten und extrahierte Chunks mit RLS.
- Admin-Client: nur innerhalb der Edge Function, nur für eng begrenzte serverseitige Aktionen.
- Coach: erhält später ausschließlich freigegebene gemeinsame Evidenz oder ausdrücklich ausgewählte private Quellen.

## 2. Funktionskonfiguration und Authentifizierung

- Funktion: `scientific-ingestion`
- HTTP-Methode: ausschließlich `POST`; `OPTIONS` nur für CORS-Preflight.
- JWT-Prüfung: aktiviert lassen (kein `verify_jwt = false`).
- Zusätzlich Bearer-Token mit einem Supabase-Client auf Basis des Publishable-/Anon-Keys über `auth.getUser()` serverseitig validieren.
- Nutzer-ID ausschließlich aus dem validierten User-Objekt übernehmen.
- Admin-Client erst nach erfolgreicher Authentifizierung erzeugen bzw. für den jeweiligen privilegierten Vorgang verwenden.
- Service-Role-Key bleibt Edge-Function-Secret und darf nie in Browser, Cloudflare-Worker, Responses oder Logs gelangen.
- CORS-Origin als explizite Konfiguration (z. B. `APP_ORIGIN`), kein `*`. Die vorhandene Garmin-Funktion verwendet aktuell eine fest eingetragene Worker-Origin; diese darf nicht ungeprüft kopiert werden.
- Fehlerantworten dürfen weder Stacktraces noch SQL-Details, Storage-Pfade anderer Nutzer oder interne Secrets enthalten.

Die vorhandene Garmin-Funktion ist nur ein Auth-/Client-Muster. Garmin-Cron-Ausnahmen, Garmin-Secrets, Tokenlogik und fachliche Funktionen werden nicht übernommen.

## 3. API-Vertrag

Eine Funktion mit einem kleinen Action-Dispatcher genügt zunächst. Alle Aktionen verlangen einen gültigen Nutzer-JWT.

### A. `create-upload-intent`

Request:

```json
{
  "action": "create-upload-intent",
  "source": {
    "title": "Titel der Publikation",
    "authors": [],
    "publication_year": 2024,
    "doi": null,
    "source_url": null,
    "language": "en",
    "publication_type": "research_article",
    "access_basis": "private_upload"
  },
  "file": {
    "name": "paper.pdf",
    "size_bytes": 123456,
    "mime_type": "application/pdf"
  }
}
```

Server-Verhalten:

1. JSON-Schema, Feldtypen und Pflichtfelder validieren.
2. Nur PDF akzeptieren; Dateiname normalisieren und niemals als Storage-Pfad verwenden.
3. Upload-Größenlimit aus serverseitiger Konfiguration prüfen. Das konkrete Limit wird vor Implementierung anhand der Supabase- und Parser-Ressourcen festgelegt.
4. Private Quelle mit `owner_id = auth.uid()`, `visibility = 'private'`, `review_status = 'draft'` anlegen.
5. Dokument mit `owner_id = auth.uid()`, `visibility = 'private'`, `processing_status = 'pending'` anlegen.
6. Storage-Pfad serverseitig erzeugen: `<user-uuid>/<document-uuid>/original.pdf`.
7. Pfad in `scientific_documents.storage_path` speichern.
8. Nur `document_id`, erlaubte Dateimetadaten und Upload-Status zurückgeben.

Der Browser darf weder `owner_id`, `visibility`, `review_status`, `processing_status` noch `storage_path` frei bestimmen.

### B. Direkter Upload in Storage

Für den MVP erfolgt der Upload direkt vom Browser in den privaten Bucket, authentifiziert mit dem normalen Nutzer-JWT. Die Storage-Policy muss den Upload auf einen zuvor serverseitig angelegten Intent begrenzen:

- Bucket-ID exakt auf den dedizierten Knowledge-Bucket begrenzen.
- Nur `authenticated`.
- Nur INSERT, kein Upsert/Überschreiben.
- Der Objektname muss exakt einem `scientific_documents.storage_path` entsprechen.
- Das Dokument muss `owner_id = auth.uid()`, `visibility = 'private'` und `processing_status = 'pending'` besitzen.
- Kein SELECT/List-Zugriff auf fremde Objekte; eigene private Downloads werden über eine gesonderte Policy oder serverseitig signierte URL gelöst.
- Kein Zugriff auf `garmin-fit`.

Damit kann ein Nutzer nicht durch manipulierte Pfade einen fremden Upload-Intent verwenden. Eine einfache Ordnerprüfung auf die User-ID allein wäre schwächer als die Prüfung auf den exakten, serverseitig gespeicherten Intent-Pfad.

### C. `process-document`

Request:

```json
{
  "action": "process-document",
  "document_id": "uuid"
}
```

Server-Verhalten:

1. Dokument anhand der ID laden und Eigentum sowie private Sichtbarkeit prüfen.
2. Nur Status `pending` oder `uploaded` verarbeiten; bereits abgeschlossene Verarbeitung idempotent beantworten.
3. Prüfen, dass das Storage-Objekt am serverseitig gespeicherten Pfad existiert.
4. Dateigröße serverseitig prüfen; Browserangaben sind nicht vertrauenswürdig.
5. PDF-Signatur und MIME-/Parser-Konsistenz prüfen. `Content-Type` allein genügt nicht.
6. SHA-256-Prüfsumme berechnen und speichern.
7. Status kontrolliert auf `extracting` setzen.
8. PDF-Text mit Seitenbezug extrahieren.
9. Leere, verschlüsselte, beschädigte oder nur gescannte PDFs nicht stillschweigend als erfolgreich verarbeiten. Sie werden mit einem definierten Fehlerstatus bzw. manueller Prüfung beendet.
10. Chunks mit Extraktionsversion, Chunk-Index und Seitenbezug speichern.
11. Bei privatem Upload nach erfolgreicher Extraktion Status `private_ready` setzen.
12. Bei Fehlern Status `failed` setzen und eine kurze, nicht sensible Fehlerkategorie speichern.

Die Funktion darf niemals allein aufgrund eines vom Browser übermittelten `document_id` eine Datei verarbeiten: Eigentum und Storage-Pfad müssen aus der Datenbank geprüft werden.

### D. `get-document-status`

Request:

```json
{
  "action": "get-document-status",
  "document_id": "uuid"
}
```

Antwort enthält nur eigene Dokumentmetadaten und Status, keine Chunks und keine Storage-URL. Nicht vorhandene und fremde IDs werden gleichartig behandelt, damit keine fremden Dokument-IDs enumeriert werden können.

### E. Kuratierung

Nicht Bestandteil des privaten Upload-MVP. Eine spätere Kuratierungsaktion muss eine serverseitig verwaltete Rolle prüfen (z. B. eine dedizierte Curator-ACL-Tabelle oder vertrauenswürdige App-Metadata). `user_metadata` ist keine Berechtigungsquelle.

Die Freigabe setzt die übergeordnete Quelle auf `approved`; der Browser kann diesen Status nicht setzen. Vor Freigabe müssen Lizenz, Publikationsmetadaten und wissenschaftliche Qualität geprüft werden.

## 4. Idempotenz und parallele Verarbeitung

- Pro Dokument existiert genau ein serverseitig erzeugter Storage-Pfad.
- Upload erfolgt ohne Upsert. Ein erneuter Upload auf denselben Pfad wird abgewiesen; ein erneuter Intent erzeugt eine neue Dokumentversion bzw. Dokument-ID.
- Verarbeitung verwendet einen kontrollierten Statuswechsel als Claim: Nur ein Aufruf darf ein Dokument von `uploaded` nach `extracting` übernehmen.
- Chunk-Unique-Constraint: `(document_id, extraction_version, chunk_index)`.
- Ein Wiederholungsversuch nach `failed` muss eine klar definierte Extraktionsversion und Bereinigungsstrategie verwenden.
- Teilweise gespeicherte Chunks dürfen nie für Retrieval sichtbar werden. Retrieval filtert zusätzlich nach `private_ready` bzw. später `approved` bei Shared Sources.
- Für atomare Speicherung von Chunks und Abschlussstatus ist vor Implementierung zu entscheiden, ob ein eng begrenzter Datenbank-RPC in einer Transaktion verwendet wird. Keine allgemeine `SECURITY DEFINER`-Funktion in `public` ohne separate Sicherheitsprüfung.

## 5. PDF-Parser und Laufzeitgrenzen

Der Parser wird nicht vorzeitig festgelegt. Vor Implementierung müssen geprüft werden:

- Deno-/Supabase-Edge-Kompatibilität und Paketpflege.
- Lizenz des Parsers.
- Speicherbedarf bei vollständigem PDF-Download und Extraktion.
- Laufzeitgrenzen der aktuell verwendeten Supabase Edge Functions.
- Seitenzuordnung, Unicode, Tabellen und mehrspaltige Layouts.
- Verhalten bei verschlüsselten, beschädigten und gescannten PDFs.

Für größere Dateien empfiehlt Supabase resumable/TUS Uploads; die Storage-Dokumentation nennt dies insbesondere für Dateien über 6 MB oder instabile Verbindungen. Der MVP sollte deshalb den Uploadpfad so gestalten, dass TUS später ergänzt werden kann. Das Parser-Limit ist unabhängig vom Upload-Limit festzulegen.

**Keine OCR im ersten MVP.** Gescannte PDFs erhalten einen klaren Status für manuelle Prüfung. OCR wird erst nach einer gesonderten Entscheidung zu Qualität, Kosten und Laufzeit ergänzt.

## 6. Logging, Limits und Missbrauchsschutz

- Rate-Limit pro Nutzer und Zeitfenster für Intent- und Prozessaktionen.
- Begrenzung gleichzeitiger Verarbeitungen pro Nutzer.
- Maximalgröße serverseitig kontrollieren; Client-Validierung ist nur UX.
- Keine vollständigen PDF-Texte, Tokens, signed URLs oder personenbezogenen Inhalte loggen.
- Logfelder: Request-ID, User-ID (intern), Document-ID, Aktion, Dauer, Status, Fehlerkategorie.
- Fehlertexte nach außen generisch halten; Details nur in geschützten Serverlogs.
- Abgebrochene Upload-Intents und verwaiste Storage-Objekte benötigen später einen Bereinigungsprozess.

## 7. Erforderliche Schema-/Storage-Ergänzungen vor Implementierung

Der aktuelle SQL-Entwurf enthält Quellen, Dokumente und Chunks, aber noch keine vollständige Upload-Infrastruktur. Vor dem ersten echten Upload müssen zusätzlich festgelegt und geprüft werden:

1. Dedizierter privater Bucket, z. B. `kajo-scientific-documents`.
2. Storage-Policies für exakt vorab angelegte Upload-Intents.
3. Ob `uploaded` durch einen serverseitigen Abschlussaufruf gesetzt wird oder durch eine verifizierende Prozessaktion.
4. Curator-ACL und Audit-Trail – erst für gemeinsame Quellen.
5. Status-/Fehlerfelder und Retry-Regeln.
6. Transaktionsstrategie für Chunk-Schreiben und Abschlussstatus.
7. Löschablauf: Metadaten, Storage-Datei und Chunks müssen konsistent entfernt werden.

Keiner dieser Punkte ist aktuell in der produktiven Datenbank oder Storage-Konfiguration angelegt.

## 8. Implementierungsreihenfolge

1. Schemaentwurf final prüfen und mit vorhandener Migration-Historie abgleichen.
2. Bucket- und Storage-Policies als separaten SQL-Entwurf ausarbeiten.
3. PDF-Parser nach Deno-Kompatibilität, Lizenz und Seitenbezug evaluieren.
4. Edge Function als nicht deployten Code im Repository implementieren.
5. Statische Sicherheitsprüfung und gezielte Tests nach ausdrücklicher Freigabe.
6. Erst nach gesonderter Zustimmung Migration anwenden und Funktion deployen.

## 9. Offene Entscheidungen

- Upload-Größenlimit und erlaubte PDF-Seitenzahl.
- Konkreter PDF-Parser.
- Ob private Uploads in der ersten Version bereits extrahiert werden oder zunächst nur sicher abgelegt werden.
- Ob der erste MVP nur private Dokumente unterstützt (empfohlen) oder auch kuratierte Shared-Source-Uploads.
- Curator-ACL und Audit-Trail für die spätere gemeinsame Wissensbasis.
- Retention-/Löschfristen.

## 10. Nicht umgesetzt

Dieser Entwurf legt keine Funktion, keinen Bucket, keine Policies, keine Tabellen, keine Secrets und keine API-Routen an. Es wurde nichts deployed und kein Test ausgeführt.


## 11. Konkreter Storage-Policy-Entwurf

Der separate SQL-Entwurf liegt unter [`docs/drafts/SCIENTIFIC_STORAGE_POLICIES_DRAFT.sql`](./drafts/SCIENTIFIC_STORAGE_POLICIES_DRAFT.sql). Er sieht den privaten Bucket `kajo-scientific-documents` vor und bindet INSERT-Rechte an den exakten, zuvor serverseitig in `scientific_documents.storage_path` gespeicherten Pfad. Zusätzlich müssen Eigentümer, private Sichtbarkeit und Status `pending` übereinstimmen.

Bewusst nicht vorgesehen sind Browser-SELECT/LIST, UPDATE oder DELETE. Downloads und Löschungen sollen später über serverseitige Aktionen mit erneuter Eigentumsprüfung erfolgen. Das verhindert, dass die Storage-Policy allein über einen erratbaren Ordnernamen Zugriff gewährt.

Die tatsächliche Storage-Schemainspektion bestätigte die verwendeten Spalten `storage.buckets.id/name/public/file_size_limit/allowed_mime_types` sowie `storage.objects.bucket_id/name`. Das ist eine reine Lesebestätigung der Schemaform, keine Änderung der Datenbank.

**Offen vor einer Migration:** Das konkrete positive `file_size_limit` muss anhand des gewählten PDF-Parsers und der Edge-Function-Laufzeit festgelegt werden. Der Bucket-Insert ist deshalb im SQL-Entwurf bewusst als nicht ausführbare Vorlage markiert. Außerdem muss vor Anwendung geprüft werden, ob bereits andere Storage-Policies auf dem Bucket weitergehende Rechte gewähren.


## 12. Erster Code-Scaffold im Repository

Unter `supabase/functions/scientific-ingestion/index.ts` liegt jetzt ein bewusst begrenzter, noch nicht deployter Scaffold:

- POST/OPTIONS-Handling mit konfigurierter exakter `APP_ORIGIN`; kein Wildcard-CORS.
- JWT wird zusätzlich über `auth.getUser()` validiert; die User-ID stammt ausschließlich aus diesem Ergebnis.
- Privilegierter Client wird nur serverseitig aus `SUPABASE_SERVICE_ROLE_KEY` erstellt.
- `create-upload-intent` validiert Metadaten, PDF-MIME-Angabe und deklarierte Dateigröße gegen `MAX_UPLOAD_BYTES`, erzeugt UUIDs serverseitig und legt private Quelle sowie Dokument mit exaktem Storage-Pfad an.
- Bei fehlgeschlagener Dokumentanlage wird versucht, die zuvor angelegte Quelle wieder zu entfernen.
- `get-document-status` gibt ausschließlich das private Dokument des authentifizierten Eigentümers zurück.
- `process-document` antwortet vorerst ausdrücklich mit HTTP 501 (`PARSER_NOT_CONFIGURED`); es wird keine unvollständige oder fingierte PDF-Verarbeitung vorgetäuscht.
- `supabase/config.toml` setzt `verify_jwt = true` für die neue Funktion explizit.

Erforderliche serverseitige Konfiguration vor einem späteren Deployment: `APP_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` und `MAX_UPLOAD_BYTES`. Der Wert von `MAX_UPLOAD_BYTES` muss mit dem noch festzulegenden Storage-Bucket-Limit übereinstimmen oder darunter liegen. Secrets werden nicht im Repository hinterlegt.

**Noch nicht produktionsfähig:** Tabellen/Policies/Bucket existieren noch nicht aufgrund dieses Scaffoldings; direkter Browser-Upload, PDF-Parser, tatsächliche Dateisignaturprüfung, serverseitige Größenprüfung des gespeicherten Objekts, atomare Chunk-Persistenz, Rate-Limits, Intent-Ablauf/Bereinigung und Download-/Delete-Aktionen fehlen. Der Prozess-Endpunkt bleibt deshalb deaktiviert (501).

Der Code wurde nur im Repository angelegt. Er wurde nicht deployed und nicht getestet.


## 13. Laufzeitprüfung: PDF-Extraktion nicht ungeprüft in den Request-Handler legen

Eine aktuelle Prüfung der Supabase-Laufzeitgrenzen ergibt für gehostete Edge Functions 256 MB maximalen Speicher und 2 Sekunden CPU-Zeit pro Request; das Wall-Clock-Limit beträgt abhängig vom Supabase-Tarif 150 bzw. 400 Sekunden. Diese Grenzen machen eine vollständige PDF-Extraktion in einem einzelnen synchronen Request zu einem erheblichen Risiko, insbesondere bei langen oder layoutkomplexen Papers. Maßgeblich ist die jeweils aktuelle [Supabase-Limitdokumentation](https://supabase.com/docs/guides/functions/limits).

Als Parser-Kandidat ist `unpdf` technisch interessant: Die Bibliothek beschreibt explizit Deno-/Worker-Unterstützung, nutzt einen serverless PDF.js-Build und kann Text seitenweise über die PDF.js-API auslesen. Die dokumentierte Lizenz ist MIT. Das ist ein **Kandidat für einen isolierten Proof of Concept**, keine bereits bestätigte Kompatibilität oder endgültige Auswahl. Siehe [UnPDF-Dokumentation](https://unjs.io/packages/unpdf/).

### Konsequenz für die Zielarchitektur

- Die Edge Function soll Authentifizierung, Upload-Intent, Dateiverifikation und Job-Erstellung übernehmen.
- Die eigentliche Extraktion sollte nicht allein auf einen lang laufenden Request oder ein flüchtiges `EdgeRuntime.waitUntil()` gestützt werden.
- Vor Implementierung ist eine dauerhafte Job-/Queue-Strategie zu wählen. Ein separater Worker kann PDFs mit kontrollierter Parallelität und Wiederholungslogik verarbeiten.
- Falls ein Edge-Function-basierter Ansatz weiterverfolgt wird, muss zuerst ein kleiner PoC mit realistischen wissenschaftlichen PDFs CPU-Zeit, Speicherbedarf, Seitenzuordnung, Unicode und Fehlerfälle messen. Ein einzelner erfolgreicher Test mit einem Dummy-PDF reicht nicht.
- Die tatsächliche maximale Uploadgröße wird nicht aus dem Storage-Limit allein abgeleitet; sie muss zur Parser- und Worker-Kapazität passen.

**Entscheidung:** `unpdf` wird als erster Parser-Kandidat vorgemerkt, aber noch nicht eingebunden. Die Architektur wird vor der Prozessimplementierung um eine belastbare Job-Ausführung ergänzt. Der aktuelle Function-Scaffold bleibt bei `process-document` deshalb bewusst auf HTTP 501.


## 14. Architekturabgleich: asynchrone Verarbeitung über Cloudflare Queues

Die eigentliche asynchrone PDF-Verarbeitung wird nicht in dieser Supabase Edge Function ausgeführt. Die Funktion bleibt zuständig für authentifizierte Upload-Intents und Statusabfragen. Nach dem direkten Upload bestätigt ein separater Cloudflare Worker den Upload, prüft das Objekt und stellt eine kleine Nachricht mit der Dokument-ID in Cloudflare Queues ein.

Der Queue Consumer läuft in einem **separaten Cloudflare Worker**, nicht im bestehenden Coach-Worker. So bleibt der Service-Role-Key auf den dedizierten Ingestion-Worker begrenzt. Der Coach-Worker erhält keine privilegierten Datenbankrechte.

Die Zielarchitektur, Statusübergänge, Retry-/DLQ-Strategie und Laufzeitgrenzen sind in [CLOUDFLARE_SCIENTIFIC_INGESTION_ARCHITECTURE.md](./CLOUDFLARE_SCIENTIFIC_INGESTION_ARCHITECTURE.md) beschrieben.

Wichtig: Cloudflare Workers haben laut aktueller Dokumentation 128 MB Speicher pro Isolate. Die CPU-Zeit ist planabhängig (Workers Free: 10 ms; Workers Paid: bis zu 5 Minuten konfigurierbar). Queues geben bis zu 15 Minuten Wall-Clock-Zeit, aber heben weder Speicher- noch CPU-Grenzen auf. Deshalb ist ein Parser-PoC zwingend, bevor die Verarbeitung aktiviert wird.

Der bisherige Edge-Function-Scaffold bleibt auf `process-document` mit HTTP 501; die Aktion wird nicht stillschweigend als Queue-Producer missbraucht.


## 15. Aktualisierte Laufzeitentscheidung für Cloudflare Free

Nach Bestätigung des Cloudflare-Free-Tarifs wird die bisherige Queue-/Server-Parsing-Architektur für den MVP verworfen. **Dieser Abschnitt ist maßgeblich und ersetzt die früheren Queue-Aussagen in Abschnitt 14 sowie die serverseitige Parserausführung in den Abschnitten 3C und 5.**

Cloudflare Workers Free haben laut aktueller Dokumentation 10 ms CPU-Zeit pro HTTP-Invocation. Supabase Edge Functions haben 2 Sekunden CPU-Zeit pro Request. Deshalb wird kein vollständiges PDF serverseitig in einem dieser Request-Handler geparst. Cloudflare Queues sind auch im Free-Plan verfügbar, heben die CPU-Grenze des Queue-Consumers aber nicht auf.

### Neuer Ablauf

1. `create-upload-intent` bleibt in der Supabase Edge Function.
2. Der Browser lädt die PDF direkt in den privaten Supabase Storage Bucket.
3. Eine neue Aktion `confirm-upload` prüft serverseitig Dokumenteigentum, privaten Status, erwarteten Pfad, tatsächliches Storage-Objekt, Dateigröße und PDF-Signatur und setzt erst danach `uploaded`.
4. Der Browser extrahiert den Text seitenweise mit einer lokal eingebundenen und fest versionierten PDF.js-basierten Bibliothek.
5. Der Browser sendet kleine, sequenzielle `submit-chunk-batch`-Requests. Die Edge Function prüft bei jedem Request erneut JWT, Eigentum, Sichtbarkeit, Dokumentstatus, Extraktionsversion, Seitenbezug sowie Batch-/Gesamtlimits.
6. Die Funktion schreibt Chunks idempotent unter Nutzung des Unique Keys `(document_id, extraction_version, chunk_index)`.
7. Eine Aktion `complete-extraction` prüft die erwartete Vollständigkeit und setzt erst dann in derselben Transaktion direkt `private_ready`. Teilweise übermittelte Chunks bleiben für Retrieval unsichtbar.
8. `get-document-status` bleibt für Statusabfragen bestehen.

### Zusätzliche Schutzregeln

- Nur private Uploads im ersten MVP; keine Browseraktion darf Shared-Quellen freigeben.
- Clientseitig extrahierter Text ist nicht vertrauenswürdig und darf ausschließlich im privaten Eigentümerkontext gespeichert werden.
- Serverlimits für Batchgröße, Gesamttextmenge, Chunkanzahl und Seitenbereich sind verpflichtend.
- Serverseitige Chunk-Schreibvorgänge müssen idempotent sein; Wiederholungen dürfen keine Duplikate erzeugen.
- Browser- und Clientvalidierung ersetzt keine serverseitige Prüfung.
- Extraktionsversion muss eindeutig sein. Bei einem Neustart mit neuer Version muss eine explizite Bereinigungs-/Ablösestrategie für alte Teil-Chunks bestehen.
- Die UI muss Fortschritt und Fehler transparent darstellen. Bei Tab-Schließen darf der Vorgang nicht als abgeschlossen gelten; ein Resume-/Checkpoint-Mechanismus ist vor Implementierung festzulegen.
- PDF.js wird erst nach einem PoC mit repräsentativen Papers ausgewählt und eingebunden. Seitenzuordnung, Unicode, Tabellen, Spaltenlayout und Ressourcenverbrauch sind zu bewerten.
- OCR bleibt außerhalb des MVP; gescannte PDFs erhalten einen manuellen Prüfstatus.

### Umsetzungsgrenzen

Es wird kein zusätzlicher Cloudflare Worker, kein Queue Binding und keine Cloudflare Queue angelegt. Der bestehende Coach-Worker bleibt unverändert und ohne Service-Role-Key. Der aktuelle Scaffold bleibt bis zur Implementierung der oben beschriebenen Aktionen auf `process-document = 501`.

Quellen zu den Tarifgrenzen: [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) und [Supabase Edge Function Limits](https://supabase.com/docs/guides/functions/limits).


## 16. Frontend-PoC und Abgrenzung der nächsten Edge-Function-Arbeiten

Der erste lokale PDF.js-PoC ist inzwischen als `js/scientific-library.js` in die App eingebunden. Die Ansicht zeigt die lokale seitenweise Extraktion und eine vorläufige Chunk-Vorschau. Sie sendet keine Datei und keinen extrahierten Text an Server und persistiert keine Chunks.

Daraus folgen die nächsten noch offenen serverseitigen Aktionen:

- `confirm-upload`: tatsächliches Storage-Objekt, Eigentümer, erwarteten Pfad, MIME-/PDF-Signatur und Größe prüfen; erst dann `uploaded` setzen.
- `submit-chunk-batch`: JWT, Dokumenteigentum, private Sichtbarkeit, Status, Extraktionsversion, Seitenbereich, Chunk-Anzahl und Batch-/Gesamtgrößen prüfen; idempotent speichern.
- `complete-extraction`: Vollständigkeit und erwartete Chunk-Zählung prüfen; erst danach `extracted` und `private_ready` setzen.
- `get-document-status`: Statusabfrage bleibt bestehen.

Die Edge Function darf keine beliebigen Client-IDs ohne Eigentumsprüfung akzeptieren. Chunk-Schreibrechte müssen an private Dokumente des authentifizierten Nutzers gebunden sein. Die Funktion darf keine Shared-Freigabe durch Client-Anfragen zulassen.

Vor Umsetzung sind SQL-Transaktions-/RPC-Strategie, Batchlimits, Retry-/Resume-Verhalten und Bereinigung unvollständiger Extraktionsversionen festzulegen. Der lokale PoC validiert weder PDF-Inhalt noch Chunk-Qualität und ersetzt diese Sicherheitsprüfungen nicht.

Der Scaffold enthält weiterhin keine dieser neuen Aktionen; `process-document` bleibt HTTP 501. Keine Migration, Storage-Konfiguration oder Deployment wurde durch den Frontend-PoC ausgelöst.

## 17. Atomare Chunk-Persistenz über serverseitige RPCs

Die neue Designvorlage `docs/drafts/SCIENTIFIC_INGESTION_RPC_DRAFT.sql` konkretisiert die Transaktionsgrenze für die clientseitig extrahierten privaten Chunks. Sie ist **keine Migration** und wurde nicht ausgeführt.

Vorgesehener Ablauf nach bestätigtem Upload:

1. Die Edge Function validiert Bearer-JWT erneut über `auth.getUser()` und leitet die User-ID ausschließlich aus dem validierten Ergebnis ab.
2. Sie lädt das Dokument mit `document_id`, `owner_id`, `visibility` und `processing_status` und verlangt `owner_id = auth.uid()`, `visibility = private` sowie den erwarteten Status.
3. `kajo_begin_scientific_extraction` übernimmt das Dokument nur aus `uploaded` nach `extracting`. Wiederholungen sind nur mit derselben Extraktionsversion und denselben gemeldeten Umfangswerten idempotent.
4. `kajo_submit_scientific_chunk_batch` speichert 1–50 Chunks pro Transaktion. Ein Retry mit identischem Index und identischen Feldern wird akzeptiert; ein Retry mit abweichendem Inhalt wird abgewiesen. Es gibt kein Überschreiben bereits gespeicherter Chunk-Inhalte.
5. `kajo_complete_scientific_extraction` setzt `private_ready` erst, wenn alle erwarteten Chunk-Indizes lückenlos von `0` bis `expected_chunk_count - 1` vorhanden sind.

Die RPCs sind als `SECURITY INVOKER` mit leerem `search_path` entworfen. `EXECUTE` soll ausschließlich `service_role` erhalten. Das ist kein Ersatz für die JWT-/Eigentumsprüfung in der Edge Function: Der Service-Role-Client umgeht RLS, deshalb muss die Function vor jedem RPC-Aufruf das Dokument erneut dem authentifizierten Nutzer zuordnen. Die RPCs erlauben keine Shared-Freigabe.

Die im Browser übermittelten Seiten-, Zeichen- und Chunk-Zahlen bleiben nicht vertrauenswürdige Extraktionsmetadaten. Sie dienen der Vollständigkeitskontrolle innerhalb des privaten Dokuments, nicht als unabhängiger Nachweis über den PDF-Inhalt. Ein gescanntes PDF ohne Text benötigt einen separaten Übergang zu `manual_review_required`; es darf nicht als leere erfolgreiche Extraktion abgeschlossen werden.

Noch offen vor Implementierung: Upload-Objektverifikation für `confirm-upload`, Batch-/Gesamtlimits und Rate-Limits in der Edge Function, Resume nach Tab-Abbruch, Bereinigung fehlgeschlagener Extraktionsversionen sowie der Umgang mit OCR. Der vorhandene Function-Scaffold enthält diese RPC-Aktionen noch nicht. Keine Datenbankänderung, Migration, Storage-Konfiguration oder Deployment wurde vorgenommen.

## 18. Edge-Function-Aktionen im Branch ergänzt

Der Scaffold unter `supabase/functions/scientific-ingestion/index.ts` enthält jetzt zusätzlich folgende serverseitige Aktionen. Die Function ist weiterhin **nicht deployed**; die Aktionen sind wegen der noch nicht angewendeten Tabellen-/RPC-/Storage-Entwürfe noch nicht produktiv nutzbar.

- `confirm-upload`: lädt die Dokumentmetadaten ausschließlich anhand von Dokument-ID, authentifiziertem Eigentümer und privater Sichtbarkeit. Storage `info()` prüft tatsächliche Dateigröße und Content-Type. Anschließend wird über eine kurzlebige Signed URL ein HTTP-Range-Request für die PDF-Signatur `%PDF-` versucht. Nur bei erfolgreicher Prüfung wechselt der Status bedingt von `pending` zu `uploaded`.
- `begin-extraction`: begrenzt Seiten-, Chunk- und Zeichenangaben serverseitig und ruft danach die vorgesehene RPC auf.
- `submit-chunk-batch`: begrenzt Batches auf 1–50 Chunks und prüft Eigentümer, Sichtbarkeit, Status und Extraktionsversion vor dem RPC-Aufruf. Der JSON-Request-Body ist auf 900.000 Bytes begrenzt.
- `complete-extraction`: prüft Eigentümer, Status und Extraktionsversion und übergibt den Abschluss an die Vollständigkeits-RPC.
- `mark-manual-review`: setzt private Dokumente ohne zuverlässig extrahierbaren Text auf `manual_review_required`; vorhandene Teil-Chunks bleiben durch die Status-RLS unsichtbar.

Die Function liest den Request-Body begrenzt ein und protokolliert keine Tokens, Dokumentinhalte oder vollständigen Storage-Fehler. Die RPC-Aufrufe verwenden den serverseitigen Admin-Client, weshalb die Eigentumsprüfung vor jedem Aufruf zwingend ist. Die Actions erlauben keine Änderung auf `shared` und keine Quellenfreigabe.

**Offene Verifikation vor Produktivsetzung:** Supabase Storage muss Range-Requests für die Signed-URL-Antwort im Zielprojekt tatsächlich mit HTTP 206 und passendem `Content-Range` beantworten; andernfalls schlägt die Bestätigung absichtlich geschlossen fehl. Der Bucket muss existieren und mit der maximalen Uploadgröße, PDF-MIME-Beschränkung und der separaten Storage-Policy übereinstimmen. Die drei RPCs und Zusatzspalten müssen zuerst nach Reconciliation als Migration freigegeben und angewendet werden. Außerdem fehlen noch Rate-Limits, Ablauf/Abbruchbereinigung und ein Resume-Protokoll für unterbrochene Uploads.

Es wurden keine Tests ausgeführt, keine Migration angewendet, kein Bucket erstellt und keine Function deployed.


## 19. Request-Vertrag der ergänzten Actions

Alle Requests gehen als `POST` an die Function und benötigen einen gültigen Supabase-Bearer-Token. Die User-ID wird ausschließlich aus `auth.getUser()` abgeleitet. Es gibt kein clientseitiges `user_id`-Feld.

```json
{ "action": "confirm-upload", "document_id": "<uuid>" }

{
  "action": "begin-extraction",
  "document_id": "<uuid>",
  "extraction_version": "pdfjs-6.5.438-chunk-v1",
  "page_count": 12,
  "expected_chunk_count": 18,
  "extracted_character_count": 42000
}

{
  "action": "submit-chunk-batch",
  "document_id": "<uuid>",
  "extraction_version": "pdfjs-6.5.438-chunk-v1",
  "chunks": [
    {
      "chunk_index": 0,
      "page_start": 1,
      "page_end": 1,
      "section_heading": null,
      "language": "en",
      "content_text": "..."
    }
  ]
}

{
  "action": "complete-extraction",
  "document_id": "<uuid>",
  "extraction_version": "pdfjs-6.5.438-chunk-v1"
}

{ "action": "mark-manual-review", "document_id": "<uuid>" }
```

Die Chunk-Indizes müssen dokumentweit eindeutig und lückenlos von 0 bis `expected_chunk_count - 1` sein. Die UI muss bei einem Fehler den Status erneut abrufen und darf nicht annehmen, dass ein fehlgeschlagener HTTP-Aufruf keine Daten geschrieben hat: Ein Timeout kann nach erfolgreicher serverseitiger Persistenz auftreten. Identische Batch-Retries sind deshalb vorgesehen; abweichende Inhalte unter demselben Index werden abgewiesen.

Der Vertrag enthält absichtlich keine Aktion zur Shared-Freigabe, keine Änderung von Eigentümer oder Sichtbarkeit und keinen Download-Endpunkt. Der aktuelle lokale PDF.js-Prototyp ruft diese Actions noch nicht auf.
