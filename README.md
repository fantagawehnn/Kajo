# KAJO – Athlete Performance Platform

KAJO ist eine sportwissenschaftlich fundierte Analyse- und Steuerungsplattform für leistungsorientierte Ausdauersportlerinnen und Ausdauersportler. Der sportartspezifische Schwerpunkt liegt auf dem Kanu-Wildwasserrennsport.

## Version 2

Version 2 wird parallel zur bestehenden Anwendung im Repository `fantagawehnn/Endurance-AI` entwickelt. Die bisherige Anwendung bleibt während der Entwicklung unverändert.

**Leitprinzip:** Bestehende Konten, Garmin-Verbindungen und personenbezogene Daten werden über dieselbe Supabase-Instanz und dieselbe authentifizierte Supabase-User-ID adressiert. Die neue Anwendung darf keine zweite Benutzeridentität oder separate Garmin-Verbindung für dasselbe Konto erzeugen.

## Verbindliche Grundlagen

- `docs/ARCHITECTURE.md`: Zielarchitektur und Sicherheitsgrenzen.
- `docs/ROADMAP.md`: schrittweise Umsetzung und Abnahmekriterien.
- `docs/AUDIT.md`: technische Bestandsaufnahme, FIT-/Load-/RPE-Befunde und offene Prüfungen.
- `docs/NAVIGATION.md`: verbindliche Fünf-Tab-Navigation, Seitenzuordnung und Abnahmestatus.
- Die bereitgestellten KAJO-UI-/UX-Richtlinien.
- Das bereitgestellte Masterdokument zur Berechnungsmethodik und Datenarchitektur.

## Entwicklungsregeln

1. Bestehende Garmin- und Supabase-Funktionen werden vor Änderungen geprüft und wiederverwendet.
2. Keine Änderungen am produktiven Datenbankschema oder an Edge-Function-Secrets ohne gesonderte Prüfung und Freigabe.
3. Keine erfundenen, imputierten oder stillschweigend auf null gesetzten Daten.
4. Garmin Training Load, Edwards TRIMP und sRPE-Load bleiben getrennte Kennzahlen.
5. UI-Änderungen verändern keine fachlichen Berechnungen.
6. Neue Funktionen werden modular, testbar und responsiv umgesetzt.

## Status

Die Entwicklung startet auf dem Branch `v2`. Der Branch `main` bleibt zunächst unverändert.
