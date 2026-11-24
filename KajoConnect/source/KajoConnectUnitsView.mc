import Toybox.WatchUi;

class KajoConnectUnitsView extends WatchUi.Menu2 {

    function initialize() {
        Menu2.initialize({:title => "EINHEITEN", :footer => "KAJO · METRISCHER STANDARD"});
        addItem(new WatchUi.MenuItem("Distanz", "Kilometer (km)", "distance", {}));
        addItem(new WatchUi.MenuItem("Tempo", "Minuten pro Kilometer (min/km)", "pace", {}));
        addItem(new WatchUi.MenuItem("Geschwindigkeit", "Kilometer pro Stunde (km/h)", "speed", {}));
    }
}
