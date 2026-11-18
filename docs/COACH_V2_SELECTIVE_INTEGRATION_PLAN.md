# KAJO – Selektiver Integrationsplan: KI-Coach in v2

**Stand:** 18. November 2026  
**Ziel:** KI-Coach-Funktionen aus `integration/coach-ai-v2-latest` kontrolliert in einen neuen, von aktuellem `v2` abgeleiteten Integrationsbranch übernehmen.  
**Status:** Planungsdokument; keine Codeintegration, Tests, Migration oder Deployments ausgeführt.

## 1. Verifizierte Ausgangslage

GitHub-Compare von `v2` (base) nach `integration/coach-ai-v2-latest` meldet:

- Status: `diverged`
- Integrationsbranch 203 Commits voraus
- Integrationsbranch 143 Commits hinter `v2`
- Merge-Base: `8d8075bd64f4e46153b02aecae984bb61e5ed744`

Der Compare listet 37 geänderte Dateien. Davon sind 23 neu hinzugefügte Dokumentations-/Entwurfsdateien, 14 bestehende Dateien geändert oder neu ergänzt. Ein pauschaler Merge würde daher sowohl alte App-Stände als auch wissenschaftliche Entwürfe einführen und ist nicht zu empfehlen.

## 2. Wesentliche Unterschiede in gemeinsam vorhandenen Dateien

Die folgenden Inhalte wurden stichprobenartig direkt auf beiden Branches gelesen:

| Datei | Stand in v2 | Stand im Integrationsbranch | Konsequenz |
|---|---|---|---|
| `worker.js` | Minimaler Static-Assets-Worker | Authentifizierter `POST /api/coach`-Handler mit Cloudflare Workers AI | Coach-API gezielt in aktuellen Worker portieren; Asset-Routing erhalten |
| `wrangler.jsonc` | Keine AI-Bindung | `ai.binding = AI` | AI-Bindung gezielt ergänzen und Umgebung prüfen |
| `js/coach.js` | Lokale regelbasierte Antwort | Supabase-Sitzung, Kontextaufbau und API-Request | Coach-Modul gezielt ersetzen/integrieren; UI-Vertrag prüfen |
| `js/main.js` | Neuere Modul-/Cache-Versionen, u. a. `profile.js?v=4` | Ältere Cache-Versionen, u. a. `profile.js?v=3`, plus Coach-Ladeintegration | Nicht die ältere Datei übernehmen; nur Coach-Imports/Initialisierung übertragen |
| `index.html` | Neuere Oberfläche | Ältere Oberfläche plus Coach-Markup-Anpassungen | Coach-Markup selektiv portieren; aktuelle v2-Struktur und IDs erhalten |
| `js/activities.js` | Neuere Aktivitätsgruppen-/Telemetry-Integrationen | Älterer Stand | v2 behalten; nur falls nötig Coach-Kontext-Adapter ergänzen |
| `js/calendar.js` | Neuere Kalender-/Aktivitätsgruppenlogik | Älterer Stand | v2 behalten |
| `css/styles.css` | 477 KB | 463 KB | v2 behalten; benötigte Coach-spezifische Regeln einzeln prüfen |
| `supabase/config.toml` | Push-Scheduler-Konfiguration | Zusätzlich neue Scientific-Functions-Konfiguration | Wissenschaftliche Function-Einträge nur bei späterer Freigabe übernehmen; Coach-API selbst benötigt keine neue Supabase Function |

Die Tabellenbewertung beschreibt den gelesenen Quellcode, nicht einen Laufzeittest.

## 3. Empfohlene Integrationsstrategie

**Nicht** `integration/coach-ai-v2-latest` in `v2` mergen und **nicht** den Integrationsbranch auf `v2` rebasen.

Stattdessen:

1. Aktuellen Head von `v2` erneut auslesen und einen neuen Arbeitsbranch davon erstellen.
2. Coach-API als isolierte Worker-Änderung portieren. Vorhandenes Static-Asset-Routing muss unverändert funktionieren.
3. AI-Bindung und Modellkonfiguration ergänzen; Konfigurationswerte/Secrets nur als Namen dokumentieren, niemals in Git schreiben.
4. Coach-Frontend-Module (`coach.js`, `coach-context.js`, `coach-data-context.js`, `coach-analysis.js`) übernehmen und mit den aktuellen Imports, State-Strukturen und Datenmodellen in v2 abgleichen.
5. Coach-Initialisierung aus `main.js` selektiv übernehmen. Versionsparameter der bestehenden v2-Module nicht zurücksetzen.
6. Chat-Markup und CSS aus dem Integrationsbranch nur gezielt portieren und mit der aktuellen `index.html` abgleichen.
7. Erst nach erfolgreicher statischer Prüfung Tests in einer separaten Freigabephase planen.

Der Integrationsbranch bleibt als Referenz erhalten. Änderungen an Garmin, Kalender, Aktivitätsgruppen, Profil, Theme und Synchronisierung aus `v2` haben Vorrang, sofern sie nicht ausdrücklich Teil einer späteren Coach-Schnittstelle sind.

## 4. Abhängigkeiten und Sicherheitsprüfung vor Freigabe

- Cloudflare Worker: AI-Binding in der konkreten Deployment-Umgebung vorhanden und dem Worker zugeordnet.
- Supabase: korrekte Projekt-URL und veröffentlichbarer Anon-Key als Worker-Konfiguration; niemals Service-Role-Key im Browser.
- Authentifizierung: Bearer-Token serverseitig verifizieren; ungültige/abgelaufene Tokens ablehnen.
- CORS/Origin: tatsächliche KAJO-Produktions- und Preview-Origins explizit prüfen.
- Eingabegrenzen: Request-Größe, Kontextlänge, Nachrichtenanzahl und Fehlerantworten begrenzen.
- Datenschutz: nur für die konkrete Frage erforderliche Trainingsdaten übertragen; sensible Check-in-Daten nur bei expliziter fachlicher Notwendigkeit.
- Ausgabe: Modellantwort als Text behandeln und nicht ungeprüft als HTML einsetzen.
- Kosten/Rate Limits: Missbrauchs- und Rate-Limit-Schutz vor öffentlicher Aktivierung festlegen.
- Fehlerverhalten: AI-Ausfall darf Dashboard, Garmin-Synchronisierung und Kalender nicht beeinträchtigen.

## 5. Testplan – noch nicht ausgeführt

### Statische Prüfung
- Syntax/Imports aller übernommenen Module
- Keine fehlenden Dateien oder veralteten Cache-Buster
- Keine doppelten globalen Handler oder konkurrierenden Chat-Initialisierungen
- Worker-Routing für Assets und `/api/coach`

### Funktionstests
- Nicht angemeldet: Coach-Anfrage wird abgewiesen.
- Angemeldet: einfache Trainingsfrage erhält Antwort.
- Leere Eingabe und parallele Anfragen werden korrekt behandelt.
- Fehlende Garmin-Daten führen zu transparenter Einschränkung, nicht zu erfundenen Werten.
- Kontextfenster und Datenquellen werden korrekt begrenzt.
- Cloudflare-AI-Fehler erzeugt verständliche Fehlermeldung.
- Dashboard, Garmin-Import, Kalender, Aktivitätsdetails und Cloud-Synchronisierung bleiben funktionsfähig.

### Datenschutz-/Sicherheitstests
- Fremde/ungültige Tokens
- Cross-Origin-Anfragen
- Überlange Prompts und Gesprächsverläufe
- Keine Tokens oder vertraulichen Daten in Logs/Client-Antworten
- Keine unautorisierte Änderung von Trainingsplan, Kalender oder gespeicherten Daten

## 6. Wissenschaftliche Wissensbasis bleibt separater Ausbauschritt

Die wissenschaftlichen Dateien im Integrationsbranch sind Dokumentation und Entwürfe. Die Scientific-Ingestion-Edge-Functions, SQL-Entwürfe, Upload-Oberfläche und Retrieval-Spezifikation dürfen nicht automatisch zusammen mit dem KI-Coach in v2 aktiviert werden.

Empfohlene Reihenfolge:
1. Stabiler persönlicher Coach mit Garmin-/Trainingskontext.
2. Separat geprüfter PDF-Upload und private Storage-Policies.
3. Datenbankschema und Rechteprüfung nach Remote-Schema-Abgleich.
4. PDF-Extraktion/Chunking/Embeddings und kontrollierte Verarbeitung.
5. Quellenbasiertes Retrieval mit Provenienz und Transferierbarkeitskennzeichnung.
6. Erst dann wissenschaftliche Evidenz als optionaler Coach-Kontext.

## 7. Freigabegrenzen

Dieses Dokument autorisiert keine Änderungen an `v2`, keine Branch-Erstellung, keinen Merge/Rebase, keine Supabase-Migration und kein Deployment. Diese Schritte benötigen jeweils eine separate Freigabe.