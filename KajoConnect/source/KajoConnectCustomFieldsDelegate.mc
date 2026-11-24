import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectCustomFieldsDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectCustomFieldsView;

    function initialize(view as KajoConnectCustomFieldsView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.saveConfig();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        return false;
    }

    function onMenu() as Lang.Boolean {
        mView.moveFocus(1);
        return true;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        if (coordinates[1] >= 344) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    function onNextPage() as Lang.Boolean {
        mView.nextPage(1);
        return true;
    }

    function onPreviousPage() as Lang.Boolean {
        mView.nextPage(-1);
        return true;
    }
}
