import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectIntervalHintsDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectIntervalHintsView;

    function initialize(view as KajoConnectIntervalHintsView) {
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
        mView.toggleAt(coordinates[1]);
        return true;
    }
}