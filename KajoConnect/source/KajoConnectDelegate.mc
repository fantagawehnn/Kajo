import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectView;

    function initialize(view as KajoConnectView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.activateHomeSelection();
            return true;
        }
        // ESC is the native Back action on the Venu 3S. At the root page
        // it is deliberately not repurposed as a settings shortcut.
        return false;
    }

    function onMenu() as Lang.Boolean {
        mView.openSettings();
        return true;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
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
}
