# KAJO Version 2 – Entwicklungsplan

## Phase 0 – Bestand und Sicherheitsgrenzen
- [x] Repository Kajo identifiziert; Branch `v2` angelegt.
- [x] Bisherige Anwendung Endurance-AI als Referenz identifiziert.
- [x] Vorhandene Supabase-Authentifizierung und Garmin-Edge-Function im Code lokalisiert.
- [x] Vollständigen Dateibaum und aktuelle Modulstruktur inventarisieren; modularisierte Browser-App nach V2 übernommen.
- [ ] Garmin-Request-Verträge, Tabellen, RLS und Edge-Function-Secrets dokumentieren.
- [x] Bestehende Berechnungs- und Fachmodule inventarisiert; Abweichungen und offene Punkte in `docs/AUDIT.md` dokumentiert.

## Phase 1 – Übernahme der stabilen Basis
- [x] V2-Anwendungsgerüst aus dem modularisierten Referenzstand übernommen.
- [x] Supabase-Client und Authentifizierungslogik mit bestehender Projektkonfiguration übernommen; Live-Login-Test bleibt offen.
- [x] Bestehende Garmin-Frontendintegration und Funktionsaufrufe übernommen; Live-Sync-Test bleibt offen.
- [ ] Benutzerwechsel, Ladezustände und Fehlerzustände absichern.
- [ ] Keine produktiven Datenbankänderungen vornehmen.

## Phase 2 – Zentrales Designsystem und Kernarchitektur
- [ ] Design-Tokens zentralisieren.
- [ ] Wiederverwendbare Layout-, Ring-, Diagramm-, Karten- und Navigationskomponenten.
- [ ] Zentrale Datenzugriffsschicht.
- [ ] Zentrale Berechnungsebene mit Datenstatus und Herkunft.
- [ ] Tests für fehlende Daten, Benutzerwechsel und Berechnungsmethoden.

## Phase 3 – Kernmodule
- [ ] Dashboard
- [ ] Aktivitäten und Aktivitätsdetails
- [ ] Kalender mit Tag-, Wochen-, Monats- und Jahresansicht
- [ ] Training Load
- [ ] Recovery
- [ ] Performance
- [ ] Health

## Phase 4 – Erweiterte Module
- [ ] Saisonanalyse
- [ ] Trainingsplanung
- [ ] Wettkämpfe
- [ ] Krafttraining
- [ ] Profil und Einstellungen
- [ ] Datenimport, Datenqualität und Export

## Phase 5 – Qualitätssicherung und Freigabe
- [ ] Garmin-Verbindung mit bestehendem Konto testen.
- [ ] Nachweisen, dass dieselbe Supabase-User-ID verwendet wird.
- [ ] Bestehende Garmin-Daten werden korrekt gelesen und nicht dupliziert.
- [ ] Berechnungen mit definierten Testfällen prüfen.
- [ ] Desktop- und Mobilansichten prüfen.
- [ ] GitHub-Actions-Smoke-Test und Pages-Build für den aktuellen Commit erfolgreich prüfen; Live-Funktionstests bleiben offen.
- [ ] Erst nach erfolgreicher Abnahme V2 als vollständige App freigeben.

## Abnahmekriterien

V2 gilt erst dann als vollständige Anwendung, wenn die Kernmodule funktionsfähig sind, die bestehenden Konten und Garmin-Verbindungen ohne Neuverknüpfung erkannt werden, die Berechnungen nachvollziehbar sind und keine Datenverluste oder unzulässigen Datenüberschreibungen auftreten.
