# KAJO Coach v2 – Integrationsstand

Stand: 2026-11-18

## Arbeitsbranch und Abgrenzung

- Zielbasis: `v2`
- Arbeitsbranch: `feature/coach-v2-integration`
- Ausgangspunkt: `39107f3dc56bd0779133ee7534fc7ff1bd49b387`
- Die Coach-Integration liegt weiterhin auf `feature/coach-v2-integration`; der Abgleich mit `v2` erfolgte durch einen Merge-Commit ausschließlich auf dem Feature-Branch.
- `v2` wurde durch diese Integrationsarbeiten nicht verändert.
- PR [#81](https://github.com/fantagawehnn/Kajo/pull/81) ist geöffnet und weiterhin Draft.
- Beim Integrationsabgleich mit dem aktuellen `v2`-Stand (Merge-Commit `25423042af0dc5ac4955ef1713ff4a2fabc92b5a`) lag der Feature-Branch 47 Commits voraus und 0 Commits zurück; Merge-Basis `54cb4b3dff21e0ad04158e5063279b70e8c4c048`. Anschließende Commits aktualisieren Dokumentation und PR-Metadaten.
- GitHub meldet für PR #81 `mergeable: true`. Der PR ist jedoch noch nicht zusammengeführt.
- Die neueren Garmin-Archiv- und Readiness-Änderungen aus `v2` bleiben erhalten. Auch der aktuelle Garmin-Archiv-Fix (numerische Aktivitäts-IDs, Analyseversion 6 und aktualisierte Navigation-Smoke-Tests) wurde in den Feature-Branch übernommen. In `index.html` ist `main.js?v=150` gesetzt; `js/main.js` verwendet `garmin-export-archive.js?v=4` und lädt `coach.js?v=2`.

## Umgesetzte Coach-Integration

1. `worker.js`: authentifizierter `POST /api/coach`-Endpunkt mit Supabase-Sessionprüfung und Cloudflare Workers AI.
2. `wrangler.jsonc`: Workers-AI-Binding `AI` und Cloudflare Rate Limiting.
3. `js/coach.js`: Frontend-Anbindung an den Serverendpunkt; Antwortausgabe als Text.
4. Neue Module: `js/coach-context.js`, `js/coach-data-context.js`, `js/coach-analysis.js`.
5. `js/main.js`: Coach-Modul-Cache-Buster aktualisiert.
6. `index.html`: Hinweise zur externen Verarbeitung über Cloudflare Workers AI aktualisiert.
7. Serverseitige Begrenzung des Request-Bodys während des Stream-Lesens sowie separate Begrenzung der serialisierten Kontextgröße.
8. Rate Limiting: 10 Anfragen je Nutzer und 60 Sekunden; bei fehlender oder fehlerhafter Binding-Konfiguration wird geschlossen mit Fehler abgebrochen.

## Kontextauswahl und Datenschutz

- Saison- und Langzeitanalysen erkennen unter anderem „letzte Saison“, „vergangene Saison“ und „bisherige Saison“ und wählen die vollständige verfügbare Historie.
- Rückblickende Aktivitäts- und Belastungsdaten werden explizit auf heute begrenzt. Zukunftsdatierte Einträge gelangen damit nicht versehentlich in rückblickende Auswertungen.
- Geplante Einheiten werden separat im Planungsfenster von 14 Tagen zurück bis 42 Tage voraus berücksichtigt.
- Garmin-Herzfrequenz-Zeitreihen werden lokal zusammengefasst; rohe Zeitreihen werden nicht an den Coach-Kontext weitergegeben.
- Der Coach übermittelt die konkrete Frage und den ausgewählten KAJO-Datenkontext über den KAJO-Worker an Cloudflare Workers AI. Die Oberfläche weist darauf hin.
- Eine wissenschaftliche Literaturdatenbank ist nicht angebunden. Der Coach darf deshalb keine Studien oder Quellen erfinden und soll keine Trainingspläne, Kalender oder gespeicherten Daten verändern.

## CI- und Testergebnisse

Die bestehende GitHub-Actions-CI wurde so erweitert, dass sie auch auf Pushes nach `feature/coach-v2-integration` läuft. Der Feature-Branch nutzt dabei GitHub-hosted Ubuntu; der produktive Deploy-Job ist weiterhin ausschließlich an Pushes auf `v2` gebunden.

Am 18.11.2026 wurden mehrere CI-Läufe auf dem Feature-Branch erfolgreich abgeschlossen:

- Run [44362793490](https://github.com/fantagawehnn/Kajo/actions/runs/44362793490) und Run [44362844729](https://github.com/fantagawehnn/Kajo/actions/runs/44362844729): Syntaxprüfung, Regression-Smoke-Tests, Coach-Kontexttests, Garmin-Load-/Coverage-Tests, Trainingslast-Zonentests, tägliche Garmin-HF-Recovery-Tests und Navigation-Smoke-Tests erfolgreich.
- Run [44363230293](https://github.com/fantagawehnn/Kajo/actions/runs/44363230293): dieselben Prüfschritte nach der Aktualisierung der Integrationsdokumentation erfolgreich.
- Run [44363590191](https://github.com/fantagawehnn/Kajo/actions/runs/44363590191): Coach-Worker-Sicherheitstests erfolgreich. Diese prüfen unter anderem HTTP-Methode, fremde Origin, fehlende Supabase-Konfiguration und ungültige/abgelaufene Sitzungen sowie, dass bei ungültiger Sitzung weder Rate Limiter noch KI aufgerufen werden.
- Run [44363998803](https://github.com/fantagawehnn/Kajo/actions/runs/44363998803): erweiterte Worker-Fehlerpfadtests erfolgreich. Abgedeckt sind nun zusätzlich fehlendes/ausgefallenes Rate Limiting, überschrittene Limits, fehlerhaftes JSON, zu großer Kontext, AI-Fehler, leere AI-Antwort und erfolgreicher Antwortpfad.
- Run [44364080844](https://github.com/fantagawehnn/Kajo/actions/runs/44364080844): vollständige CI nach zusätzlicher Absicherung fehlerhafter Supabase-Antworten und fehlender AI-Binding-Konfiguration erfolgreich. Die Coach-Worker-Tests prüfen jetzt auch diese beiden Fälle.
- Run [44364801873](https://github.com/fantagawehnn/Kajo/actions/runs/44364801873): vollständige CI nach Ergänzung der Tests für die harte Streaming-Requestgrößenbegrenzung sowie Pflichtfelder und Kontextform erfolgreich; zu diesem Zeitpunkt waren 17 Worker-Tests enthalten. Danach wurde die serverseitige Supabase-Sessionprüfung mit einem 8-Sekunden-Timeout abgesichert; ein Timeout wird kontrolliert mit HTTP 504 beantwortet. Der zusätzliche Timeout-Regressionstest und die vollständige CI waren in Run [44365416489](https://github.com/fantagawehnn/Kajo/actions/runs/44365416489) erfolgreich. `tests/coach-worker.test.mjs` enthält nun 18 Worker-Tests.
- Aktueller Integrationsstand nach Übernahme des neuesten Garmin-Archiv-Fixes und Dokumentationsabgleich: PR-CI Run [44369164709](https://github.com/fantagawehnn/Kajo/actions/runs/44369164709) und Push-CI Run [44369151819](https://github.com/fantagawehnn/Kajo/actions/runs/44369151819) auf Commit `410700c5fdfcca8c570963b1a7b1d438b448b746` erfolgreich. Beide Läufe umfassen Syntaxprüfung, Regression-Smoke-Tests, Coach-Kontexttests, Coach-Worker-Sicherheitstests, Garmin-Load-/Coverage-Tests, Trainingslast-Zonentests, Readiness-Tests, tägliche Garmin-HF-Recovery-Tests und Navigation-Smoke-Tests.
- Für beide Läufe war der produktive Cloudflare-Deploy-Job erwartungsgemäß übersprungen, da kein Push auf `v2` erfolgte.
- Cloudflare hat für Commit `c3736e2113f2acbe7bfb79d3b7041300bcedc391` einen Preview-Worker erfolgreich gebaut und bereitgestellt. Preview-URL: https://feature-coach-v2-integration-kajo.fantagawehn.workers.dev. Das ist eine Preview-Bereitstellung, kein Produktionsdeploy und kein Nachweis eines vollständigen Browser-/Coach-Funktionstests.

Die automatisierten Tests laufen damit in GitHub Actions erfolgreich. Die Cloudflare-Preview wurde erfolgreich bereitgestellt; ein vollständiger Browser-/Runtime-Test mit gültiger und abgelaufener Supabase-Sitzung steht weiterhin aus.

## Vor Livebetrieb zwingend offen

1. In Cloudflare müssen `SUPABASE_URL` und `SUPABASE_ANON_KEY` als Worker-Variablen gesetzt sein. Der Supabase-Service-Role-Key wird dafür nicht benötigt und darf nicht eingebunden werden.
2. Workers AI muss für das Cloudflare-Konto verfügbar sein; Kosten- und Kontingentgrenzen sind zu prüfen.
3. Die Namespace-ID `987654321` ist nach Cloudflare-Dokumentation eine vom Betreiber frei festgelegte positive Ganzzahl, die innerhalb des Cloudflare-Kontos eindeutig sein muss. Sie ist daher nicht automatisch ein Platzhalter oder eine von Cloudflare zugewiesene Ressourcen-ID. Vor Produktivbetrieb muss geprüft werden, dass kein anderer Rate-Limit-Binding-Eintrag im Konto dieselbe ID verwendet; gleiche IDs teilen Zähler. Cloudflare Rate Limiting ist näherungsweise und standortbezogen, kein global strikt durchgesetztes Kontingent.
4. Die Wrangler-Version muss die Rate-Limit-Binding-Konfiguration unterstützen (mindestens 4.36.0).
5. Die Modell-ID `@cf/zai-org/glm-4.7-flash` muss im Zielkonto praktisch getestet werden.
6. Browser-/Runtime-Test mit gültiger und abgelaufener Supabase-Sitzung.
7. Im Livebetrieb noch prüfen: AI-Kontingent erschöpft, reale Cloudflare-Binding-Fehler und Verhalten bei Netzwerk-Timeouts.
8. Regressionstest im laufenden System: Garmin-Synchronisierung, Kalender, Aktivitäten, Profil, Training Load und Coach-Navigation.
9. Rate-Limit-Konfiguration gegen das tatsächliche Cloudflare-Konto validieren.

## Deployment- und Integrationsstatus

- GitHub-Actions-Syntax- und Regressionstests: erfolgreich.
- Browser-/Runtime-Test: noch nicht durchgeführt.
- Supabase-Auth-Timeout: im Code mit 8 Sekunden begrenzt; automatisierter Regressionstest und CI erfolgreich (Run 44365416489).
- Cloudflare-Variablen: nicht gesetzt bzw. nicht verifiziert.
- Cloudflare-Preview: Build und Deployment für Commit `c3736e2` erfolgreich. Für den aktuellen Feature-Head `410700c` ist keine neuere Preview-Bereitstellung bestätigt; vollständiger Runtime-Test noch offen.
- Cloudflare-Produktionsdeployment: nicht ausgeführt.
- Supabase-Änderungen oder Datenbankmigrationen: nicht ausgeführt.
- PR #81 ist offen und Draft; kein Merge in `v2`. Der stabile Branch wurde nicht verändert.
