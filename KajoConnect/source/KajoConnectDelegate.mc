import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectView;

    function initialize(view as KajoConnectView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        // Auf Touch-Uhren wie der Venu 3S wird die obere Aktionstaste
        // als KEY_ENTER gemeldet. InputDelegate erfasst diesen Key direkt.
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.activateHomeSelection();
            return true;
        }

        // Langer Druck auf die Menütaste öffnet die KAJO-Einstellungen.
        if (key == WatchUi.KEY_MENU) {
            mView.scrollPlan(1);
            return true;
        }
        if (key == WatchUi.KEY_ACTION_MENU) {
            mView.openSettings();
            return true;
        }

        // Die Venu 3S hat keine separaten Hoch-/Runter-Tasten.
        // Die untere Taste schaltet auf dem Startbildschirm die Auswahl weiter.
        if (key == WatchUi.KEY_ESC) {
            mView.scrollPlan(1);
            return true;
        }
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_PAGE) {
            mView.scrollPlan(-1);
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            mView.scrollPlan(1);
            return true;
        }
        return false;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }
}
