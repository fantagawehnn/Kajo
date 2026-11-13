# KAJO Version 2 – Zielarchitektur

## 1. Ziel

KAJO V2 wird als vollständige, eigenständige Anwendung im Repository `fantagawehnn/Kajo` aufgebaut. Die bisherige Anwendung in `fantagawehnn/Endurance-AI` bleibt währenddessen bestehen und dient als technische Referenz für bereits funktionierende Funktionen.

Die V2 soll nicht nur eine neue Oberfläche sein. Sie soll eine klar getrennte, modulare Darstellungsschicht, zentrale Datenzugriffe und eine zentrale sportwissenschaftliche Berechnungsebene besitzen.

## 2. Identität und Backend-Kompatibilität

### Verbindliche Entscheidung

Für die Kompatibilität mit bestehenden Konten und Garmin-Verbindungen verwendet V2 dieselbe Supabase-Projektinstanz wie die bisherige Anwendung:

- Supabase-Projekt: `zgvargkfzgekokuisarv`
- Authentifizierung: Supabase Auth
- Benutzeridentität: unveränderte Supabase-UUID (`auth.uid()`)
- Garmin-Verbindungsstatus und verschlüsselte Zugangsdaten: bestehende benutzerbezogene Tabellen
- Garmin-Abrufe: bestehende Edge Function `garmin-personal`

Die neue Anwendung darf keine parallelen Nutzerkonten, keine zweite Garmin-Verknüpfung und keine abweichende Zuordnung der Garmin-Daten anlegen.

### Sicherheitsgrenzen

- Im Browser dürfen ausschließlich Supabase Project URL und Publishable/Anon Key verwendet werden.
- `service_role`, Garmin-Verschlüsselungsschlüssel, Garmin-Cron-Secret und sonstige privilegierte Secrets bleiben ausschließlich in der Server-/Edge-Function-Umgebung.
- Jeder benutzerbezogene Datenzugriff muss durch die authentifizierte Benutzer-ID begrenzt sein.
- Ein Kontowechsel muss den vorherigen Nutzerzustand vollständig deaktivieren, bevor Daten des neuen Kontos geladen werden.
- Bestehende RLS-Regeln und serverseitige Identitätsprüfungen dürfen nicht umgangen werden.

## 3. Garmin-Kompatibilität

Die bestehende Garmin-Integration ist nicht neu zu erfinden. Vor ihrer Übernahme werden Funktionsumfang, Request-Verträge und Datenmodelle geprüft. Danach wird sie über eine klar definierte KAJO-Datenschnittstelle eingebunden.

Zu erhalten sind insbesondere:
- bestehender Verbindungs- und Trennungsprozess,
- benutzergebundene Garmin-Credentials,
- serverseitige Verschlüsselung und Entschlüsselung,
- Aktivitäten- und Gesundheitsdaten-Synchronisierung,
- Sync-Fortschritt, Cursor und Wiederaufnahme,
- Fehler- und Rate-Limit-Behandlung,
- bestehende Speicherung der Garmin-Daten.

V2 darf die bestehende Edge Function nicht durch einen Browser-seitigen Garmin-Zugriff ersetzen. Die bestehende Funktion `garmin-personal` authentifiziert normale Requests anhand des Supabase-Bearer-Tokens und leitet daraus die User-ID ab. Diese Sicherheitsgrenze bleibt bestehen.

## 4. Fachliche Datenebenen

Die Architektur folgt fünf Ebenen:

1. Datenquellen
2. Import und Synchronisierung
3. Internes Datenmodell
4. Zentrale Berechnungsebene
5. Darstellung und Dashboard

Die UI greift auf zentrale Daten- und Berechnungsfunktionen zu. Kalender, Dashboard, Aktivitätsdetails und Analyse dürfen dieselbe Kennzahl nicht unabhängig voneinander berechnen.

## 5. Performance-Modell

Die vier verbundenen Dimensionen sind:

- Training Load: Trainingsdauer, Umfang, Häufigkeit, interne/externe Belastung, HF-Zonen, RPE, Monotonie und Belastungsspitzen.
- Recovery: HRV mit persönlicher Baseline, Ruhepuls, Schlaf und subjektive Erholung.
- Performance: VO₂max, Pace, Geschwindigkeit, Leistung, HF-Reaktion, aerobe Effizienz, HF-Drift und standardisierte Tests.
- Health: Krankheitstage, Verletzungen, Trainingsausfälle und Trainingsverfügbarkeit. Es werden keine medizinischen Diagnosen abgeleitet.

Unterschiedliche Belastungsmethoden bleiben getrennt:
- Garmin Training Load
- KAJO-HF-Zonen-Load / Edwards TRIMP
- sRPE-Load

## 6. Datenqualität

Jede Kennzahl erhält einen Datenstatus:
- Vollständig
- Eingeschränkt
- Nicht berechenbar

Fehlende Werte werden nicht als Null oder Ruhetag interpretiert. Datenherkunft bleibt nachvollziehbar (Garmin-Import, manuelle Eingabe, externe Diagnostik, KAJO-Berechnung oder algorithmische Schätzung).

## 7. UI-/UX-System

Alle Module verwenden ein gemeinsames Designsystem:
- kompakte, informationsdichte Ansichten,
- horizontale Kennzahlenanordnung,
- passende Ringdiagramme und kompakte Verlaufsdiagramme,
- einheitliche semantische Statusfarben,
- separate Sportartenfarben,
- direkte Interaktion mit Kennzahlen und Karten,
- progressive Offenlegung: Übersicht zuerst, Details bei Bedarf,
- konsistente Bedienbarkeit auf Desktop und Mobilgeräten.

Sportartenfarben dürfen nicht als Statusfarben verwendet werden. Ein hoher oder niedriger Messwert ist ohne fachlichen Kontext nicht automatisch positiv oder negativ.

## 8. Modulgrenzen

Vorgesehene fachliche Module:
- Dashboard
- Kalender (Tag, Woche, Monat, Jahr)
- Aktivitäten und Aktivitätsdetails
- Training Load
- Recovery
- Performance
- Health
- Saisonanalyse
- Trainingsplanung
- Wettkämpfe
- Krafttraining
- Profil
- Einstellungen
- Datenverwaltung und Garmin-Synchronisierung

Module teilen sich zentrale Komponenten, Tokens, Datenzugriffe und Berechnungen. Sie definieren keine eigenen, widersprüchlichen Regeln.

## 9. Migrations- und Änderungsregeln

- V2 wird zunächst parallel entwickelt.
- Bestehende produktive Daten und Garmin-Verbindungen werden nicht migriert, dupliziert oder überschrieben.
- Datenbankmigrationen sind nur dann zulässig, wenn eine konkrete Lücke nachgewiesen wurde und die Änderung rückwärtskompatibel geprüft ist.
- Die bisherige Anwendung und deren produktive Funktionen werden nicht durch V2-Experimente verändert.
- Secrets werden nicht in Git eingecheckt.
