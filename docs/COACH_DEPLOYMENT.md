# KAJO KI-Coach – kostenlose Cloudflare-Konfiguration

Der Coach wird über den bestehenden Cloudflare Worker unter `POST /api/coach` angesprochen. Die KI-Inferenz läuft ausschließlich über Cloudflare Workers AI. Es wird kein OpenAI- oder anderer kostenpflichtiger Modell-API-Key verwendet.

## Modell und Kostenrahmen

- Fest eingestelltes Modell: `@cf/zai-org/glm-4.7-flash`.
- Cloudflare Workers AI stellt im Workers Free-Tarif aktuell 10.000 Neurons pro Account und Tag kostenlos bereit.
- Im Workers Free-Tarif schlagen weitere KI-Anfragen nach Ausschöpfung des kostenlosen Kontingents fehl. Sie werden nicht automatisch kostenpflichtig fortgesetzt.
- Das Kontingent wird accountweit genutzt und täglich um 00:00 UTC zurückgesetzt.
- Um das 0-€-Ziel einzuhalten, muss der Cloudflare-Account im Workers Free-Tarif bleiben. Nicht auf Workers Paid wechseln und keine kostenpflichtigen AI-Gateway-Guthaben aktivieren. Auf einem Paid-Tarif kann Nutzung oberhalb der kostenlosen Zuteilung berechnet werden.
- Die tatsächliche Zahl möglicher Coach-Anfragen hängt von Kontextgröße, Antwortlänge, Modellverbrauch und sonstiger Workers-AI-Nutzung desselben Cloudflare-Accounts ab. Eine feste monatliche Anfragezahl lässt sich deshalb nicht seriös versprechen.

Offizielle Informationen:
- Cloudflare Workers AI Preise: https://developers.cloudflare.com/workers-ai/platform/pricing/
- GLM-4.7-Flash Modell: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/

## Benötigte Worker-Konfiguration

In `wrangler.jsonc` ist das AI-Binding als `AI` eingetragen. Bei Konfiguration über das Cloudflare-Dashboard muss der Worker ebenfalls mit Workers AI verbunden werden.

Weiterhin benötigt der Worker:

| Name | Typ | Inhalt |
|---|---|---|
| `SUPABASE_URL` | Variable | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Secret oder Variable | Supabase anon/publishable key; niemals service_role |

Es wird kein `OPENAI_API_KEY`, `OPENAI_MODEL` oder sonstiger Modell-API-Schlüssel benötigt.

Das Supabase-Secret kann mit Wrangler gesetzt werden:

```bash
npx wrangler secret put SUPABASE_ANON_KEY
```

Die Variable `SUPABASE_URL` wird in den Worker-Einstellungen hinterlegt. Vor der Aktivierung muss geprüft werden, dass beide Supabase-Werte in der richtigen Worker-Umgebung gesetzt sind und das Workers-AI-Binding vorhanden ist.

## Sicherheits- und Datenverhalten

- Der Worker prüft das Supabase-Access-Token bei Supabase Auth.
- Es wird kein service_role-Key verwendet.
- Es gibt keinen Modell-API-Key im Browser und keinen OpenAI-Aufruf.
- Die Anfrage enthält nur den vom Client bereits geladenen Account-Kontext; Roh-Telemetrie, GPS, Nutzer-IDs, Körpergewicht und Zyklusdaten werden nicht pauschal übertragen.
- KAJO-Belastungskennzahlen werden aus der vorhandenen `dailyTimeline` übernommen und nicht durch den Coach neu berechnet.
- Das Modell wird direkt über das Cloudflare-Binding aufgerufen. Die Modellseite weist für GLM-4.7-Flash Zero Data Retention aus; maßgeblich bleiben Cloudflares aktuelle Bedingungen und Datenschutzinformationen.
- Chatverlauf bleibt vorerst nur im Arbeitsspeicher des geöffneten Browser-Tabs und wird nicht dauerhaft gespeichert.
- Der Coach-Endpunkt schreibt keine Trainings-, Profil- oder Kalenderdaten.
- Der Worker validiert die Sitzung, liest die Trainingsdaten aber nicht selbst aus der Datenbank: Der authentifizierte Browser übermittelt den bereits geladenen KAJO-Kontext. Die Authentifizierung schützt den Endpunkt, garantiert jedoch nicht die Unveränderbarkeit der vom Browser gesendeten Kennzahlen.

## Noch offen

- Cloudflare Workers AI muss für den bestehenden Worker aktiviert bzw. das Binding deployed werden.
- Supabase-Variablen müssen in der Cloudflare-Produktionsumgebung vorhanden sein.
- Das tatsächliche Neuron-Kontingent und die Modellantwort müssen nach Freigabe in der Cloudflare-Umgebung beobachtet werden.
- Es gibt noch keine persistente anwendungsseitige Tagesbegrenzung pro Nutzer; das kostenlose Kontingent ist accountweit.
- Der Umfang des Datenkontexts ist noch nicht durch reale Produktionsdaten validiert.
- Es wurde kein Deployment ausgeführt und es wurden auf ausdrücklichen Wunsch keine Tests ausgeführt.
