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


## 8. Serverseitige Action – Scaffold

Die Edge Function enthält jetzt `cleanup-expired-uploads` als internen Ausführungspfad:

- Aufruf nur mit dem exakt konfigurierten Service-Role-Bearer; normale Nutzer-JWTs werden abgewiesen.
- Interne Requests dürfen ausschließlich diese Action ausführen.
- Zusätzliche Aktivierungssperre über `SCIENTIFIC_UPLOAD_CLEANUP_ENABLED=true`; ohne diese serverseitige Variable bleibt die Action deaktiviert.
- Batchgröße 1–25; Pfad wird auf drei Segmente, gültige UUIDs und das Muster `<owner-uuid>/<document-uuid>/original.pdf` geprüft.
- Storage-Löschung im fest kodierten privaten Bucket; bei Storage-Fehlern erfolgt keine Metadaten-Finalisierung.
- Metadaten-Finalisierung mit dem zurückgegebenen Claim-Token.

Die Funktion wurde nicht deployed. Die Variable wurde nicht gesetzt. Die SQL-RPCs und Claim-Spalten sind weiterhin nur Entwürfe; deshalb kann der Ablauf im aktuellen Supabase-Schema noch nicht funktionieren. Es gibt keinen Scheduler und keinen automatischen Aufruf.


## 9. Noch zu verifizierendes Storage-Verhalten

Vor Aktivierung muss im Zielprojekt geklärt werden, wie die verwendete Supabase-Storage-Version `remove([path])` behandelt, wenn das Objekt bereits nicht existiert. Der aktuelle Scaffold finalisiert nur dann, wenn der Storage-Aufruf ohne Fehler zurückkehrt. Ein als Fehler gemeldetes Nichtvorhandensein wird daher vorerst wie jeder andere Löschfehler behandelt: keine Metadatenlöschung, späterer Retry bzw. manuelle Prüfung. Es wird nicht pauschal jeder Storage-Fehler als „Objekt fehlt“ interpretiert.

Die Lease wird vor Beginn jeder Objektlöschung geprüft. Läuft sie während eines Storage-Aufrufs ab, verhindert die Finalisierungs-RPC eine Finalisierung mit abgelaufenem oder ersetztem Claim-Token. In diesem Fall kann das Objekt bereits gelöscht sein, während die Metadaten bestehen bleiben; der spätere Retry muss diesen Zustand sicher auflösen können. Dieses Wiederanlaufverhalten ist vor einem produktiven Betrieb anhand des tatsächlichen Storage-Verhaltens zu verifizieren.


## 10. Statische Prüfung der Cleanup-Ausführung (16.11.2026)

Die aktuelle Edge-Function-Fassung wurde gegen die Claim-/Finalisierungs-RPC und die Storage-Policy geprüft. Die Prüfung ist statisch; sie ersetzt weder einen Storage-Integrationstest noch eine Datenbankmigration.

### Authentifizierung: aktueller Stand und notwendige Trennung

Die Action `cleanup-expired-uploads` liegt derzeit innerhalb von `scientific-ingestion`. Sie akzeptiert als internen Aufruf den exakten Service-Role-Bearer und weist normale Nutzer-JWTs für diese Action ab. Das ist nicht öffentlich nutzbar, solange der Service-Role-Key ausschließlich serverseitig gespeichert bleibt. Der Key ist jedoch ein umfassendes privilegiertes Credential und sollte nicht zugleich als eigenständiges Scheduler-/Trigger-Secret verwendet werden.

Vor Aktivierung ist deshalb eine separate interne Cleanup-Function mit eigenem, rotierbarem Aufruf-Secret vorzuziehen. Der Service-Role-Key bleibt ausschließlich als serverseitiges Datenbank-/Storage-Credential in dieser Function. Die Cleanup-Function darf keine Browser-CORS-Freigabe benötigen. Eine bloße CORS-Prüfung ist keine Authentifizierung.

### Storage-Löschung: bewusst fail-closed

Die aktuelle Action finalisiert Metadaten nur, wenn `storage.remove([path])` ohne Fehler zurückkehrt. Das ist sicherer als einen beliebigen 404-Fehler als „Objekt fehlt“ zu behandeln.

Die aktuelle Supabase-Dokumentation beschreibt `remove` als Löschoperation, die die gelöschten File-Objekte zurückgibt, dokumentiert aber nicht eindeutig den Rückgabefall für einen bereits fehlenden Objektpfad. Die Storage-Fehlerdokumentation unterscheidet unter anderem `NoSuchKey` und `NoSuchBucket`, beide mit HTTP 404. Daher darf nicht pauschal jeder 404 als idempotenter Erfolg interpretiert werden. Bis ein konkretes Verhalten mit der tatsächlich eingesetzten Storage-Version verifiziert ist, gilt:
- erfolgreicher `remove`-Aufruf: Finalisierung darf versucht werden;
- jeder `remove`-Fehler: keine Metadatenlöschung, Claim nach Lease-Ablauf erneut bearbeitbar;
- fehlendes Bucket, fehlende Berechtigung und sonstige Storage-Fehler bleiben Fehler und müssen sichtbar bleiben.

### Lease und Batchlauf

Die RPC vergibt eine 15-Minuten-Lease pro Dokument. Die Function verarbeitet die beanspruchten Objekte derzeit sequenziell. Bei einer größeren Batchgröße kann die Lease einzelner späterer Einträge während der Verarbeitung ablaufen. Die Finalisierungs-RPC verhindert dann zwar eine veraltete Metadatenlöschung, aber ein bereits gelöschtes Storage-Objekt kann bis zum nächsten Claim-Lauf mit vorhandenen Metadaten zurückbleiben.

Vor Aktivierung muss daher eine der folgenden Varianten verbindlich gewählt werden:
- kleine Batchgröße passend zur gemessenen Laufzeit;
- Lease-Erneuerung je Dokument vor der Storage-Operation;
- oder parallele, begrenzte Verarbeitung mit einer konservativ dimensionierten Lease.

Eine automatische Lease-Verlängerung ist noch nicht implementiert.

### Upload-/Cleanup-Rennen

Die Storage-INSERT-Policy prüft `upload_cleanup_claim_token IS NULL`, und `confirm-upload` prüft denselben Zustand beim Statuswechsel. Das schützt die normalen sequenziellen Abläufe. Die genaue Konkurrenz zwischen einem bereits laufenden Storage-Upload und einem gleichzeitig gesetzten Cleanup-Claim ist jedoch durch diese statische Prüfung allein nicht abschließend bewiesen. Vor Aktivierung muss geklärt werden, ob die Storage-Objektanlage und die Policy-Prüfung mit dem Claim-Update ausreichend serialisiert sind. Andernfalls ist ein zusätzliches Upload-Lease-/Abschlussprotokoll nötig, damit kein bereits autorisierter Upload erst nach der Cleanup-Löschung ein Objekt hinterlässt.

### Teilfehler und Monitoring

Die Action gibt bei teilweisen Fehlern derzeit HTTP 200 mit `retry_required_count` zurück. Ein späterer Scheduler muss deshalb den Antwortkörper auswerten und darf HTTP 200 nicht allein als vollständig erfolgreiche Bereinigung interpretieren. Alternativ kann der Endpoint bei Teilfehlern einen expliziten Fehlerstatus liefern; diese Entscheidung ist vor Einrichtung eines Schedulers zu treffen.

**Ergebnis:** Der aktuelle Scaffold ist fail-closed für Storage- und Finalisierungsfehler. Er ist noch nicht aktivierungsreif. Offen sind insbesondere getrennte Trigger-Authentifizierung, verifiziertes Verhalten bei fehlendem Objekt, Lease-Strategie, Konkurrenz mit laufenden Uploads und Scheduler-Fehlerauswertung.


## 11. Upload-Quieszenz vor Storage-Löschung

Die Claim-Policy verhindert neue Storage-INSERT-Autorisierungen, kann aber keinen Upload abbrechen, dessen Storage-Request die Policy bereits vor dem Claim erfolgreich passiert hat. Ein solcher Request könnte theoretisch erst nach einer unmittelbar folgenden Storage-Löschung fertig werden.

Der Claim-Entwurf erhält deshalb zusätzlich `upload_cleanup_quiesced_at`. Beim ersten Claim wird dieser Zeitstempel einmalig gesetzt und bei späteren Lease-Reclaims beibehalten. Die RPC gibt `cleanup_ready_at` als Zeitpunkt 24 Stunden nach Beginn der Quieszenz zurück. Die Edge Function löscht das Objekt erst, wenn dieser Zeitpunkt erreicht ist. Vorher meldet sie den Eintrag als `deferred_count` und führt keine Storage- oder Metadatenlöschung aus.

Die 24 Stunden sind ein konservatives Drain-Fenster, aber kein mathematischer Beweis, dass jede denkbare Upload-Verbindung beendet ist. Vor Aktivierung muss die Uploadmethode festgelegt werden; insbesondere dürfen keine unbegrenzt fortsetzbaren/resumable Upload-Sessions ohne eigenes Ablauf- und Widerrufsprotokoll verwendet werden. Das Zeitfenster muss anhand der tatsächlich unterstützten Supabase-Storage-Uploadmethode und ihrer maximalen Request-/Session-Laufzeit bestätigt werden.

Die 15-Minuten-Lease bleibt davon getrennt: Sie schützt den exklusiven Bearbeitungsanspruch eines Workers. Das 24-Stunden-Fenster schützt vor bereits autorisierten Uploads. Ein späterer Worker kann nach Ablauf der Lease denselben Datensatz erneut claimen, erhält aber denselben Quieszenz-Startzeitpunkt. Erst nach `cleanup_ready_at` darf er die Storage-Löschung versuchen.

**Status:** SQL- und Edge-Function-Scaffold angepasst; nicht migriert, nicht deployed und nicht getestet.


## 12. Datenbankseitige Durchsetzung der Quieszenz

Die Finalisierungs-RPC prüft jetzt zusätzlich selbst, dass `upload_cleanup_quiesced_at` mindestens 24 Stunden zurückliegt. Die Edge Function allein ist damit nicht die einzige Stelle, die den Wartezeitpunkt erzwingt. Auch ein direkter Aufruf der service_role-RPC mit gültigem Claim-Token kann vor Ablauf der Quieszenz keine Metadaten löschen.

Das ist eine zusätzliche Schutzbedingung, kein Beweis für das Ende jedes Storage-Requests. Die Quieszenz ist erst belastbar, wenn die konkrete Uploadmethode begrenzt ist und keine fortsetzbaren Upload-Sessions über das Zeitfenster hinaus existieren können.


## 13. TUS als bevorzugte Uploadmethode

Der bevorzugte Uploadweg für die spätere Implementierung ist Supabase TUS Resumable Upload. Supabase dokumentiert eine Gültigkeit der erzeugten Upload-URL von bis zu 24 Stunden. Nach Ablauf muss eine neue Upload-Session angelegt werden. Zusammen mit dem 24-Stunden-Intent, der siebentägigen Karenz nach Intent-Ablauf und der zusätzlichen 24-Stunden-Quieszenz ergibt sich ein bewusst konservativer Cleanup-Abstand.

Diese Werte sind nicht als absolute Garantie zu verstehen. Vor Aktivierung müssen die TUS-Clientbibliothek, das tatsächliche Projekt-/Bucket-Dateilimit und das Verhalten bei abgebrochenen bzw. abgelaufenen Sessions konkret verifiziert werden. Derzeit existiert noch kein Upload-Frontend; die Festlegung ist eine Architekturentscheidung für die nächste Implementierungsphase.