import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectMenuView extends WatchUi.Menu2 {

    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        Menu2.initialize({:title => "EINSTELLUNGEN", :footer => "KAJO CONNECT"});
        mHomeView = homeView;

        addItem(new WatchUi.MenuItem("Trainingsfelder", "1, 2, 4 oder 6 Werte", "training_fields", {}));
        addItem(new WatchUi.MenuItem("Datenseiten", "Trainingsanzeigen konfigurieren", "display_pages", {}));
        addItem(new WatchUi.MenuItem("Trainingsübersicht", "Geplante Einheiten", "training_overview", {}));
        addItem(new WatchUi.MenuItem("Historie", "Abgeschlossene Einheiten", "history", {}));
        addItem(new WatchUi.MenuItem("Intervall-Hinweise", "Vibration und Signaltöne", "interval_hints", {}));
        addItem(new WatchUi.MenuItem("Bootsklasse", "K1 · C1 · C2", "boat_class", {}));
        addItem(new WatchUi.MenuItem("Einheiten", "Metrisches System", "units", {}));
        addItem(new WatchUi.MenuItem("Mit KAJO verbinden", "Gerät koppeln und synchronisieren", "pairing", {}));
        addItem(new WatchUi.MenuItem("Eigene Datenfelder", "Individuelle Messwerte", "custom_fields", {}));
    }
}
