import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectView;

    function initialize(view as KajoConnectView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    // Let the coordinate-aware tap handler decide which home item was touched.
    function onSelect() as Lang.Boolean {
        return false;
    }

    function onBack() as Lang.Boolean {
        mView.scrollPlan(1);
        return true;
    }

    function onMenu() as Lang.Boolean {
        mView.openSettings();
        return true;
    }

    function onNextPage() as Lang.Boolean {
        mView.scrollPlan(1);
        return true;
    }

    function onPreviousPage() as Lang.Boolean {
        mView.scrollPlan(-1);
        return true;
    }

    // Raw key fallback for simulators that emit key events instead of behaviors.
    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.activateHomeSelection();
            return true;
        }
        if (key == WatchUi.KEY_MENU || key == WatchUi.KEY_ACTION_MENU) {
            mView.openSettings();
            return true;
        }
        if (key == WatchUi.KEY_ESC || key == WatchUi.KEY_DOWN) {
            mView.scrollPlan(1);
            return true;
        }
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_PAGE) {
            mView.scrollPlan(-1);
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
