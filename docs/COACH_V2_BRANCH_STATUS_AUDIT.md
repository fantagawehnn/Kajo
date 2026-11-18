# KAJO – Branch- und Implementierungsstatus des KI-Coachs

**Stand:** 18. November 2026  
**Prüfart:** Read-only-Quellcodeprüfung über GitHub; keine Tests, kein Deployment, keine Datenbankänderung.

## 1. Ergebnis in Kürze

Der neue KI-Coach ist im Branch `integration/coach-ai-v2-latest` als Quellcode vorbereitet. Er ist nach der geprüften Branch-Situation jedoch **nicht Bestandteil des Branches `v2`**.

Die Chat-Oberfläche ist in beiden Ständen vorhanden. Das allein bedeutet nicht, dass ein Sprachmodell angebunden ist:

- In `v2` delegiert `worker.js` alle Requests ausschließlich an `env.ASSETS.fetch(request)`. Es gibt dort keinen `/api/coach`-Handler und keine Workers-AI-Bindung in `wrangler.jsonc`.
- Die in `v2` vorhandene `js/coach.js` erzeugt eine lokale, regelbasierte Antwort aus dem letzten Eintrag der Trainingszeitreihe. Sie ruft kein Sprachmodell auf.
- Im Integrationsbranch enthält `worker.js` einen authentifizierten `POST /api/coach`-Endpunkt und verwendet `@cf/zai-org/glm-4.7-flash` über die Cloudflare-AI-Bindung.
- Die Integration ist nicht durch Merge oder Rebase in `v2` übernommen worden.

## 2. Branch-Vergleich

Verglichen wurden:

- Basis: `v2`
- Head: `integration/coach-ai-v2-latest`

GitHub meldet den Status `diverged`:

- Integrationsbranch: 202 Commits voraus
- Integrationsbranch: 143 Commits hinter `v2`
- Gemeinsamer Merge-Base: `8d8075bd64f4e46153b02aecae984bb61e5ed744`

Die Branches dürfen daher nicht als einfache lineare Entwicklungsstände behandelt werden. Ein Zusammenführen oder Rebasen wäre eine eigenständige, risikobehaftete Integrationsarbeit und ist nicht Teil dieser Prüfung.

## 3. KI-Coach im Integrationsbranch

### Frontend

- `js/coach.js` lädt die aktuelle Supabase-Sitzung und sendet Frage, ausgewählten Kontext und begrenzten Gesprächsverlauf an `/api/coach`.
- `js/coach-context.js` strukturiert Profilinformationen.
- `js/coach-data-context.js` wählt Daten abhängig von der Frage aus und dokumentiert Auswahlfenster, Datenabdeckung und Begrenzungen.
- `js/coach-analysis.js` erzeugt deterministische Zusammenfassungen, unter anderem zu Trainingsdauer, Wochenumfang, Kanu-Aktivitäten, Herzfrequenzzonen, Belastung, Check-ins, VO2max und Wettkampfergebnissen.
- `js/main.js` lädt das Coach-Modul bei Bedarf dynamisch und stellt die Chat-Funktion für die Oberfläche bereit.

### Cloudflare Worker

- `worker.js` stellt `POST /api/coach` bereit.
- Der Worker prüft das Supabase-Bearer-Token über den Supabase-Auth-Endpunkt.
- Die Modellanfrage erfolgt serverseitig über die Cloudflare-AI-Bindung.
- `wrangler.jsonc` definiert `ai.binding = AI`.
- Der Worker enthält Regeln zur Datenqualität, zu fehlenden Werten, zu Belastungsmodellen, zur Interpretation von Garmin-Daten und zur vorsichtigen Trainingsberatung.
- Der Coach ist als passives Beratungssystem beschrieben: Er soll weder Trainingsplan noch Kalender oder gespeicherte Daten verändern.

## 4. Noch nicht Bestandteil des KI-Coachs

Die wissenschaftliche Literaturdatenbank ist im geprüften Stand noch nicht in den Antwortprozess eingebunden. Insbesondere ist kein aktiver Retrieval-Schritt erkennbar, der Studien, Textpassagen oder Embeddings abruft und als belegten Kontext an das Modell übergibt.

Die im Integrationsbranch vorhandenen Dokumente, Upload-Module und Edge-Function-Dateien sind Entwürfe bzw. vorbereitete Implementierung. Laut den zugehörigen Projektständen wurden sie nicht deployed und nicht getestet. Aus ihrer Existenz darf nicht geschlossen werden, dass PDF-Upload, Extraktion, Speicherung, Freigabe oder Literatur-Retrieval bereits produktiv funktionieren.

## 5. Konfigurations- und Betriebsabhängigkeiten

Für den KI-Endpunkt müssen die im Worker verwendeten Supabase-Variablen und die Cloudflare-AI-Bindung in der tatsächlichen Cloudflare-Umgebung korrekt konfiguriert sein. Die Quellcodeprüfung bestätigt nicht, dass diese Einstellungen in einer aktiven Umgebung vorhanden sind.

Auch die Erreichbarkeit des Endpunkts, Modellverfügbarkeit, Kontingente und die korrekte Einbindung in eine veröffentlichte App-Version wurden nicht zur Laufzeit geprüft.

## 6. Nächste sichere Schritte

1. Die Integrationsbasis und die tatsächlich gewünschte Zielversion von `v2` eindeutig festlegen.
2. Vor einer Integration die Änderungen aus beiden Branches dateiweise und fachlich priorisieren; insbesondere neuere Änderungen an `v2` dürfen nicht verloren gehen.
3. Den KI-Coach als abgegrenzte Änderung integrieren: Worker-Endpunkt, AI-Bindung, Coach-Frontend und benötigte Kontextmodule.
4. Vor einer späteren Freigabe Konfiguration und Laufzeitverhalten separat prüfen. Tests und Deployment erfolgen nur nach ausdrücklicher Freigabe.
5. Die wissenschaftliche Wissensbasis anschließend als eigenständige Erweiterung anbinden, mit Studien-/Finding-Metadaten, Quellenbelegen und Transferabilitätskennzeichnung.

## 7. Grenzen dieser Prüfung

Diese Prüfung ist eine statische Quellcode- und Branch-Prüfung. Es wurden keine Tests ausgeführt, keine Secrets gelesen oder verändert, keine Datenbankobjekte angelegt oder geändert und kein Deployment, Merge oder Rebase vorgenommen. Sie bestätigt daher den vorhandenen Quellcode, nicht die produktive Funktionsfähigkeit.
