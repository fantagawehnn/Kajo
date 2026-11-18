# KAJO Coach v2 – Integrationsstand

Stand: 2026-11-18

## Arbeitsbranch

- Zielbasis: `v2`
- Arbeitsbranch: `feature/coach-v2-integration`
- Ausgangscommit: `39107f3dc56bd0779133ee7534fc7ff1bd49b387`
- Der Branch enthält ausschließlich selektive Coach-Änderungen; `v2` wurde nicht verändert.
- Kein Merge, Rebase, Pull Request oder Deployment wurde ausgeführt.

## Umgesetzte Änderungen

1. `worker.js`: authentifizierter `POST /api/coach`-Endpunkt mit Supabase-Sessionprüfung und Cloudflare Workers AI.
2. `wrangler.jsonc`: Workers-AI-Binding `AI` ergänzt.
3. `js/coach.js`: Frontend-Anbindung an den Serverendpunkt; Antwortausgabe als Text.
4. Neu: `js/coach-context.js`, `js/coach-data-context.js`, `js/coach-analysis.js`.
5. `js/main.js`: ausschließlich Cache-Buster für Coach-Modul von `v=1` auf `v=2` geändert.
6. `index.html`: Coach-Hinweise zur externen Verarbeitung über Cloudflare Workers AI aktualisiert. Die übrige HTML-Struktur stammt aus `v2`.

## Statische Kompatibilitätsprüfung

- Der aktuelle `v2`-State enthält die vom Kontextmodul verwendeten Felder `rawActivities`, `dailyTimeline`, `dailyCheckins`, `plannedActivities`, `strengthLogs`, `strengthPBs`, `races`, `profile` und `settings`.
- `v2/js/training-load.js` exportiert `calculateGarminZoneLoad`, das vom Analysemodul verwendet wird.
- `v2/js/data-source.js` exportiert `isGarminActivity`, das vom Analysemodul verwendet wird.
- Der Branchvergleich gegen `v2` zeigt derzeit neun geänderte bzw. hinzugefügte Dateien; die Änderungen sind auf Coach-Integration und Statusdokumentation begrenzt.

## Nachprüfung der Kontextauswahl

- Historische Aktivitäts- und Belastungszeitreihen werden bei der Auswahl nun explizit auf den heutigen Tag begrenzt. Damit stimmt die tatsächliche Auswahl mit `contextSelection.selectedTo` überein; künftig datierte Einträge können nicht mehr versehentlich in rückblickende Aktivitäts- und Load-Analysen gelangen.
- Die geplante Trainingsauswahl bleibt davon getrennt und umfasst weiterhin das vorgesehene Planungsfenster von 14 Tagen zurück bis 42 Tage voraus.
- Diese Korrektur wurde statisch am Quelltext geprüft; ein Browser-/Runtime-Test steht weiterhin aus.

## Vor Livebetrieb zwingend offen

1. In Cloudflare müssen `SUPABASE_URL` und `SUPABASE_ANON_KEY` als Worker-Variablen gesetzt sein. Der Supabase-Service-Role-Key wird dafür nicht benötigt und darf nicht eingebunden werden.
2. Workers AI muss für das Cloudflare-Konto verfügbar sein; Kosten-/Kontingentgrenzen sind zu prüfen.
3. Das Request-Body-Limit wird serverseitig zusätzlich zum Content-Length-Header während des Stream-Lesens durchgesetzt (maximal 350.000 Bytes); die serialisierte Kontextgröße wird separat begrenzt.
4. Cloudflare Rate Limiting ist in `wrangler.jsonc` mit 10 Anfragen pro Nutzer und 60 Sekunden konfiguriert. Die Namespace-ID `987654321` muss im Cloudflare-Konto auf Eindeutigkeit geprüft werden. Cloudflares Limit ist näherungsweise und je Standort; es ist kein global striktes Kontingent.
5. Für die Rate-Limit-Konfiguration ist eine Wrangler-CLI-Version ab 4.36.0 erforderlich.
4. Browser-/Runtime-Test mit gültiger und abgelaufener Supabase-Sitzung.
5. Fehlerfälle testen: fehlende Worker-Konfiguration, AI-Kontingent erschöpft, ungültiger JSON-Body, zu großer Kontext, leere AI-Antwort.
6. Regressionstest: Garmin-Synchronisierung, Kalender, Aktivitäten, Profil, Training Load und bisherige Coach-Navigation.
7. Prüfen, ob die gewählte Modell-ID `@cf/zai-org/glm-4.7-flash` im Zielkonto aktuell verfügbar ist.

## Test- und Deploymentstatus

- GitHub-Dateien und Branchvergleich geprüft.
- Keine lokalen Build-, Lint- oder Browser-Tests ausgeführt.
- Keine Cloudflare-Variablen gesetzt.
- Kein Cloudflare-Deployment ausgeführt.
- Die Modell-ID `@cf/zai-org/glm-4.7-flash` wurde gegen den aktuellen Cloudflare-Modellkatalog geprüft; sie ist dort gelistet und wird für Workers Free als verfügbar genannt.
- Die neue Rate-Limit-Binding-Konfiguration ist im Repository hinterlegt, aber noch nicht gegen das Cloudflare-Konto bzw. dessen Wrangler-Version validiert.
- Keine Supabase-Änderungen oder Datenbankmigrationen ausgeführt.

## Sicherheits- und Produktgrenzen

Der Coach übermittelt die konkrete Frage und den dafür ausgewählten Trainingsdatenkontext an den KAJO-Worker und von dort an Cloudflare Workers AI. Die Oberfläche weist darauf hin. Der Coach soll keine Trainingspläne, Kalender oder gespeicherten Daten verändern. Eine wissenschaftliche Literaturdatenbank ist weiterhin nicht angebunden; der Coach darf daher keine Studien oder Quellen erfinden.
