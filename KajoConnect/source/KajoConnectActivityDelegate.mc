import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectActivityDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectActivityView;

    function initialize(view as KajoConnectActivityView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    // Obere physische Taste: Aufzeichnung starten bzw. beenden und speichern.
    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.handlePrimaryButton();
            return true;
        }

        // Untere Taste wird nur während einer Aufzeichnung als Runde verwendet.
        // Außerhalb einer Aufzeichnung bleibt das normale Zurück-Verhalten aktiv.
        if (key == WatchUi.KEY_ESC && mView.handleLapButton()) {
            return true;
        }

        return false;
    }

    // Vertikales Wischen wechselt zwischen den Datenansichten.
    function onNextPage() as Lang.Boolean {
        mView.nextDisplayPage(1);
        return true;
    }

    function onPreviousPage() as Lang.Boolean {
        mView.nextDisplayPage(-1);
        return true;
    }
}
