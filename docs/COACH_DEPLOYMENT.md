# KAJO KI-Coach – Serverkonfiguration

Der Coach wird über den bestehenden Cloudflare Worker unter `POST /api/coach` angesprochen. Der OpenAI-Schlüssel liegt ausschließlich als serverseitiges Worker-Secret vor.

## Benötigte Worker-Variablen

In Cloudflare Dashboard → Workers & Pages → Worker `kajo` → Settings → Variables and Secrets:

| Name | Typ | Inhalt |
|---|---|---|
| `SUPABASE_URL` | Variable | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Secret oder Variable | Supabase anon/publishable key; niemals service_role |
| `OPENAI_API_KEY` | Secret | API-Key des OpenAI-Projekts |
| `OPENAI_MODEL` | Variable | Ein für das API-Projekt freigeschaltetes Modell |

Alternativ können Secrets mit Wrangler gesetzt werden:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SUPABASE_ANON_KEY
```

Die nicht geheimen Variablen `SUPABASE_URL` und `OPENAI_MODEL` können in den Worker-Einstellungen hinterlegt werden. Vor dem ersten produktiven Einsatz muss geprüft werden, dass alle vier Werte in der richtigen Worker-Umgebung gesetzt sind.

## Sicherheits- und Datenverhalten

- Der Worker prüft das Supabase-Access-Token bei Supabase Auth.
- Es wird kein service_role-Key verwendet.
- Der OpenAI-Key wird nie an den Browser ausgeliefert.
- Die Anfrage enthält nur den vom Client bereits geladenen Account-Kontext; Roh-Telemetrie, GPS, Nutzer-IDs, Körpergewicht und Zyklusdaten werden nicht pauschal übertragen.
- KAJO-Belastungskennzahlen werden aus der vorhandenen `dailyTimeline` übernommen und nicht durch den Coach neu berechnet.
- OpenAI Responses wird mit `store: false` aufgerufen.
- Chatverlauf bleibt vorerst nur im Arbeitsspeicher des geöffneten Browser-Tabs und wird nicht dauerhaft gespeichert.
- Der Coach-Endpunkt schreibt keine Trainings-, Profil- oder Kalenderdaten.

## Noch nicht erledigt

- Worker-Variablen und Secrets sind nicht gesetzt.
- Es wurde kein Deployment ausgeführt.
- Es gibt derzeit keine serverseitige Rate-Limit- oder Kostenkontrolle pro Nutzer.
- Der Umfang des Datenkontexts ist noch nicht durch reale Produktionsdaten validiert.
- Es wurden auf ausdrücklichen Wunsch keine Tests ausgeführt.
