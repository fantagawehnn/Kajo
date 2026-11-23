# KAJO Connect – Aktivitätsanzeigen und Trainingsübersicht

**Status:** UI-Grundlage im Branch `feature/kajo-connect`; lokaler Garmin-Build und Gerätetest dieser Änderungen stehen noch aus.  
**Zielgerät:** Garmin Venu 3S.

## 1. Individuelle Aktivitätsseiten

Über das Uhrenmenü „Anzeigen anpassen“ lassen sich die fünf vorhandenen Datenseiten einzeln aktivieren oder deaktivieren:

- Übersicht: aktuelle Geschwindigkeit, Herzfrequenz und Zeit
- Geschwindigkeit: aktuell, Durchschnitt und Maximum
- Herzfrequenz: aktuell, Durchschnitt und Maximum
- Distanz & Zeit: Distanz, Zeit und Kalorien
- Weitere Daten: Kadenz, Leistung, Höhe, Training Effect, GPS-Status/-Qualität sowie Auf-/Abstieg

Die Auswahl wird über die Garmin-App-Properties auf dem Gerät gespeichert und beim nächsten Öffnen der Aktivität wieder geladen. Mindestens eine Seite bleibt aktiv. Die Reihenfolge der aktiven Seiten entspricht vorerst der Reihenfolge in der Liste.

**Abgrenzung:** In dieser Stufe können ganze Datenseiten ausgewählt werden. Einzelne Kennzahlen innerhalb einer Seite lassen sich noch nicht frei austauschen, verschieben oder in ihrer Größe verändern. Dafür ist ein weitergehender Layout-Editor erforderlich.

## 2. Trainingsübersicht

- Ein Eintrag aus der Trainingsliste auf dem Startbildschirm öffnet eine eigene Trainingsübersicht.
- Über das Uhrenmenü ist die Trainingsübersicht ebenfalls erreichbar.
- Derzeit kann die Uhr aus der bestehenden lokalen Anzeige nur den Namen der ausgewählten Einheit übernehmen.

Die KAJO-Web-App speichert geplante Einheiten mit den Feldern `id`, `date`, `name`, `type`, `duration`, `targetTss`, `category` und `desc`. Die geplanten Einheiten werden aktuell aber noch nicht an KAJO Connect übertragen. Daher zeigt die neue Uhrenansicht noch keine echten Dauer-, Belastungs- oder Beschreibungswerte an. Eine strukturierte Intervall-/Schrittfolge ist im geprüften Planungsmodul nicht vorhanden und wird nicht erfunden.

## 3. Bedienung und Aufzeichnung

- Datenseiten während der Aufzeichnung vertikal nach oben/unten wechseln.
- „RUNDE“ fügt einen FIT-Lap hinzu.
- „ENDE“ beendet die Aufzeichnung und speichert die FIT-Datei.
- Bootsklasse wird im Startmenü ausgewählt und nicht als Aktivitätsüberschrift angezeigt.

## 4. Noch offen

- Synchronisierung der geplanten KAJO-Einheit samt Metadaten zur Uhr.
- Darstellung strukturierter Intervalle, sobald ein entsprechendes Datenmodell in KAJO existiert.
- Freies Anordnen und individuelles Bearbeiten einzelner Kennzahlen innerhalb einer Datenseite.
- Herzfrequenzzonen aus dem KAJO-Athletenprofil.
- Hardware-Tastensteuerung für Start/Stop und Runde.
- Automatischer Upload nach KAJO, Pairing und Offline-Queue.

## 5. Test

1. `git pull origin feature/kajo-connect`
2. Build mit `Monkey C: Build for Device` für `venu3s`.
3. Menü „Anzeigen anpassen“ öffnen, Seiten abwählen, speichern, App neu öffnen und Auswahl kontrollieren.
4. Aktivität starten und prüfen, ob nur die aktivierten Seiten per Wischgeste erreichbar sind.
5. Trainingsübersicht aus dem Menü und über einen angezeigten Trainingseintrag öffnen.

Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. Anzeige, Persistenz und Touch-Bedienung müssen zusätzlich im Simulator und auf der Venu 3S geprüft werden.
