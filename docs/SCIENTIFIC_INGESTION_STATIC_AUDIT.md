# KAJO – statische Integrationsprüfung der wissenschaftlichen Upload-Pipeline

**Stand:** 16.11.2026  
**Branch:** `integration/coach-ai-v2-latest`  
**Status:** Code-/Dokumentenprüfung; keine Tests, keine Migration, kein Deployment

## 1. Geprüfter Umfang

Geprüft wurden die Entwürfe und der Scaffold für:
- private Upload-Intents und deren 24-Stunden-Ablauf;
- Supabase-Storage-INSERT-Policy;
- browserseitige PDF-Extraktion und Chunk-Persistierung;
- Claim-/Lease-basierte Bereinigung abgelaufener Upload-Intents;
- Edge-Function-Authentifizierung und Statusübergänge.

## 2. Stimmige Schnittstellen

Die folgenden Schnittstellen stimmen in den geprüften Dateien überein:

| Bereich | Abgleich |
|---|---|
| Upload-Intent | RPC liefert `source_id`, `document_id`, `storage_path`, `upload_intent_expires_at`; Edge Function verwendet diese Rückgabefelder |
| Storage-Pfad | RPC, INSERT-Policy und Edge Function erwarten `<owner-uuid>/<document-uuid>/original.pdf` |
| Ablaufzeit | Upload-Intent wird auf 24 Stunden begrenzt; Bestätigung und Storage-Policy prüfen die Ablaufzeit |
| Extraktion | Browser-/Edge-Grenzen stimmen mit den RPC-Grenzen für Seiten, Chunks und Zeichen überein |
| Chunk-Batches | Edge Function begrenzt Batchgröße und Request-Body; RPC prüft Chunk-Indizes und Inhalte erneut |
| Sichtbarkeit | Teilweise gespeicherte Chunks werden laut DDL-Entwurf nicht vor dem finalen Status `private_ready` retrieval-sichtbar |
| Cleanup | Claim-RPC und Edge Function verwenden dieselben Feldnamen: `document_id`, `source_id`, `storage_path`, `claim_token`, `lease_expires_at` |
| Finalisierung | Edge Function übergibt Dokument-ID und Claim-Token an die Finalisierungs-RPC |

Diese Feststellungen sind statische Übereinstimmungen, keine Laufzeitnachweise.

## 3. Aktivierungsblocker

### 3.1 Authentifizierung des Cleanup-Aufrufs

Der Cleanup-Pfad liegt aktuell in `scientific-ingestion` und identifiziert interne Requests über den exakten Service-Role-Bearer. Normale Nutzer-JWTs werden für diese Action abgewiesen. Für einen Scheduler sollte trotzdem eine separate Cleanup-Function mit eigenem rotierbarem Trigger-Secret vorgesehen werden. Der Service-Role-Key bleibt dann ausschließlich internes Server-Credential.

### 3.2 Verhalten bei fehlendem Storage-Objekt

Die aktuelle Function finalisiert nur nach einem fehlerfreien `remove`-Aufruf. Die Supabase-Dokumentation beschreibt die Rückgabe gelöschter Dateien, legt den Fall eines bereits fehlenden Objekts aber nicht eindeutig fest. HTTP 404 darf nicht pauschal als „Objekt fehlt“ gelten, da auch ein fehlender Bucket als 404 dokumentiert ist. Bis zur gezielten Verifikation bleibt die aktuelle fail-closed-Behandlung bestehen.

### 3.3 Lease-Dauer und sequentielle Verarbeitung

Die Claim-RPC vergibt eine 15-Minuten-Lease. Die Function verarbeitet bis zu 25 Objekte sequenziell. Ohne Laufzeitnachweis ist nicht gesichert, dass die Lease für alle Einträge ausreicht. Eine kleinere Batchgröße, Lease-Erneuerung oder begrenzte Parallelisierung muss vor Aktivierung festgelegt werden.

### 3.4 Upload-/Cleanup-Konkurrenz

Die Policy und die Uploadbestätigung prüfen den Cleanup-Claim. Die statische Prüfung beweist jedoch nicht abschließend, dass ein bereits autorisierter, noch laufender Storage-Upload nicht erst nach einer Cleanup-Löschung fertiggestellt werden kann. Das muss durch ein belastbares Upload-Lease-/Abschlussprotokoll oder einen gezielten Integrationsnachweis abgesichert werden.

### 3.5 Teilfehlerstatus

Der Cleanup-Endpunkt kann HTTP 200 mit `retry_required_count > 0` zurückgeben. Ein späterer Scheduler muss den Antwortkörper auswerten oder der Endpoint muss bei Teilfehlern einen Fehlerstatus liefern. HTTP 200 allein bedeutet aktuell nicht, dass der gesamte Batch erfolgreich war.

### 3.6 Rate Limits und Missbrauchsschutz

Der Upload-Endpunkt erzeugt privilegiert Metadaten über eine Service-Role-RPC. Vor Aktivierung sind serverseitige Rate-/Volumenlimits für Upload-Intents und Chunk-Persistierung festzulegen. Clientseitige Limits allein sind kein Schutz.

## 4. Nicht geändert / nicht ausgeführt

- Keine SQL-Datei ausgeführt oder als Migration angelegt.
- Keine Tabellen, Spalten, RPCs oder Policies in Supabase geändert.
- Kein Storage-Bucket angelegt oder verändert.
- Keine Secrets gesetzt oder rotiert.
- Keine Edge Function deployed.
- Keine Tests ausgeführt.
- Kein Merge oder Rebase.

## 5. Empfohlene Reihenfolge

1. Cleanup-Trigger-Authentifizierung von der Service-Role-Berechtigung trennen.
2. Storage-Verhalten bei fehlendem Objekt gezielt verifizieren.
3. Upload-/Cleanup-Rennen und Lease-Strategie abschließend lösen.
4. Rate Limits und Teilfehlervertrag festlegen.
5. DDL, RPCs, Storage-Policies und Edge Function nochmals gegen den tatsächlichen Remote-Schema- und Migrationsstand abgleichen.
6. Erst danach eine Migration und einen kontrollierten Deployment-Plan vorbereiten.


## 6. Ergänzung: Upload-/Cleanup-Rennen

Der Claim allein kann nur neue Storage-INSERT-Autorisierungen verhindern. Er kann einen Storage-Request, dessen Policy-Prüfung bereits vor dem Claim erfolgreich war, nicht rückwirkend abbrechen. Deshalb wurde im Cleanup-RPC-Entwurf ein persistenter Quieszenz-Zeitstempel ergänzt. Nach dem ersten Claim wartet die Edge Function bis `cleanup_ready_at` (derzeit 24 Stunden) und löscht erst dann das Storage-Objekt. Lease-Reclaims verändern den ursprünglichen Quieszenz-Zeitpunkt nicht.

Dies reduziert das Rennen, ist aber nur unter einer klar begrenzten Uploadmethode belastbar. Vor Aktivierung müssen maximale Laufzeit und Fortsetzbarkeit der verwendeten Supabase-Storage-Uploadmethode bestätigt werden. Unbegrenzte resumable Sessions benötigen ein separates Session-Ablauf-/Widerrufsprotokoll. Die 24 Stunden sind noch ein vorläufiger Wert und keine verifizierte Supabase-Garantie.

Die Edge Function meldet noch nicht löschbereite Einträge separat als `deferred_count`; sie löscht weder Objekt noch Metadaten vor Ablauf der Quieszenz.


## 7. Präzisierung: Upload ist derzeit noch nicht implementiert

Die aktuelle `js/scientific-library.js` führt ausschließlich eine lokale PDF.js-Extraktion durch. Sie enthält keinen Aufruf von Supabase Storage, keine Erzeugung eines Upload-Intents und keinen Aufruf von `confirm-upload`. Die Upload- und Cleanup-Rennen sind daher derzeit ein Architektur-/Zukunftsrisiko, kein aktuell laufender App-Workflow.

Die konkrete Uploadmethode (Standard-Upload oder TUS/resumable), ein maximales Upload-Dateilimit und ein Abbruch-/Session-Ablauf sind noch nicht entschieden. Der vorläufige 24-Stunden-Quieszenzwert darf deshalb nicht als technisch verifiziert gelten.

Zusätzlich wurde die 24-Stunden-Bedingung in die Finalisierungs-RPC aufgenommen. Die Datenbank soll Metadaten nicht nur dann löschen, wenn die Edge Function den Zeitpunkt geprüft hat, sondern verlangt dieselbe Bedingung nochmals selbst.
