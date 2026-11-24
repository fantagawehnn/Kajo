import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutListDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectWorkoutListView;

    function initialize(view as KajoConnectWorkoutListView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.selectCurrent();
            return true;
        }
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_MENU) {
            mView.moveSelection(-1);
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            mView.moveSelection(1);
            return true;
        }

        // ESC bleibt die native Zurück-Funktion.
        return false;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            mView.moveSelection(1);
            return true;
        }
        if (direction == WatchUi.SWIPE_DOWN) {
            mView.moveSelection(-1);
            return true;
        }
        return false;
    }
}
