import Toybox.Lang;
import Toybox.WatchUi;

class KajoRecorderDelegate extends WatchUi.InputDelegate {

    var mView as KajoRecorderView;

    function initialize(view as KajoRecorderView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            return mView.startActivity();
        }
        return false;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }
}
