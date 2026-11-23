# KAJO Connect – Geräte-Kopplung und Synchronisierung

**Stand:** Pairing-UI, Backend-Quellcode und lesende Watch-Synchronisierung im Branch vorbereitet; noch nicht deployed oder end-to-end getestet  
**Branch:** `feature/kajo-connect`  
**Erstes Zielgerät:** Garmin Venu 3S; zusätzlich Venu 2 Plus

## 1. Grundprinzip

KAJO Connect ist ein zusätzlicher Client des bestehenden KAJO-Kontos. Supabase Auth und die vorhandene Benutzer-ID bleiben maßgeblich. Die Uhr erhält einen eigenen widerrufbaren Gerätezugang; sie erhält weder einen Supabase-Refresh-Token noch einen Service-Role-Key oder Garmin-Personal-API-Zugang.

KAJO bleibt führend für Trainingsplanung und sportwissenschaftliche Berechnungen. Die Uhr zeigt Daten an und zeichnet Aktivitäten auf. Trainingsplanung und absolvierte Aktivitäten bleiben getrennt.

## 2. Tatsächlich verwendete Datenquelle

Die Web-App hält geplante Einheiten in `state.plannedActivities`. `getUserDataSnapshot()` bildet sie auf `planned` ab; der versionierte Cloud-Snapshot speichert diesen Wert in `public.user_data.data.planned`.

Die Live-Tabelle `public.planned_sessions` existiert zwar, ist aber in der geprüften Web-App nicht als führende Datenquelle verwendet. Die erste Watch-Synchronisierung liest deshalb `user_data.data.planned` und führt keine parallele Planungstabelle ein.

Die Trainingsfelder, die der Watch-Client verwenden darf, sind:
- `id`, `date`, `name`, `type`
- `duration`, `targetTss`, `category`, `desc`

Eine Intervall-/Schrittstruktur wird nicht übertragen, solange sie nicht in tatsächlich gespeicherten Planobjekten nachgewiesen ist.

## 3. Kopplungsablauf – aktueller Entwurf im Code

Der implementierte Backend-Vertrag nutzt einen vom Gerät gestarteten Kopplungsvorgang:

1. Die Uhr fordert über `create-pairing` einen Kopplungscode und ein zusätzliches geheimes Polling-Secret an.
2. Die Uhr zeigt den zwölfstelligen Code an und fragt den Status mit Code plus Polling-Secret ab.
3. Die Nutzerin meldet sich in der KAJO-Web-App an und gibt den Code dort ein. Die Web-App ruft `claim-pairing` mit dem bestehenden Supabase-User-JWT auf.
4. Der Server prüft den JWT über Supabase Auth, registriert ein Gerät für genau diese Benutzer-ID und erzeugt ein zufälliges Geräte-Token. Pro Konto sind maximal fünf aktive Geräte vorgesehen.
5. Das Geräte-Token wird serverseitig verschlüsselt in der kurzlebigen Pairing-Anfrage zwischengespeichert. Die Uhr kann es nur mit Code und Polling-Secret abholen.
6. Die Uhr speichert das Geräte-Token lokal. Danach verwendet sie für Synchronisierungen ausschließlich dieses Token.

Der Code läuft nach zehn Minuten ab. Der Code wird serverseitig nicht im Klartext gespeichert; sein Hash wird mit einem serverseitigen HMAC-Pepper gebildet. Der zwölfstellige Zahlencode besitzt 40 Bit Suchraum. Das Polling-Secret und das Geräte-Token sind jeweils kryptografisch zufällig.

## 4. Backend-Implementierung im Branch

Neu angelegt:
- `supabase/functions/kajo-connect/index.ts`
- `docs/kajo-connect-pairing-schema-draft.sql`

In `supabase/config.toml` ist für diese Funktion `verify_jwt = false` gesetzt, weil die Uhr vor dem Pairing noch kein Supabase-JWT besitzt. Die Funktion prüft Credentials deshalb selbst:
- `claim-pairing`: Supabase-User-JWT wird explizit mit `auth.getUser()` verifiziert.
- `poll-pairing`: erfordert den Pairing-Code und das separate Polling-Secret.
- `sync`: erfordert das Geräte-Bearer-Token; serverseitig wird dessen SHA-256-Hash einem nicht widerrufenen Gerät zugeordnet.

Das Abschalten der vorgeschalteten JWT-Prüfung macht die Funktion nicht zu einem offenen Datenendpunkt. Jede Aktion hat eine eigene Credential-Prüfung. Die Supabase-Dokumentation beschreibt diese Trennung zwischen `verify_jwt` und der Authentifizierung innerhalb der Funktion: https://supabase.com/docs/guides/functions/auth-headers

## 5. Aktionen und Datenvertrag

Alle Aktionen werden als JSON-POST an `/functions/v1/kajo-connect` gesendet.

| Aktion | Authentifizierung | Zweck |
|---|---|---|
| `create-pairing` | Pairing wird durch zufälliges Polling-Secret geschützt | Anfrage von der Uhr erzeugen |
| `claim-pairing` | bestehender Supabase-User-JWT | Code dem angemeldeten Konto zuordnen |
| `poll-pairing` | zwölfstelliger Code plus Polling-Secret | Status prüfen und Gerätetoken abholen |
| `sync` | Geräte-Bearer-Token | geplante Einheiten und Herzfrequenzzonen abrufen |
| `list-devices` | bestehender Supabase-User-JWT | Geräte des eigenen Kontos auflisten |
| `revoke-device` | bestehender Supabase-User-JWT | ein Gerät des eigenen Kontos widerrufen |

Die `sync`-Antwort enthält nur:
- geplante Einheiten von gestern bis 14 Tage in die Zukunft, begrenzt auf 30 Einträge und die oben genannten Felder; Beschreibungen und Textfelder werden für die begrenzte Watch-Speichergröße gekürzt;
- die Herzfrequenz-Zonengrenzen für das lokale Datum der Uhr;
- Versions- und Aktualisierungsinformationen des Cloud-Snapshots.

Die Herzfrequenzzonen folgen der bestehenden KAJO-Logik aus `js/training-load.js`: adaptive Ruhe-HF als Median gültiger Garmin-Ruhe-HF-Tageswerte im konfigurierten Rückblick; wenn zu wenige Messwerte vorhanden sind, wird eine gültige Profil-Ruhe-HF als ausdrücklich gekennzeichneter Fallback verwendet. Die vier Obergrenzen werden nach Karvonen bei 60/70/80/90 % der Herzfrequenzreserve berechnet. Die Uhr übernimmt die Grenzen und berechnet keine eigenen Zonen.

## 6. Datenbankentwurf – noch nicht angewendet

Die SQL-Datei unter `docs/kajo-connect-pairing-schema-draft.sql` ist ausdrücklich ein Entwurf und keine Migration. Sie beschreibt drei Tabellen und eine serverseitige SQL-Funktion:
- `public.kajo_connect_pairing_requests`: Code-Hash, Polling-Secret-Hash, Ablauf, Claim-Status und kurzzeitig verschlüsseltes Geräte-Token.
- `public.kajo_connect_devices`: Benutzer-ID, Gerätebezeichnung, Token-Hash, letzte Nutzung und Widerrufszeitpunkt.
- `public.kajo_connect_rate_limits`: gehashte Rate-Limit-Buckets mit Zeitfenster und Zähler.
- `public.kajo_connect_consume_rate_limit(...)`: atomare, transaktionssichere Zählerfunktion; Ausführung ist nur für `service_role` vorgesehen.

Alle drei Tabellen aktivieren RLS und erhalten keine Client-Policies. Zugriff ist ausschließlich über die Edge Function mit serverseitigem Service-Role-Key vorgesehen. Die tatsächlichen Datenbankänderungen sind nicht freigegeben und wurden nicht ausgeführt.

**Zusätzliche Deployment-Prüfung:** Die Edge Function verwendet für diese Tabellen `supabase-js`-Abfragen über die Supabase Data API. Vor einer späteren Bereitstellung muss deshalb geprüft werden, ob die neu angelegten Tabellen in den Data-API-Einstellungen des Projekts erreichbar sind. Seit der Supabase-Änderung vom 30. Oktober 2026 werden neu angelegte Tabellen nicht mehr automatisch für die Data API freigegeben. Das ist getrennt von RLS und SQL-Berechtigungen zu prüfen.

Vor dem Erstellen einer echten Migration muss die bestehende Abweichung zwischen Repository-Migrationsdateien und Live-Migrationshistorie bereinigt bzw. reproduzierbar dokumentiert werden. Bestehende Migrationen werden nicht umbenannt, erneut angewendet oder geraten.

## 7. Erforderliche Edge-Function-Secrets

Vor einem Deployment müssen zusätzlich zu den von Supabase bereitgestellten Variablen folgende Secrets erzeugt und gesetzt werden:
- `KAJO_CONNECT_PAIRING_PEPPER`: zufälliger, mindestens 32 Zeichen langer serverseitiger HMAC-Pepper für die zwölfstelligen Codes.
- `KAJO_CONNECT_TOKEN_ENCRYPTION_KEY`: Base64-kodierte 32-Byte-Schlüssel für AES-GCM-Verschlüsselung des noch nicht abgeholten Geräte-Tokens.

Diese Werte gehören ausschließlich in die Supabase-Function-Secrets. Sie dürfen nicht in GitHub, im Web-Frontend oder in der Watch-App liegen.

## 8. Noch nicht umgesetzt

- Die Pairing-Oberfläche in der KAJO-Web-App zum Eingeben und Bestätigen des Codes ist im Branch ergänzt.
- Die Pairing-Ansicht auf der Uhr einschließlich Code-Anzeige, Polling und lokaler Token-Speicherung ist im Branch ergänzt; sie ist noch nicht kompiliert oder am Gerät getestet.
- Der lesende Sync der geplanten Einheiten in die Startansicht, der Offline-Cache und die Übergabe der aktuellen KAJO-Zonen an die Aktivitätsansicht sind im Branch ergänzt; sie sind noch nicht kompiliert oder end-to-end getestet.
- Die KAJO-Web-App enthält einen Editor für drei eigene Datenseiten. Je Seite können bis zu vier Kennzahlen ausgewählt, sortiert und in den Größen klein/mittel/groß eingestellt werden. Die Einstellungen werden in `state.settings.kajoConnectDisplayLayouts` gespeichert und über den bestehenden versionierten Cloud-Snapshot synchronisiert.
- Die Edge Function validiert diese Layouts und liefert sie in der `sync`-Antwort aus. Die Garmin-Startansicht speichert sie nach erfolgreicher Antwort in `Application.Storage`; die Aktivitätsansicht liest sie beim Öffnen ein.
- Geräteverwaltung und Widerruf in der KAJO-Web-App sind als UI und Backend-Aktionen ergänzt; die Funktion ist noch nicht gegen eine bereitgestellte Datenbank getestet.
- Die Datenbanktabellen; das SQL ist bislang nur ein Entwurf.
- Deployment der Edge Function und Setzen der Secrets.
- End-to-end-Tests und Garmin-Gerätetests.

Die `KajoConnectApi.mc` sendet asynchrone JSON-POST-Anfragen an den neuen Endpunkt und ergänzt den öffentlichen Supabase-Publishable-Key im `apikey`-Header. Die Watch-Pairing-Ansicht verwendet sie für Code-Erzeugung und Polling. Der Geräte-Token wird lokal gespeichert, sobald der Server ihn nach erfolgreichem Claim zurückgibt.

## 9. Aktivitätsaufzeichnung

Die Uhr speichert Aktivitäten derzeit über `ActivityRecording.Session` als Garmin-Aktivität. Das ist nicht gleichbedeutend mit einem direkten Upload der FIT-Datei an KAJO. Ein späterer KAJO-Import kann den bestehenden Garmin-Synchronisationsweg nutzen, muss aber anhand eines echten Testdatensatzes geprüft werden. Ein direkter FIT-Upload von der Uhr ist nicht implementiert.

## 10. Sicherheits- und Testanforderungen vor Freigabe

Rate-Limits sind im Edge-Function-Code und im SQL-Schemaentwurf vorgesehen: Code-Erzeugung, Code-Claims, Polling, Geräte-Sync und Geräteverwaltung erhalten getrennte Zeitfenster und Zähler. Diese Begrenzungen sind erst aktiv, wenn die Tabellen und die SQL-Funktion in einer Testdatenbank angelegt und verifiziert wurden.

Vor einem produktiven Einsatz müssen mindestens folgende Fälle geprüft werden:
- abgelaufener, ungültiger und bereits beanspruchter Code;
- falsches Polling-Secret;
- zwei parallele Claim-Versuche;
- verlorene HTTP-Antwort beim Token-Polling;
- widerrufenes Gerät und unbekanntes Token;
- Benutzerwechsel und Zugriffstrennung zwischen Konten;
- fehlender oder ungültiger Zonen-/Profilwert;
- Offline-Betrieb, Wiederholungsversuche und Versionswechsel des Cloud-Snapshots.
- Web-Konfiguration mit drei Layouts, jeweils null bis vier erlaubten Kennzahlen, gültigen Größenwerten und erfolgreicher Übernahme auf beiden Garmin-Modellen.

Es wurden keine produktiven Tabellen verändert und keine Edge Function deployed. Der Quellcode ist daher als vorbereitete Implementierung, nicht als betriebsbereite Verbindung zu verstehen.

**Read-only-Statusprüfung am 23.11.2026:** Im verbundenen Supabase-Projekt ist `kajo-connect` noch nicht als Edge Function vorhanden. Aktiv sind dort `garmin-personal` (Version 50) und `kajo-push-scheduler` (Version 5). Auch die drei Tabellen `kajo_connect_pairing_requests`, `kajo_connect_devices` und `kajo_connect_rate_limits` fehlen. Die vorhandene Migrationshistorie enthält vier Einträge und wurde nicht verändert.


## 11. Deployment-Voraussetzungen

Vor einer Bereitstellung müssen folgende Punkte in einer Testumgebung geprüft werden:

- Die SQL-Datei ist weiterhin nur ein Entwurf und wurde nicht gegen die Live-Datenbank ausgeführt. Eine echte Migration muss mit der vorhandenen Migrationshistorie abgeglichen und regulär erstellt werden.
- Die Edge Function verwendet für die drei neuen Tabellen `supabase-js`-Abfragen über die Supabase Data API. Es muss daher geprüft werden, ob diese Tabellen in den Data-API-Einstellungen des Projekts erreichbar sind. Seit dem 30. Oktober 2026 werden neu angelegte Tabellen nicht mehr automatisch für die Data API freigegeben. Das ist getrennt von RLS und SQL-Grants zu prüfen.
- Zusätzlich zu den von Supabase bereitgestellten Standardvariablen benötigt die Edge Function die beiden Secrets `KAJO_CONNECT_PAIRING_PEPPER` (mindestens 32 Zeichen) und `KAJO_CONNECT_TOKEN_ENCRYPTION_KEY` (Base64-kodierter 32-Byte-Schlüssel).
- Die Funktion muss mit `verify_jwt = false` bereitgestellt werden, da die Uhr vor dem Pairing noch kein Benutzer-JWT besitzt. Die Funktion prüft die Credentials jeder Aktion selbst.
- Die konfigurierte CORS-Origin muss mit der tatsächlich verwendeten KAJO-Web-App-Domain übereinstimmen.
- Erst nach erfolgreicher Schema- und Secret-Prüfung darf die Edge Function in einer Testumgebung bereitgestellt und mit getrennten Testkonten geprüft werden.

