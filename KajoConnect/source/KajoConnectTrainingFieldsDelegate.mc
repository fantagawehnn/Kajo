import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectTrainingFieldsView;

    function initialize(view as KajoConnectTrainingFieldsView) {
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

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }
}