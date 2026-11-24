import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectActivityDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectActivityView;

    function initialize(view as KajoConnectActivityView) {
        InputDelegate.initialize();
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

        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_MENU) {
            mView.nextDisplayPage(1);
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            mView.nextDisplayPage(-1);
            return true;
        }

        return false;
    }

    // Touch-Wischgesten werden direkt verarbeitet, ohne Behavior-Mapping.
    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            mView.nextDisplayPage(1);
            return true;
        }
        if (direction == WatchUi.SWIPE_DOWN) {
            mView.nextDisplayPage(-1);
            return true;
        }
        return false;
    }
}
