import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectView;

    function initialize(view as KajoConnectView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        // TEMPORARY INPUT DIAGNOSTIC: visible on simulator and device.
        System.println("KAJO_HOME_KEY: " + key.toString());
        WatchUi.showToast("KAJO KEY " + key.toString(), null);

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.activateHomeSelection();
            return true;
        }
        if (key == WatchUi.KEY_MENU) {
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

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            mView.scrollPlan(1);
            return true;
        }
        if (direction == WatchUi.SWIPE_DOWN) {
            mView.scrollPlan(-1);
            return true;
        }
        return false;
    }
}
