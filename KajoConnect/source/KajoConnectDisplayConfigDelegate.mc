import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDisplayConfigDelegate extends WatchUi.BehaviorDelegate {

    var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.toggleSelected();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        return false;
    }

    function onMenu() as Lang.Boolean {
        mView.moveSelection(1);
        return true;
    }

    function onTap(clickEvent) {
        var coordinates = clickEvent.getCoordinates();
        mView.toggleAt(coordinates[1]);
        return true;
    }
}