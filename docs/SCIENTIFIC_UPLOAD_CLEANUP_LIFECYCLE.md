# KAJO – Lifecycle und Bereinigung privater wissenschaftlicher Uploads

**Stand:** 16.11.2026  
**Branch:** `integration/coach-ai-v2-latest`  
**Status:** Sicherheitsentwurf – nicht implementiert, keine Migration, keine Bereinigung aktiv

## 1. Ziel und Geltungsbereich

Dieser Entwurf beschreibt den Umgang mit privaten PDF-Upload-Intents, die nach 24 Stunden ablaufen. Die Ablaufprüfung verhindert neue Uploads und die spätere Bestätigung eines abgelaufenen `pending`-Intents. Sie löscht jedoch weder den Metadatensatz noch ein möglicherweise bereits angelegtes Storage-Objekt.

Die Bereinigung darf ausschließlich eindeutig verwaiste, nie bestätigte Uploads betreffen. Bereits bestätigte oder verarbeitete Dokumente müssen erhalten bleiben.

## 2. Unveränderliche Schutzregeln

Eine automatische Bereinigung darf niemals Datensätze mit einem der folgenden Status löschen oder verändern:

- `uploaded`
- `extracting`
- `extracted`
- `review_pending`
- `private_ready`
- `manual_review_required`
- `rejected`

Auch `failed` darf nicht pauschal bereinigt werden: Der Status kann aus anderen Verarbeitungsfehlern stammen und ist kein Beleg für einen abgelaufenen Upload-Intent.

Berechtigt sind ausschließlich Dokumente, für die alle folgenden Bedingungen gelten:

1. `visibility = 'private'`
2. `processing_status = 'pending'`
3. `upload_intent_expires_at` ist gesetzt und abgelaufen
4. Eine zusätzliche Karenzzeit nach Ablauf ist verstrichen
5. Der zugehörige Source-Datensatz ist ebenfalls privat und gehört demselben Eigentümer
6. Der Datensatz wurde nicht bereits durch einen anderen Cleanup-Lauf beansprucht

Die Karenzzeit ist bewusst noch nicht festgelegt. Als Vorschlag gelten sieben Tage nach Ablauf des 24-Stunden-Intents. Das ist eine Produktentscheidung und muss vor Aktivierung bestätigt werden.

## 3. Vorgeschlagener Bereinigungsablauf

Die Bereinigung soll ausschließlich serverseitig über eine privilegierte Supabase Edge Function erfolgen. Browser erhalten weder Storage-DELETE-Rechte noch eine Möglichkeit, Cleanup-Aufträge für beliebige Dokumente auszulösen.

### Schritt A – atomarer Claim

Eine dedizierte RPC beansprucht in einer kurzen Datenbanktransaktion eine begrenzte Anzahl geeigneter Datensätze, beispielsweise mit `FOR UPDATE SKIP LOCKED`. Die RPC prüft alle Bedingungen aus Abschnitt 2 erneut und setzt einen expliziten Cleanup-Marker bzw. Claim-Zeitstempel. Sie liefert nur die serverseitig gespeicherten Dokument-IDs, Source-IDs und exakten Storage-Pfade zurück.

Der Claim muss idempotent sein. Gleichzeitige Cleanup-Läufe dürfen dasselbe Dokument nicht parallel bearbeiten. Für abgebrochene Worker-Läufe ist eine zeitlich begrenzte Claim-Lease mit kontrollierter Wiederbeanspruchung vorzusehen.

### Schritt B – Storage-Objekt entfernen

Die Edge Function löscht ausschließlich das zurückgegebene Objekt aus dem fest konfigurierten privaten Bucket `kajo-scientific-documents`. Sie darf den Pfad nicht aus Clientdaten übernehmen oder zusammensetzen.

Ein bereits nicht vorhandenes Objekt gilt als erfolgreich bereinigt. Ein anderer Storage-Fehler darf nicht als Erfolg behandelt werden; der Metadatensatz bleibt für einen späteren Retry erhalten.

### Schritt C – Metadaten atomar finalisieren

Erst nach bestätigter Storage-Löschung (oder bestätigtem Nichtvorhandensein) ruft die Function eine zweite RPC auf. Diese prüft erneut den Cleanup-Marker, den privaten Status und den abgelaufenen Intent. Danach können Dokument und zugehörige private Source innerhalb einer Transaktion gelöscht werden. Vorher ist sicherzustellen, dass keine weiteren Dokumente auf dieselbe Source verweisen.

Die Fremdschlüsselbeziehung der Chunk-Tabelle löscht zugehörige Chunks bei Dokumentlöschung kaskadierend. Im vorgesehenen Cleanup-Fall sollten noch keine Chunks existieren, weil ausschließlich `pending`-Dokumente zugelassen sind; die RPC muss dies dennoch prüfen oder die erwartete Chunk-Abwesenheit explizit absichern.

## 4. Fehler- und Wiederanlaufverhalten

| Fehlerpunkt | Sicheres Verhalten |
|---|---|
| Claim-RPC schlägt fehl | Keine Storage- oder Metadatenlöschung |
| Worker bricht nach Claim ab | Claim-Lease läuft ab; späterer Lauf darf denselben geeigneten Datensatz erneut beanspruchen |
| Storage-Objekt fehlt bereits | Als idempotent erfolgreich behandeln und Metadaten-Finalisierung fortsetzen |
| Storage-Löschung schlägt fehl | Metadaten behalten; Fehler intern protokollieren; Retry ermöglichen |
| Metadaten-Finalisierung schlägt fehl | Storage-Objekt ist bereits gelöscht; Claim bleibt wiederholbar, Finalisierung wird erneut versucht |
| Dokumentstatus änderte sich vor Claim | Claim-RPC lehnt ab; Dokument bleibt unangetastet |
| Dokumentstatus änderte sich nach Claim | Der Claim muss den Statuswechsel sperren bzw. andere Statusübergänge müssen einen aktiven Cleanup-Claim ausschließen |

Die letzte Bedingung ist wichtig: Der Ablauf muss gegen konkurrierende Requests abgesichert sein. Ein reiner SELECT mit anschließendem DELETE reicht nicht aus.

## 5. Noch nicht festgelegte technische Entscheidungen

Vor Implementierung sind zu entscheiden und im Schema-/RPC-Entwurf konsistent abzubilden:

- Karenzzeit nach Intent-Ablauf (Vorschlag: sieben Tage)
- Claim- und Lease-Felder einschließlich Wiederanlauf nach Worker-Abbruch
- RPC-Verträge für Claim und Finalisierung
- Umgang mit mehreren Dokumenten pro Source (Löschung der Source nur, wenn keine weiteren Dokumente referenzieren)
- Batchgröße und maximale Laufzeit je Cleanup-Aufruf
- Ausführungsrhythmus: zunächst manueller serverseitiger Aufruf; später ggf. Supabase Cron, sofern Tarif und Betrieb dies erlauben
- minimale, datensparsame Fehlerprotokollierung und Monitoring

Es wird kein zusätzlicher Cloudflare Worker und keine Cloudflare Queue benötigt. Die Bereinigung ist eine kurze Storage-/Metadatenoperation und gehört in die bestehende Supabase-Infrastruktur.

## 6. Nicht umgesetzt

- Keine Cleanup-RPC geschrieben oder ausgeführt
- Keine neuen Tabellenspalten oder Statuswerte angelegt
- Keine Storage-DELETE-Policy für Browser erstellt
- Keine Edge-Function-Cleanup-Action implementiert
- Kein Scheduler/Cron eingerichtet
- Keine Migration, Tests oder Deployments durchgeführt

**Aktivierungsblocker:** Erst nach Festlegung der Karenzzeit, Ausarbeitung der Claim-/Lease-Mechanik und statischer Abstimmung mit dem tatsächlichen Schema darf daraus eine konkrete Implementierung entstehen.


## 7. Konkretisierte Claim-/Lease-Mechanik

Der SQL-Entwurf [SCIENTIFIC_UPLOAD_CLEANUP_RPC_DRAFT.sql](./drafts/SCIENTIFIC_UPLOAD_CLEANUP_RPC_DRAFT.sql) konkretisiert die Claim- und Finalisierungsschritte:

- `upload_cleanup_claimed_at` und `upload_cleanup_claim_token` bilden gemeinsam den Claim-Zustand. Beide Werte sind entweder gesetzt oder beide `NULL`.
- Die Claim-RPC verarbeitet höchstens 25 Datensätze pro Aufruf und verwendet `FOR UPDATE SKIP LOCKED`.
- Ein Claim gilt im Entwurf 15 Minuten. Nach Ablauf kann ein anderer Lauf ihn mit einem neuen zufälligen Token übernehmen.
- Der Claim akzeptiert nur private, nie bestätigte `pending`-Dokumente mit abgelaufenem Intent plus Karenzzeit, passendem privaten Parent-Datensatz, kanonischem Storage-Pfad und ohne Chunk-Datensätze.
- Die Finalisierungs-RPC verlangt dasselbe aktuelle Claim-Token und eine noch gültige Lease. Ein alter Worker kann nach einer Neuvergabe daher keine Metadaten mehr löschen.

### Konkurrenz mit Uploadbestätigung

Die bestehende `confirm-upload`-Action wurde vorsorglich so angepasst, dass sie einen beanspruchten Datensatz ablehnt und der bedingte Statuswechsel zusätzlich `upload_cleanup_claim_token IS NULL` verlangt. Damit gilt auf Datenbankebene: Gewinnt die Bestätigung zuerst, passt der Cleanup-Claim nicht mehr auf den Status `pending`; gewinnt der Claim zuerst, kann die Bestätigung den Status nicht mehr auf `uploaded` setzen.

Die Storage-INSERT-Policy verlangt ebenfalls einen leeren Claim-Token. Das verhindert neue Upload-Autorisierungen nach dem Claim. Die Änderung ist nur ein Entwurf für die spätere Storage-Migration und setzt voraus, dass die Claim-Spalte vorher angelegt wurde.

### Wichtige Grenze

Die Claim-RPC löscht weder Storage noch Metadaten. Die Edge Function muss nach dem Claim den exakt zurückgegebenen Pfad im festgelegten Bucket löschen und darf nur bei erfolgreicher Löschung bzw. bestätigtem Nichtvorhandensein finalisieren. Sonstige Storage-Fehler müssen den Vorgang abbrechen und einen späteren Retry ermöglichen.

**Noch nicht umgesetzt:** Die Cleanup-Edge-Function-Action, die Storage-Löschung, die Finalisierungs-RPC-Ausführung und ein Scheduler fehlen. Die 7-Tage-Karenz und 15-Minuten-Lease sind vorläufige Entwurfswerte.
