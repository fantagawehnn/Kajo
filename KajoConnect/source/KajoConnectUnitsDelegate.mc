import Toybox.WatchUi;

class KajoConnectUnitsDelegate extends WatchUi.Menu2InputDelegate {

    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        WatchUi.showToast("Metrische Einheiten sind der Standard", null);
    }
}
