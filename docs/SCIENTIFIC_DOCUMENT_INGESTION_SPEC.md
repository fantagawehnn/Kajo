# KAJO – Spezifikation der wissenschaftlichen Dokumentverarbeitung

**Status:** Implementierungsspezifikation, noch keine produktive Upload- oder Ingestion-Funktion  
**Branch:** `integration/coach-ai-v2-latest`  
**Ziel:** Reproduzierbare, rechtebewusste Aufnahme wissenschaftlicher Quellen für den Performance-Coach

## 1. Ausgangslage und Grenzen

Die aktuelle KAJO-App speichert persönliche Trainingsdaten lokal in IndexedDB/localStorage und synchronisiert ausgewählte Kontodaten über die bestehende Supabase-Architektur. Die Scientific Knowledge Base ist davon getrennt.

Der vorhandene Cloudflare Worker stellt derzeit nur den authentifizierten Chat-Endpunkt `POST /api/coach` bereit. Im Repository liegt inzwischen ein nicht deploytes Supabase-Edge-Function-Scaffold für Upload-Intents, Uploadbestätigung und Chunk-Batches. Da die zugehörigen Tabellen, RPCs, Storage-Buckets und Policies noch nicht angelegt sind und die Frontend-Ansicht die Actions noch nicht aufruft, besteht noch kein aktivierter Dokument-Uploadprozess und kein Coach-Retrieval. Der bestehende Storage-Bucket `garmin-fit` ist für Garmin-Daten vorgesehen und wird nicht für Paper wiederverwendet.

Diese Spezifikation ist kein Beleg dafür, dass bereits eine Upload-Funktion existiert.

## 2. Daten- und Verarbeitungsfluss

Geplanter Ablauf:

1. Nutzer oder autorisierte Kuratorin erfasst bibliografische Metadaten.
2. Das System prüft Dateityp, Dateigröße und Eigentums-/Freigabekontext.
3. Die Datei wird in einem dedizierten privaten Storage-Bucket abgelegt.
4. Ein vertrauenswürdiger serverseitiger Prozess prüft Datei und Metadaten erneut.
5. Text wird extrahiert; das Original bleibt unverändert.
6. Extraktionsstatus, Version und Prüfsumme werden gespeichert.
7. Textabschnitte werden mit Seiten-/Abschnittsbezug und Quell-ID abgelegt.
8. Erst nach expliziter Festlegung von Embedding-Modell und Dimension werden Vektoren berechnet.
9. Eine fachliche Kuratierung prüft Metadaten, Studiendesign, Population, Ergebnisse und Transferierbarkeit.
10. Nur freigegebene Inhalte werden für die gemeinsame Coach-Suche freigegeben.

Private Uploads bleiben privat. Ein privates Paper darf nicht stillschweigend in den gemeinsamen Literaturbestand überführt werden.

## 3. Rollen und Vertrauensgrenzen

### Browser / angemeldeter Nutzer

- Darf nur eigene private Uploads anlegen und lesen.
- Darf keine gemeinsamen Quellen freigeben oder kuratieren.
- Darf keine Extraktions-, Chunking- oder Embedding-Jobs als privilegierte Aktion auslösen.
- Darf keine fremden Storage-Pfade erraten oder lesen.

### Vertrauenswürdiger Ingestion-Prozess

- Verifiziert den Supabase-JWT serverseitig.
- Leitet die Nutzer-ID aus dem validierten Token ab, niemals aus einem frei übermittelten `user_id`-Feld.
- Prüft Objektpfad, Dateigröße, MIME-Type und Metadaten erneut.
- Verwendet privilegierte Schlüssel ausschließlich als serverseitige Secrets.
- Schreibt nur in die vorgesehenen Tabellen und Buckets.
- Protokolliert Statuswechsel und Fehler ohne vollständige Paper-Inhalte oder Zugangstokens in Logs.

### Kuratierungsrolle

- Wird über eine serverseitig kontrollierte Rolle bzw. explizite ACL vergeben.
- Rollen aus frei änderbaren `user_metadata` sind keine Autorisierungsgrundlage.
- Darf gemeinsame Quellen prüfen und freigeben.
- Freigabe und Ablehnung werden mit Zeitstempel und verantwortlicher Rolle nachvollziehbar gemacht.

## 4. Dokumentstatus und Fehlerbehandlung

Die Statuslogik wird bewusst auf zwei Ebenen getrennt:

- `scientific_documents.processing_status` bildet den technischen Verarbeitungszustand ab.
- `scientific_sources.review_status` bildet die fachliche Freigabe der Quelle ab.

Für ein gemeinsames Dokument gilt:

`pending → uploaded → extracting → extracted → review_pending`

Nach der fachlichen Prüfung wird die **Quelle** auf `approved` oder `rejected` gesetzt. `approved` ist daher kein Dokument-Verarbeitungsstatus.

Für einen privaten Upload gilt:

`pending → uploaded → extracting → extracted → private_ready`

Alternative Endzustände:

- `rejected`: Datei oder Quelle besteht eine Rechte-, Sicherheits- oder Qualitätsprüfung nicht.
- `failed`: technischer Fehler; erneuter Versuch möglich, ohne Duplikate anzulegen.

`review_pending` ist nur für gemeinsame Dokumente zulässig; `private_ready` nur für private Dokumente. Ein privater Upload wird nicht durch den technischen Status zur gemeinsamen Quelle.

Statuswechsel müssen idempotent sein. Eine wiederholte Anfrage mit derselben Dokument-ID darf keine doppelten Chunks oder mehrfachen Freigaben erzeugen. Die Prüfsumme dient zur Erkennung identischer Dateien, ersetzt aber nicht die Prüfung unterschiedlicher Versionen einer Publikation.

## 5. Dateiprüfung und Extraktion

Für den MVP zunächst PDF als einziges Dokumentformat unterstützen. Andere Formate werden abgewiesen, bis ein eigener Parser und Sicherheitsprozess vorgesehen ist.

Mindestprüfungen:

- Dateigrößenlimit vor Upload und erneut serverseitig.
- MIME-Type nicht allein aus dem Browser übernehmen; Dateiinhalt zusätzlich prüfen.
- PDF-Signatur und Parserfehler kontrollieren.
- Verschlüsselte, beschädigte oder nicht textuell extrahierbare PDFs als Fehler bzw. manuelle Prüfung markieren.
- Keine eingebetteten Skripte oder Anhänge ausführen.
- Keine OCR ohne explizite Entscheidung; gescannte PDFs zunächst als `manual_review_required` kennzeichnen.
- Originaldatei unverändert aufbewahren, soweit die Speicherrechte dies erlauben.

Extraktion muss Seitenzahlen erhalten. Wo eine verlässliche Seitenzuordnung nicht möglich ist, darf das System keine Seitenangabe erfinden.

## 6. Chunk- und Evidenzmodell

Jeder Textabschnitt wird als eigener Datensatz in `scientific_document_chunks` gespeichert und muss mindestens folgende Herkunftsinformationen tragen:

- `document_id` (die zugehörige `source_id` wird über das Dokument aufgelöst)
- fortlaufende Chunk-Nummer je Dokument und Extraktionsversion
- Seitenbereich oder Abschnittsüberschrift, falls verfügbar
- Extraktionsversion
- Sprache
- Textinhalt
- Status der fachlichen Prüfung

Später ergänzbare strukturierte Evidenzfelder:

- Studiendesign
- Stichprobe und Population
- Geschlecht/Alter/Leistungsniveau, sofern berichtet
- Sportart und Disziplin
- Intervention bzw. Exposition
- Vergleichsgruppe
- Outcome und Messmethode
- Hauptergebnis und Unsicherheit
- Limitationen
- Übertragbarkeit auf Kanu-Ausdauertraining

Automatisch extrahierte Ergebnisfelder sind zunächst Vorschläge und keine bestätigten Fakten. Der Coach muss zwischen Originalbefund, automatischer Extraktion und fachlich geprüfter Zusammenfassung unterscheiden.

## 7. Rechte- und Lizenzregeln

Die Möglichkeit, ein PDF technisch abzurufen, bedeutet nicht, dass es dauerhaft gespeichert, gechunkt, eingebettet oder anderen Nutzern zugänglich gemacht werden darf.

Für jede Quelle wird deshalb ein `access_basis` dokumentiert, zum Beispiel:

- Open Access mit geprüfter Lizenz
- institutionelle oder vertragliche Lizenz
- vom Autor bereitgestellte Datei
- nur bibliografischer Link, kein Volltextspeicher
- privater Nutzer-Upload
- ungeklärt

Bei ungeklärter Rechtsgrundlage bleibt der Volltext außerhalb der gemeinsamen Wissensbasis. Für Link-only-Quellen können bibliografische Metadaten und ein externer Link gespeichert werden, sofern dies zulässig ist.

Die gemeinsame Lesbarkeit der Chunks folgt der Freigabe der übergeordneten Quelle: Nur Chunks eines genehmigten Shared-Source-Dokuments dürfen in die gemeinsame Suche gelangen. Private Chunks bleiben ausschließlich für den jeweiligen Eigentümer lesbar. Browser-Schreibrechte sind im Schemaentwurf nicht vorgesehen.

## 8. Vorhandene serverseitige Integrationsbasis

Im Repository existiert bereits `supabase/functions/garmin-personal/index.ts`. Die Funktion zeigt ein bestehendes Muster, das für eine separate Knowledge-Ingestion-Edge-Function geprüft und teilweise wiederverwendet werden kann:

- Supabase-URL, Anon-Key und Service-Role-Key werden ausschließlich aus Edge-Function-Umgebungsvariablen gelesen.
- Nutzeranfragen werden über den Bearer-Token mit einem Anon-Client und `auth.getUser()` validiert.
- Die User-ID wird anschließend aus dem validierten Nutzerobjekt übernommen.
- Privilegierte Datenbank- und Storage-Aktionen laufen über einen getrennten Admin-Client.
- Hintergrundaktionen verwenden einen eigenen serverseitigen Secret-Mechanismus.

Das spricht dafür, die Dokumentverarbeitung als **separate Supabase Edge Function** umzusetzen und nicht den bestehenden Cloudflare-Chat-Worker mit einem Service-Role-Key auszustatten. Die neue Funktion muss eine eigene, eng begrenzte Aktionsoberfläche erhalten; Garmin-spezifische Logik oder Secrets werden nicht übernommen.

Die vorhandene Funktion ist dabei ein Architekturbeispiel, keine fertige Upload-Lösung. Ihre CORS-Konfiguration, JWT-Prüfung, Rate-Limits und Fehlerprotokollierung müssen vor Wiederverwendung konkret geprüft werden.

## 9. Schnittstellen – noch nicht implementiert

Vorgeschlagene API-Aufteilung:

- `POST /api/knowledge/upload-intent`: prüft Berechtigung und erzeugt einen begrenzten Upload-Vorgang.
- Direkter Upload in den privaten Storage-Bucket mit kurzlebigem, eng begrenztem Upload-Pfad.
- `POST /api/knowledge/process`: stößt die Verarbeitung nur nach serverseitiger Verifikation an.
- `POST /api/knowledge/status` (MVP-Alternative zu einem GET-Pfad): gibt nur Status und Metadaten zurück, die der Nutzer sehen darf.
- Interne Kuratierungsaktion: Freigabe der übergeordneten Quelle nur für berechtigte Rollen.

Die konkrete HTTP-Routenform ist noch nicht festgelegt; die Aktionsnamen sind fachliche Schnittstellenvorschläge, keine bereits vorhandenen App-Routen.

Für den MVP ist eine **separate Supabase Edge Function** die vorgesehene Umsetzung. Die vorhandene Garmin-Funktion bestätigt ein nutzbares Grundmuster: OPTIONS-Preflight, eng begrenzte CORS-Origin, Bearer-Token-Validierung über einen Anon-Client mit `auth.getUser()` und ein davon getrennter Admin-Client. Für die neue Funktion werden nur die allgemeinen Auth-/Client-Grundsätze übernommen, nicht Garmin-Aktionen, Garmin-Secrets oder deren Cron-Ausnahmen. Die CORS-Origin muss zur tatsächlich genutzten KAJO-App-Domain passen. Die Funktion erhält keine anonyme privilegierte Hintergrundaktion. Der Cloudflare-Chat-Worker erhält keinen Service-Role-Key.

## 10. MVP-Abnahmekriterien

Vor Freigabe eines ersten Upload-MVP müssen folgende Eigenschaften statisch und anschließend gezielt technisch nachgewiesen werden:

1. Nutzer A kann weder Metadaten noch Dateien von Nutzer B lesen.
2. Private Uploads erscheinen nicht in der gemeinsamen Retrieval-Suche.
3. Browser-Nutzer können keine Quelle als `approved` markieren.
4. Fehlgeschlagene Verarbeitung erzeugt keine teilweise freigegebenen Inhalte.
5. Wiederholte Verarbeitung erzeugt keine doppelten Dokumente/Chunks.
6. Quellenbelege führen auf konkrete Seiten/Abschnitte zurück, sofern extrahierbar.
7. Unbekannte Lizenzlage führt nicht zur gemeinsamen Volltextspeicherung.
8. Der Coach kann nur freigegebene gemeinsame Evidenz und ausdrücklich ausgewählte private Quellen abrufen.
9. Fehlende oder unpassende Evidenz wird als solche benannt; es werden keine Quellen erfunden.

## 11. Noch offene technische Entscheidungen

- Dedizierter Storage-Bucket und konkrete Policies.
- Supabase Edge Function oder Cloudflare Worker als Ingestion-Ausführung.
- PDF-Parser und OCR-Strategie.
- Upload-Größenlimit und Rate-Limit.
- Kuratierungsrollen und Audit-Log.
- Embedding-Modell, Dimension, Sprache, Kosten und Lizenz.
- Aufbewahrungs- und Löschprozess für private Uploads.
- Ob private Uploads im ersten MVP überhaupt verarbeitet werden oder zunächst nur Metadaten und Dateiablage erhalten.

## 12. Technischer Detailentwurf

Der konkrete MVP-Aufbau der separaten Supabase Edge Function, einschließlich Authentifizierung, Upload-Intent, Storage-Policies, Prozessaktion, Idempotenz und Laufzeitgrenzen, ist in [SCIENTIFIC_INGESTION_EDGE_FUNCTION_DESIGN.md](./SCIENTIFIC_INGESTION_EDGE_FUNCTION_DESIGN.md) festgehalten. Dieser Entwurf ist noch keine Implementierung.

## 13. Nicht durchgeführt

Es wurden keine Storage-Buckets, Tabellen, Policies, Functions, Secrets oder API-Routen angelegt. Es wurde kein Dokument hochgeladen oder verarbeitet. Es wurden keine Tests ausgeführt, kein Merge vorgenommen und kein Deployment gestartet.


## 14. Separater Storage-Policy-Entwurf

Der Bucket- und Policy-Entwurf ist in [`drafts/SCIENTIFIC_STORAGE_POLICIES_DRAFT.sql`](./drafts/SCIENTIFIC_STORAGE_POLICIES_DRAFT.sql) dokumentiert. Er sieht einen eigenen privaten Bucket vor und erlaubt authentifizierten Nutzern ausschließlich den INSERT auf einen exakten, serverseitig vorab angelegten Upload-Intent-Pfad. Es gibt darin keine Browser-Lese-, Überschreib- oder Löschrechte.

Das konkrete Bucket-Größenlimit ist noch nicht entschieden. Der Bucket-Entwurf darf daher nicht unverändert ausgeführt werden. Vor einer Migration sind außerdem vorhandene Storage-Policies, die RLS-Lesbarkeit eigener pending-Dokumente und die spätere serverseitige Download-/Löschlogik zu prüfen.


## 15. Laufzeit- und Job-Ausführung

Die PDF-Extraktion wird nicht ungeprüft als lang laufender synchroner Edge-Function-Request umgesetzt. Die aktuelle Supabase-Dokumentation nennt für gehostete Edge Functions 256 MB maximalen Speicher und 2 Sekunden CPU-Zeit pro Request; die Wall-Clock-Grenze hängt vom Tarif ab. Vor einer Parserintegration ist deshalb eine dauerhafte Job-/Queue-Ausführung zu spezifizieren. `EdgeRuntime.waitUntil()` allein wird nicht als dauerhafte Queue oder verlässliche Wiederholungsinfrastruktur behandelt.

`unpdf` ist als Deno-/Worker-fähiger Parserkandidat mit seitenweiser PDF.js-Extraktion vorgemerkt, aber noch nicht ausgewählt oder eingebunden. Ein Proof of Concept muss mit realistischen wissenschaftlichen PDFs Seitenbezug, Unicode, Tabellen-/Spaltenverluste, CPU, Speicher und Fehlerfälle prüfen. Details und Quellen stehen im [technischen Edge-Function-Entwurf](./SCIENTIFIC_INGESTION_EDGE_FUNCTION_DESIGN.md).


## 16. Zielarchitektur mit Cloudflare Free und Supabase

Die Architektur wurde nach Bestätigung des Cloudflare-Free-Tarifs angepasst. Cloudflare Workers Free sind auf 10 ms CPU-Zeit pro HTTP-Invocation begrenzt; Supabase Edge Functions haben 2 Sekunden CPU-Zeit pro Request. Deshalb wird PDF-Parsing im MVP nicht serverseitig in einem dieser beiden Request-Handler ausgeführt.

Supabase bleibt für Auth, PostgreSQL, private PDF-Dateien und Chunk-Metadaten zuständig. Die PDF-Textextraktion erfolgt zunächst clientseitig im Browser mit einer zu evaluierenden PDF.js-basierten Bibliothek. Die App sendet extrahierte, seitenbezogene Textabschnitte in kleinen authentifizierten Batches an die separate Supabase Edge Function. Diese prüft Dokumenteigentum und Status und persistiert Chunks idempotent. Der Browser kann ausschließlich eigene private Dokumente verarbeiten; Shared-Freigabe und Kuratierung bleiben serverseitig getrennt.

Für diesen MVP werden weder ein zusätzlicher Cloudflare-Ingestion-Worker noch Cloudflare Queues benötigt. Queues würden zwar Jobs zustellen, aber die CPU-Grenze eines Free-Workers nicht aufheben. Der bestehende Coach-Worker bleibt unverändert und ohne Service-Role-Key.

Die bisherige `process-document`-Aktion im Scaffold bleibt HTTP 501, bis der clientseitige Extraktions- und Chunk-Batch-Pfad implementiert und abgesichert ist. Details: [Cloudflare Scientific Ingestion Architecture](./CLOUDFLARE_SCIENTIFIC_INGESTION_ARCHITECTURE.md).

**Hinweis zur Dokumenthistorie:** Frühere Abschnitte, die eine separate Cloudflare Queue-Verarbeitung oder serverseitige PDF-Extraktion vorsehen, sind durch diese Free-Plan-Entscheidung überholt. Die überarbeitete Zielarchitektur in Abschnitt 16 und das verlinkte Architekturpapier sind maßgeblich.


## 17. Erster lokaler PDF.js-PoC im Frontend

Im Repository ist nun eine eigenständige Ansicht „Wissenschaftliche Bibliothek“ unter „Mehr“ integriert. Sie lädt das Modul `js/scientific-library.js` erst beim Öffnen der Ansicht.

Der aktuelle Funktionsumfang:
- Auswahl einer einzelnen PDF-Datei.
- Lokales Öffnen und seitenweise Textextraktion mit fest gepinntem `pdfjs-dist@6.5.438`.
- Anzeige von Dateigröße, Seitenzahl, extrahierten Zeichen und Anzahl erzeugter Chunks.
- Vorläufige Chunk-Aufteilung innerhalb einzelner PDF-Seiten (ca. 3.200 Zeichen pro Chunk).
- Vorschau der ersten Textabschnitte mit explizitem Seitenbezug.
- Abbruch und Verwerfen der Vorschau beim Verlassen der Ansicht, beim Zurücksetzen oder bei Auswahl einer anderen Datei.

**Datenschutz:** Die PDF-Datei und der extrahierte Text werden in diesem Schritt nicht an Supabase oder Cloudflare gesendet und nicht in localStorage/IndexedDB gespeichert. Die Chunks existieren nur im Arbeitsspeicher der aktuellen Ansicht. PDF.js selbst wird beim ersten Aufruf vom jsDelivr-CDN geladen.

**Wichtige Einschränkung:** Das ist eine technische Vorschau, kein validierter Extraktions- oder Chunking-Prozess. Die Lesereihenfolge, Tabellen, Formeln, Fußnoten, mehrspaltige Layouts und Unicode-Verhalten müssen mit repräsentativen wissenschaftlichen Papers beurteilt werden. Die feste Chunklänge ist vorläufig und kein semantisch validierter Wert.

Noch nicht aktiviert sind der tatsächliche Upload aus der Frontend-Ansicht, Storage-Bucket und Storage-Policies, die RPCs in Supabase, Resume-/Checkpoint-Mechanismus, dauerhafte Chunk-Speicherung und Coach-Retrieval. Die Edge-Function-Actions sind im Repository vorbereitet, hängen aber von den noch nicht angewendeten Datenbank- und Storage-Entwürfen ab. Der vorhandene Endpunkt `process-document` bleibt HTTP 501.

Die aktuelle Implementierung ersetzt die frühere Planung eines `unpdf`-/serverseitigen Parserlaufs im ersten MVP. Frühere Parser-/Queue-Abschnitte sind entsprechend als überholte Entwurfsstände zu lesen; maßgeblich sind Abschnitt 16 und diese Ergänzung.


## 18. Atomare Anlage des Upload-Intents

Die Action `create-upload-intent` verwendet im aktuellen Branch nun die RPC `kajo_create_scientific_upload_intent`. Diese legt die private Quelle und den zugehörigen Dokumentdatensatz in einer einzelnen Datenbanktransaktion an. Damit entfällt die vorherige Folge aus zwei Inserts und einer best-effort-Löschkompensation.

Die Eigentümer-ID stammt weiterhin ausschließlich aus dem zuvor validierten Supabase-JWT. Die RPC ist als `SECURITY INVOKER` vorgesehen und soll nur für `service_role` ausführbar sein. Der SQL-Entwurf liegt in `docs/drafts/SCIENTIFIC_INGESTION_RPC_DRAFT.sql`. Weder die RPC noch die Tabellen wurden in der Live-Datenbank angelegt. Der Browser-Upload bleibt deaktiviert.


### Wiederaufnahme nach Unterbrechung

Die Statusabfrage eines eigenen privaten Dokuments stellt die Extraktionsversion, die erwartete Chunk-Anzahl und die serverseitig gespeicherte Chunk-Anzahl bereit, jedoch keine Chunk-Texte oder Download-URL. Nach einem Browser-Neuladen muss die Original-PDF erneut ausgewählt und lokal verarbeitet werden. Identische Chunk-Batches sind für Wiederholungsversuche vorgesehen; abweichende Inhalte unter bereits verwendeten Chunk-Indizes werden abgewiesen. Eine automatische Fortsetzung ohne erneute Dateiauswahl sowie die Bereinigung abgelaufener Upload-Intents sind noch nicht implementiert.


### Lokale Prüfung der Extraktionsgrenzen

Die PDF.js-Vorschau bricht die Verarbeitung ab, wenn ein Dokument mehr als 10.000 Seiten, 20.000 Chunks oder 20 Millionen extrahierte Zeichen erzeugt. Diese Werte entsprechen den vorbereiteten Server-/RPC-Grenzen. Eine separate maximale Dateigröße wird vor Aktivierung über die Serverkonfiguration festgelegt; sie ist nicht durch die Seiten-/Textgrenzen ersetzt.


### Storage-Policy und offene Aktivierungsvoraussetzungen

Der Browser darf ausschließlich per INSERT in den serverseitig vorbereiteten Objektpfad `<owner_id>/<document_id>/original.pdf` hochladen, solange das zugehörige private Dokument dem authentifizierten Nutzer gehört und `pending` ist. Browserseitiges Lesen, Überschreiben und Löschen ist im Entwurf nicht erlaubt; Uploads müssen `upsert: false` verwenden. Die Edge Function prüft anschließend die tatsächliche Dateigröße und PDF-Signatur. Vor Aktivierung fehlen weiterhin Intent-Ablauf, Rate-Limits, Bereinigung verwaister Uploads sowie die abgestimmte Bucket-Größenbegrenzung.


### Ablaufzeit für Upload-Intents

Ein Upload-Intent ist ab seiner serverseitigen Erstellung 24 Stunden gültig. Nach Ablauf verweigert die Storage-Policy weitere Uploads; confirm-upload lehnt eine Bestätigung ebenfalls ab. Bereits bestätigte Dokumente bleiben unabhängig davon für die Extraktion verfügbar. Die 24 Stunden sind ein vorläufiger MVP-Wert und vor Aktivierung anhand der erwarteten Dateigrößen und Uploadzeiten zu bestätigen. Abgelaufene Datensätze und Objekte werden nicht automatisch gelöscht.


## 26. Festlegung des bevorzugten Uploadwegs: TUS

Die aktuelle Scientific-Library-Oberfläche extrahiert PDF-Dateien weiterhin ausschließlich lokal mit PDF.js. Es findet noch kein Upload in Supabase Storage statt. Die Edge-Function-Actions für Upload-Intent und Uploadbestätigung sind vorbereitet, werden vom Frontend aber nicht aufgerufen.

Für die spätere Umsetzung wird **TUS (Supabase Resumable Upload)** als bevorzugter Uploadweg festgelegt. Supabase empfiehlt TUS insbesondere für Dateien über 6 MB und bei instabilen Verbindungen. Die von Supabase ausgegebene Upload-URL ist laut aktueller Dokumentation bis zu 24 Stunden gültig. Nach Ablauf muss ein neuer Uploadvorgang gestartet werden. Damit ist TUS für wissenschaftliche PDFs robuster als ein ausschließlich einmaliger Standard-Upload. (Siehe Supabase-Dokumentation: Standard Uploads und Resumable Uploads.)

Die Entscheidung legt noch keine konkrete maximale Dateigröße fest. Diese muss unter dem globalen Uploadlimit des tatsächlichen Supabase-Projekts liegen und zusätzlich als Bucket-Limit sowie in MAX_UPLOAD_BYTES durchgesetzt werden. Das Supabase-Free-Limit von derzeit 50 MB darf nicht ungeprüft auf das Projekt übertragen werden, da der tatsächliche Tarif hier nicht bestätigt ist.

Für das Cleanup gilt: Der 24-Stunden-Upload-Intent begrenzt, wann eine neue Upload-Session begonnen werden darf. Eine bereits erzeugte TUS-Upload-URL kann laut Supabase bis zu 24 Stunden gültig bleiben. Deshalb bleibt die zusätzliche siebentägige Karenzzeit nach Ablauf des Intents bestehen; die separate 24-Stunden-Quieszenz nach dem ersten Cleanup-Claim ist eine weitere Sicherheitsreserve. Diese Zeitwerte sind Designannahmen und müssen vor Aktivierung mit der konkret verwendeten Supabase-Storage-Konfiguration abgeglichen werden.

Vor Implementierung müssen noch festgelegt werden:
- konkretes MAX_UPLOAD_BYTES und passendes Bucket-Limit;
- TUS-Endpunkt und verwendete Clientbibliothek/Version;
- Behandlung abgelaufener TUS-URLs und Wiederaufnahme nach erneuter Dateiauswahl;
- Umgang mit parallelen Uploadversuchen und nicht abgeschlossenen Sessions.

Die Cleanup-Finalisierungs-RPC prüft die Quieszenz inzwischen zusätzlich selbst. Weder Upload noch Cleanup sind produktiv aktiviert.

### 27. Festgelegte TUS-Clientbibliothek und isolierter Frontend-Baustein

Für die browserbasierte TUS-Anbindung ist `tus-js-client@4.3.1` festgelegt. Das Repository verwendet native ES-Module ohne Root-`package.json`; deshalb wird das versionierte Browser-Bundle bei explizitem Aufruf dynamisch von jsDelivr geladen. Der neue Baustein liegt in `js/scientific-upload.js`, ist aber noch nicht in die UI importiert und wird nicht ausgeführt.

Der Baustein übernimmt ausschließlich serverseitig gelieferte Intent-Daten, nutzt den vorhandenen Supabase-Client, aktualisiert das Bearer-Token vor jedem TUS-Request und bestätigt den Upload nach Abschluss über die Edge Function. Der direkte Storage-Hostname wird aus der Projekt-URL abgeleitet und auf das Supabase-Format `<project-ref>.storage.supabase.co` abgebildet.

Browserseitige Fingerprints werden derzeit deaktiviert. Dadurch entsteht keine automatische Wiederaufnahme nach einem Browser-Neustart; dieses Verhalten wird nicht vorgetäuscht und benötigt ein eigenes nutzer- und intentgebundenes Resume-Konzept.

Die lokale PDF.js-Vorschau bleibt unverändert und vollständig getrennt vom Upload. Ohne explizite spätere UI-Aktivierung startet kein Upload. Die Infrastruktur bleibt nicht eingerichtet: Tabellen/RPCs/Policies sind Entwürfe, der private Bucket fehlt, die Edge Function ist nicht deployed und ihre Secrets sind nicht gesetzt.
