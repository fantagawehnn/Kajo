# KAJO Version 2 – Entwicklungsplan

## Phase 0 – Bestand und Sicherheitsgrenzen
- [x] Repository Kajo identifiziert; Branch `v2` angelegt.
- [x] Bisherige Anwendung Endurance-AI als Referenz identifiziert.
- [x] Vorhandene Supabase-Authentifizierung und Garmin-Edge-Function im Code lokalisiert.
- [ ] Vollständigen Dateibaum und aktuelle Modulstruktur inventarisieren.
- [ ] Garmin-Request-Verträge, Tabellen, RLS und Edge-Function-Secrets dokumentieren.
- [ ] Prüfen, welche Berechnungen und Module bereits zentral implementiert sind.

## Phase 1 – Übernahme der stabilen Basis
- [ ] V2-Anwendungsgerüst aufsetzen.
- [ ] Supabase-Client und Authentifizierung mit derselben User-ID integrieren.
- [ ] Bestehende Garmin-Integration über dieselbe Edge Function anbinden.
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
- [ ] Build, Tests und Deployment prüfen.
- [ ] Erst nach erfolgreicher Abnahme V2 als vollständige App freigeben.

## Abnahmekriterien

V2 gilt erst dann als vollständige Anwendung, wenn die Kernmodule funktionsfähig sind, die bestehenden Konten und Garmin-Verbindungen ohne Neuverknüpfung erkannt werden, die Berechnungen nachvollziehbar sind und keine Datenverluste oder unzulässigen Datenüberschreibungen auftreten.
