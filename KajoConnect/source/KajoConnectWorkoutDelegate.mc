import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectWorkoutView;

    function initialize(view as KajoConnectWorkoutView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.startSelectedWorkout();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        if (key == WatchUi.KEY_MENU || key == WatchUi.KEY_ACTION_MENU) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        return false;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        if (coordinates[1] >= 355) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }
}
