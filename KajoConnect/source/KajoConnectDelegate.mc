import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.BehaviorDelegate {

    var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.activateHomeSelection();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            mView.openSettings();
            return true;
        }
        return false;
    }

    function onTap(clickEvent) {

        var coordinates = clickEvent.getCoordinates();

        var x = coordinates[0];
        var y = coordinates[1];

        mView.handleTap(x, y);

        return true;
    }

    function onNextPage() {
        mView.scrollPlan(1);
        return true;
    }

    function onPreviousPage() {
        mView.scrollPlan(-1);
        return true;
    }

    function onMenu() {

        var menuView = new KajoConnectMenuView(mView);
        WatchUi.pushView(
            menuView,
            new KajoConnectMenuViewDelegate(menuView),
            WatchUi.SLIDE_UP
        );

        return true;
    }
}