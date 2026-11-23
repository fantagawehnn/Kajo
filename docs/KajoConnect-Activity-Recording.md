# KAJO Connect – Aktivitätsoberfläche und erste FIT-Aufzeichnung

**Status:** Erste Implementierungsstufe im Branch `feature/kajo-connect`; lokaler Garmin-Build und Gerätetest stehen noch aus.  
**Zielgerät:** Garmin Venu 3S.

## 1. Bedienablauf

1. Auf dem KAJO-Startbildschirm wird K1, C1 oder C2 ausgewählt.
2. „STARTEN“ öffnet die Aktivitätsansicht.
3. In der Aktivitätsansicht startet die Nutzerin die Aufzeichnung ausdrücklich über „STARTEN“.
4. Während der Aufzeichnung werden – sofern die Uhr die Werte bereitstellt – Geschwindigkeit, Herzfrequenz, verstrichene Zeit und GPS-Status angezeigt.
5. „RUNDE“ fügt einen FIT-Lap hinzu.
6. „ENDE“ beendet die Aufzeichnung und speichert die FIT-Datei.
7. Nach dem Speichern führt „ZURUECK“ zurück zur Startansicht.

## 2. Implementierte Dateien

- `KajoConnect/source/KajoConnectRecordingEngine.mc`: kapselt Erzeugen, Starten, Rundenmarkierung, Stoppen und Speichern einer ActivityRecording-Session.
- `KajoConnect/source/KajoConnectActivityView.mc`: Aktivitätsanzeige mit Live-Abfrage von `Activity.getActivityInfo()`, Sekunden-Refresh und GPS-Positionsereignissen.
- `KajoConnect/source/KajoConnectActivityDelegate.mc`: Touch-Eingaben für die Aktivitätsansicht.
- `KajoConnect/source/KajoConnectView.mc`: zusätzlicher Start-Einstieg auf dem KAJO-Startbildschirm.
- `KajoConnect/manifest.xml`: zusätzliche Berechtigungen `Fit` und `Positioning`; die vorhandene `Communications`-Berechtigung bleibt erhalten.

Die erste FIT-Aufzeichnung verwendet bewusst `Activity.SPORT_GENERIC` und `Activity.SUB_SPORT_GENERIC`. Ein spezifischer Garmin-Sporttyp für Kanu-Wildwasserrennsport wurde hier noch nicht verifiziert. Die Bootsklasse steht im Aktivitätsnamen (zum Beispiel „KAJO K1“), ersetzt aber keine FIT-Sportklassifizierung.

## 3. Datenqualität und Anzeige

Die Anzeige prüft auf `null` und stellt fehlende Werte als „--“ dar. Es werden keine Beispielwerte in die echte Aktivitätsansicht hineingeschrieben. Geschwindigkeit wird aus m/s in km/h umgerechnet. Die Zeit wird aus `timerTime` beziehungsweise ersatzweise `elapsedTime` angezeigt.

GPS wird über `Position.enableLocationEvents()` angefordert. „GPS AKTIV“ wird nur angezeigt, wenn die Aktivitätsinformation eine aktuelle Position enthält; andernfalls bleibt der Status „GPS SUCHT“.

## 4. Noch nicht umgesetzt

- **Pause/Fortsetzen:** Die verwendete `ActivityRecording.Session`-Schnittstelle stellt in der geprüften API-Referenz `start()`, `stop()`, `save()`, `discard()`, `isRecording()` und `addLap()` bereit, aber keine dedizierte Pause-/Fortsetzen-Methode. Ein bloßes Anhalten der UI-Zeit bei weiterlaufender FIT-Aufzeichnung wäre fachlich falsch. Deshalb wird vorerst keine Pause-Schaltfläche angeboten.
- **Intervallsteuerung:** Die tatsächlichen Intervall-/Workout-Objekte in KAJO müssen zuerst anhand gespeicherter Daten untersucht werden.
- **Canoe-FIT-Sportprofil:** Die passende Sport-/Subsport-Klassifizierung und die Verfügbarkeit relevanter FIT-Felder müssen geprüft werden.
- **Automatischer Upload nach KAJO:** Die lokale FIT-Aufzeichnung ist noch nicht an den KAJO-Geräte-Endpunkt angebunden. Es wird noch keine Aktivität automatisch in Supabase gespeichert.
- **Offline-Queue, Token-Speicherung und Pairing:** noch nicht implementiert.
- **Fehlerbehandlung für GPS-/FIT-Abbruch, App-Unterbrechung und Akkuverhalten:** muss auf dem echten Gerät getestet werden.

## 5. Testreihenfolge

1. Pull des aktuellen Branches und Build für `venu3s`.
2. Simulatorprüfung: Startansicht → Aktivitätsansicht → Start → Runde → Ende → Zurück.
3. Test auf der Venu 3S mit erteilter Fit-, Positioning- und Sensor-Berechtigung.
4. Prüfen, ob FIT-Datei gespeichert wird und ob Geschwindigkeit, Herzfrequenz, Zeit und GPS-Status realistische verfügbare Werte liefern.
5. FIT-Datei aus dem Gerät exportieren und Sporttyp, GPS-Track, Zeitstempel und Runden in einem FIT-Parser prüfen.

**Wichtig:** Ein erfolgreicher Monkey-C-Build bestätigt nur die Kompilierung. Er bestätigt noch nicht, dass GPS, Herzfrequenz, FIT-Speicherung oder der Export auf der Venu 3S im Feld korrekt funktionieren.
