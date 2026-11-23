# KAJO Connect – Aktivitätsoberfläche und erste FIT-Aufzeichnung

**Status:** Erste mehrseitige Implementierungsstufe im Branch `feature/kajo-connect`; lokaler Build und Gerätetest der aktuellen Änderungen stehen noch aus.  
**Zielgerät:** Garmin Venu 3S.

## 1. Bedienablauf

1. Auf dem KAJO-Startbildschirm wird K1, C1 oder C2 ausgewählt.
2. „STARTEN“ öffnet die Aktivitätsansicht. Die Bootsklasse wird dort nicht als Überschrift angezeigt; sie bleibt Teil des FIT-Aktivitätsnamens.
3. In der Aktivitätsansicht startet die Nutzerin die Aufzeichnung über „STARTEN“.
4. Während der Aufzeichnung stehen fünf vertikal durch Wischen nach oben/unten erreichbare Datenseiten bereit:
   - Übersicht: aktuelle Geschwindigkeit, aktuelle Herzfrequenz und Zeit
   - Geschwindigkeit: aktuell, Durchschnitt und Maximum
   - Herzfrequenz: aktuell, Durchschnitt und Maximum
   - Distanz und Zeit: Distanz, Zeit und Kalorien
   - Weitere Daten: Kadenz, Leistung, Höhe, Training Effect, GPS-Status/-Qualität sowie Auf-/Abstieg
5. „RUNDE“ fügt einen FIT-Lap hinzu.
6. „ENDE“ beendet die Aufzeichnung und speichert die FIT-Datei.
7. Nach dem Speichern führt „ZURUECK“ zurück zur Startansicht.

## 2. Datenverfügbarkeit

Die Seiten verwenden verfügbare Eigenschaften aus `Toybox.Activity.Info`. Fehlende Werte werden als „--“ dargestellt. Welche Werte tatsächlich geliefert werden, hängt von Gerät, Sportprofil und Sensoren ab. Herzfrequenzzonen, Runden-spezifische Kennzahlen und individuelle KAJO-Feldlayouts sind in dieser Stufe noch nicht angebunden.

## 3. Implementierte Dateien

- `KajoConnect/source/KajoConnectRecordingEngine.mc`: FIT-Aufzeichnung, Rundenmarkierung, Stoppen und Speichern.
- `KajoConnect/source/KajoConnectActivityView.mc`: fünf Aktivitäts-Datenseiten und Live-Abfrage von Aktivitätsdaten.
- `KajoConnect/source/KajoConnectActivityDelegate.mc`: Touch-Eingaben und vertikale Seitenwechsel.
- `KajoConnect/source/KajoConnectView.mc`: Bootsklassenauswahl und Start-Einstieg im Startmenü.
- `KajoConnect/manifest.xml`: Berechtigungen Fit, Positioning und Communications.

Die FIT-Aufzeichnung verwendet vorerst `Activity.SPORT_GENERIC` und `Activity.SUB_SPORT_GENERIC`. Ein spezifischer Garmin-Sporttyp für Kanu-Wildwasserrennsport wurde noch nicht verifiziert.

## 4. Noch nicht umgesetzt

- Herzfrequenzzonen aus dem KAJO-Athletenprofil.
- Individuelles Austauschen, Entfernen, Hinzufügen und Anordnen einzelner Datenfelder über die KAJO-App.
- Runden-spezifische Kennzahlen und Intervall-/Workout-Steuerung.
- Automatischer Upload nach KAJO, Pairing und Offline-Queue.
- Hardware-Tastensteuerung für Start/Stop und Runde; die aktuelle Ansicht nutzt weiterhin die vorhandenen Touch-Flächen.
- Fehlerbehandlung für GPS-/FIT-Abbruch, App-Unterbrechung und Akkuverhalten.

## 5. Testreihenfolge

1. Pull des aktuellen Branches und Build für `venu3s`.
2. Simulatorprüfung: Startansicht → Aktivitätsansicht → vertikales Wischen durch alle Seiten → Start → Runde → Ende → Zurück.
3. Test auf der Venu 3S mit erteilten Berechtigungen.
4. FIT-Datei exportieren und Sporttyp, GPS-Track, Zeitstempel und Runden prüfen.

Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. GPS, Herzfrequenz, FIT-Speicherung und Export müssen zusätzlich auf dem Gerät geprüft werden.
