import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectBoatClassDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectBoatClassView;

    function initialize(view as KajoConnectBoatClassView) {
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

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.selectAt(coordinates[1]);
        return true;
    }
}