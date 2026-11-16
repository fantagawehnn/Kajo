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
