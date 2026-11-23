# KAJO Connect – Geräte-Kopplung und Synchronisationsarchitektur

**Status:** Architekturentwurf, noch nicht implementiert  
**Branch:** `feature/kajo-connect`  
**Zielgerät für den ersten Entwicklungsschritt:** Garmin Venu 3S

## 1. Ziel und Architekturprinzip

KAJO Connect ist ein zusätzlicher Client des bestehenden KAJO-Systems. Die Garmin-Uhr erhält keinen eigenen Benutzerbestand und führt keine parallelen sportwissenschaftlichen Berechnungen durch.

- Supabase Auth und die bestehende KAJO-Benutzer-ID bleiben die zentrale Identität.
- KAJO bleibt führend für Trainingsplanung, Datenmodell und Berechnungen.
- Die Uhr erhält ausschließlich einen gerätespezifischen, widerrufbaren Zugriff.
- Die Uhr speichert nur die für Offline-Nutzung und Synchronisierung notwendigen lokalen Daten.
- Trainingsplanung und absolvierte Aktivitäten bleiben getrennte Datentypen.

## 2. Befunde aus dem aktuellen Repository und Supabase-Projekt

### 2.1 Trainingsplanung

Die Web-App verwaltet geplante Einheiten aktuell in `state.plannedActivities`. Das benutzerspezifische Speichermodul bildet diese Sammlung auf `planned` ab. `getUserDataSnapshot()` enthält `planned`; der versionsgeschützte Cloud-Snapshot speichert diesen Datenbestand in `public.user_data.data`.

Der aktuelle Synchronisierungsablauf in `js/main.js` lädt den Cloud-Snapshot bei der Kontoaktivierung und speichert Änderungen versionsgeschützt zurück. Ein Versionskonflikt blockiert die automatische Synchronisierung, statt einen Datenstand stillschweigend zu überschreiben.

### 2.2 Vorhandene Tabellen

Im aktuellen Supabase-Schema existiert außerdem `public.planned_sessions` mit `user_id`, `record_id`, `session_date` und `payload`. Die Tabelle hat RLS-Regeln für Eigentümer und aktive Trainerzugriffe. Im aktuell geprüften KAJO-Branch wurde jedoch keine Verwendung dieser Tabelle in der Web-App gefunden. Sie wird deshalb für die erste Watch-Synchronisierung **nicht ungeprüft als führende Datenquelle vorausgesetzt**.

Absolvierte Aktivitäten werden in der Web-App bereits separat in `public.activities` gespeichert. Die Synchronisierung verwendet `user_id`, `record_id`, `activity_date` und `payload`, prüft die zurückgegebenen IDs und löscht keine bestehenden Datensätze.

### 2.3 Konsequenz

Für die erste Version liest KAJO Connect geplante Einheiten aus dem bereits verwendeten Snapshot-Feld `user_data.data.planned`. Vor einer späteren Umstellung auf `planned_sessions` muss eine separate Migration mit Datenabgleich und eindeutiger Festlegung der führenden Datenquelle erfolgen.

## 3. Kopplung mit einmaligem Code

### Schritt A – Code in KAJO erzeugen

1. Die Nutzerin ist in der KAJO-Web-App regulär über Supabase Auth angemeldet.
2. In den Einstellungen wird „Garmin-Uhr koppeln“ gewählt.
3. KAJO ruft eine authentifizierte Edge Function auf.
4. Der Server erzeugt einen zufälligen, einmal verwendbaren Kopplungscode mit kurzer Gültigkeit (vorgeschlagen: 5 Minuten).
5. In der Datenbank wird nur ein kryptografischer Hash des Codes gespeichert. Der Klartextcode wird nur einmal an die Web-App zurückgegeben.

### Schritt B – Code auf der Uhr eingeben

1. KAJO Connect zeigt eine Kopplungsansicht.
2. Die Nutzerin gibt den Code auf der Uhr ein.
3. Die Uhr sendet den Code über HTTPS an den Kopplungs-Endpunkt. Connect-IQ-Webrequests benötigen eine verfügbare Netzwerkverbindung über WLAN oder ein per Bluetooth verbundenes Mobilgerät; auf der Venu 3S planen wir zunächst mit der Verbindung über Garmin Connect Mobile.
4. Der Server prüft Ablaufzeit, Einmaligkeit und Versuchslimit und verbraucht den Code atomar.
5. Der Server erzeugt eine gerätespezifische zufällige Zugangsinformation und gibt sie genau einmal an die Uhr zurück.
6. Die Uhr speichert das Token lokal über die Connect-IQ-Speicher-API.

### Schritt C – Zugriff und Widerruf

- Das Gerät sendet sein Token bei späteren Requests als Bearer-Token.
- Serverseitig wird nur der Token-Hash gespeichert.
- Jede Anfrage wird einem einzelnen registrierten Gerät und dessen KAJO-Benutzerkonto zugeordnet.
- Die Nutzerin kann ein Gerät in KAJO widerrufen. Danach werden Requests dieses Geräts abgelehnt.
- Ein Supabase-Service-Key, ein Garmin-Personal-API-Key oder ein Supabase-Refresh-Token wird niemals auf der Uhr gespeichert.

## 4. Vorgesehene Backend-Bausteine

Die folgenden Namen sind Vorschläge, keine bereits existierenden Funktionen oder Tabellen.

### Edge Functions

| Funktion | Authentifizierung | Aufgabe |
|---|---|---|
| `kajo-connect-create-pairing` | bestehender Supabase-User-JWT | Kopplungscode für das angemeldete Konto erzeugen |
| `kajo-connect-claim-pairing` | kein Supabase-JWT; eigener Code-Check | Einmalcode prüfen, verbrauchen und Gerät registrieren |
| `kajo-connect-device` | eigener Geräte-Bearer-Token | Erlaubte Geräteaktionen ausführen |

Die erste und dritte Funktion verwenden die vorhandene Supabase-Authentifizierung beziehungsweise einen eigenen, eng begrenzten Gerätezugriff. Beim öffentlichen Claim-Endpunkt muss die Anwendung selbst alle Prüfungen durchführen; ein Publishable Key ist keine Geräte-Authentifizierung.

### Datenbank

Vorgeschlagene neue Tabellen liegen in einem nicht öffentlich exponierten Schema und sind nicht direkt über die Data API erreichbar:

- `kajo_connect_pairing_codes`: Benutzer-ID, Code-Hash, Ablaufzeit, Verbrauchszeitpunkt und Fehlversuche.
- `kajo_connect_devices`: Benutzer-ID, Geräte-ID, Token-Hash, Anzeigename/Modell, Erstellungszeit, letzte Nutzung und Widerrufszeitpunkt.

Die konkreten Tabellen, Indizes, Berechtigungen, RLS-Regeln und atomaren Datenbankoperationen werden erst nach separater Prüfung als Migration erstellt. Es wurden für diesen Entwurf keine Datenbankänderungen vorgenommen.

## 5. Sicherheitsanforderungen

- Kopplungscode: zufällig, kurzlebig, einmalig, gehasht gespeichert.
- Schutz vor Brute Force: begrenzte Fehlversuche und serverseitiges Rate-Limit.
- Atomarer Verbrauch: zwei parallele Claim-Anfragen dürfen nicht dasselbe Gerätetoken erhalten.
- Gerätetoken: kryptografisch zufällig, nur gehasht gespeichert, widerrufbar und nur einmal im Klartext ausgegeben.
- Gerätezugriff: jede Anfrage wird serverseitig einem aktiven Gerät und dessen `user_id` zugeordnet. Eine vom Client übermittelte Benutzer-ID wird niemals als Berechtigungsnachweis verwendet.
- Endpunkte: feste Aktionsliste und strenge Payload-Validierung; keine frei wählbaren Tabellen- oder SQL-Abfragen.
- Geheimnisse: Service-Role-/Secret-Keys verbleiben ausschließlich serverseitig.
- Datenschutz: nur die für die Watch-Funktion erforderlichen Trainingsdaten werden übertragen.

## 6. Erste Synchronisierungsverträge

### KAJO → Uhr

Erste Lesefunktion: geplante Einheiten für einen begrenzten Datumsbereich.

Quelle in Version 1: `public.user_data.data.planned`, gelesen anhand der `user_id` aus dem verifizierten Geräte-Datensatz. Die Antwort wird auf die von der Uhr benötigten Felder reduziert. Die Web-App-Felder `id`, `date`, `name`, `type`, `duration`, `targetTss`, `category` und `desc` sind im aktuellen Planungscode dokumentiert; weitere Workout-Schritt-/Intervallfelder müssen vor ihrer Übertragung anhand der tatsächlichen gespeicherten Objekte geprüft werden.

### Uhr → KAJO

Geplante spätere Funktionen:

1. Auf der Uhr erstellte Workouts als geplante Einheiten zurücksenden.
2. Abgeschlossene Aktivitäten als eigene Aktivitätsdatensätze übertragen.
3. Wiederholungen idempotent behandeln, damit Offline-Retries keine Duplikate erzeugen.

Für Aktivitätsuploads ist die vorhandene `public.activities`-Struktur mit `user_id`, `record_id` und `payload` ein möglicher Integrationspunkt. Die bestehende Web-Synchronisierung und ihre Duplikat-/Readback-Logik müssen vor Implementierung eines Watch-Writers vollständig berücksichtigt werden.

## 7. Connect-IQ-Umsetzung

Für HTTPS-Anfragen ist `Communications.makeWebRequest()` vorgesehen. Garmin dokumentiert die API ab Connect-IQ API-Level 1.3.0; die Venu 3S ist als unterstütztes Gerät aufgeführt. Die Funktion benötigt die Communications-Berechtigung und eine Verbindung über WLAN oder ein per Bluetooth verbundenes Mobilgerät. Deshalb muss vor dem ersten Netzwerk-Build das aktuelle `minApiLevel` (derzeit 1.2.0) mindestens auf 1.3.0 geprüft und die Berechtigung im Manifest ergänzt werden. Für persistenten App-Speicher wird die passende Speicher-API anhand des tatsächlich benötigten API-Levels ausgewählt. Die Watch-App erhält keine Supabase-Client-Bibliothek und keine Zugangsdaten aus dem Web-Frontend.

Die Venu 3S bleibt das erste Build- und Testziel. Unterstützte API-Level, Produktkompatibilität, Speicherlimits, Netzwerkanforderungen und Verhalten bei unterbrochener Verbindung werden gegen das installierte SDK und die offiziellen Garmin-Dokumente validiert.

## 8. Implementierungsreihenfolge

1. Architektur und Datenverträge final prüfen.
2. Kopplungs-Tabellen und sichere atomare Operationen als Migration entwerfen; vor Ausführung separat freigeben.
3. Authentifizierte Code-Erzeugung in KAJO ergänzen.
4. Claim- und Geräte-Endpunkte implementieren und lokal testen.
5. Kopplungsoberfläche und Token-Speicherung auf der Uhr umsetzen.
6. Nur geplante Einheiten lesend synchronisieren.
7. Offline-Queue und Konfliktverhalten testen.
8. Watch-erstellte Workouts und abgeschlossene Aktivitäten ergänzen.
9. GPS-/Sensoraufzeichnung und FIT-Verarbeitung separat validieren.

## 9. Bewusst noch nicht umgesetzt

- Keine Supabase-Tabellen oder Policies geändert.
- Keine Edge Function deployed.
- Keine bestehenden Garmin-Funktionen geändert.
- Keine neue Trainingsplan-Datenquelle eingeführt.
- Keine Watch-Tokens oder Zugangsdaten erzeugt.
- Keine Behauptung, dass die Uhr bereits mit KAJO verbunden ist.

## 10. Offene technische Prüfungen

- Exakte Struktur real gespeicherter Workout-/Intervallobjekte in `planned`.
- Ursprung und vorgesehene Verwendung von `planned_sessions`; mögliche Überschneidung mit `user_data.data.planned`.
- Aktuelle Datenbankberechtigungen und Schemaexposition für ein privates Geräte-Schema.
- Sichere atomare Einmal-Code-Einlösung und Rate-Limit-Strategie.
- Connect-IQ-Details zur sicheren lokalen Token-Speicherung und HTTPS-Request-Ausführung.
- Aktivitätsformat und Importpfad für Watch-Aufzeichnungen.


## 11. Datenbank- und Migrationsabgleich (Read-only-Prüfung)

Am 23.11.2026 wurden die Migrationsliste des verbundenen Supabase-Projekts, die Dateien unter `supabase/migrations/` im Branch `feature/kajo-connect` sowie die tatsächlichen Tabellen und Policies read-only verglichen.

### Ergebnis

Die Datenbank enthält die Tabellen und Spalten, die zu den vorhandenen Garmin-/Export-Migrationen gehören. Auch die zusätzliche Update-Policy für Garmin-Telemetrie und die Spalte `kajo_notification_schedules.last_sent_local_date` sind im Live-Schema vorhanden. Die Datenbankstruktur ist damit nicht einfach „unvollständig“; das Problem ist die fehlende eindeutige Zuordnung zwischen Repository-Migrationsdateien und registrierter Migrationshistorie.

| Repository-Datei | Beobachtung im Live-Projekt |
|---|---|
| `20261115000100_garmin_activity_telemetry.sql` | Tabelle und Basis-Policies sind vorhanden; eine passende Version ist in der Live-Migrationsliste nicht sichtbar. |
| `202611150001_garmin_activity_sync_days.sql` | Tabelle ist vorhanden; Live-Historie führt stattdessen Version `20261115224846` mit gleichem Namen. |
| `20261115000200_kajo_push_delivery_tracking.sql` | Die Spalte `last_sent_local_date` ist vorhanden; die Datei ist in der Live-Migrationsliste nicht als Version registriert. |
| `20261115000300_garmin_activity_telemetry_update_policy.sql` | Update-Policy und Update-Berechtigung sind vorhanden; keine passende Version in der Live-Migrationsliste sichtbar. |
| `20261118000100_garmin_export_archive_storage.sql` | Tabellen, Bucket und zugehörige Policies sind vorhanden; Live-Historie führt stattdessen Version `20261118105435` mit gleichem Namen. |
| `20261118191919_garmin_export_data_import.sql` | Version und Name stimmen mit der Live-Migrationsliste überein; zugehörige Tabellen und Policies sind vorhanden. |

Zusätzlich enthält die Live-Migrationshistorie `20261116104737_increase_save_user_data_statement_timeout`; eine entsprechende Datei wurde im geprüften Repository-Verzeichnis nicht gefunden.

### Konsequenz für KAJO Connect

- Keine bestehende Migration wird umbenannt, gelöscht oder erneut angewendet.
- Keine neue Migration wird auf Basis einer geratenen Versionsnummer angelegt.
- Vor dem ersten KAJO-Connect-Schema-Change muss die Migrationshistorie mit dem Repository abgeglichen und ein reproduzierbarer Ausgangsstand hergestellt werden.
- Die vorhandenen Garmin- und Aktivitätsdatenbanken werden nicht für Geräte-Pairing zweckentfremdet.
- Die Pairing-Tabellen bleiben ein separater, noch nicht angelegter Datenbankbaustein.

Diese Prüfung war ausschließlich lesend. Es wurden weder Tabellen, Policies, Funktionen noch Migrationsdatensätze verändert.
