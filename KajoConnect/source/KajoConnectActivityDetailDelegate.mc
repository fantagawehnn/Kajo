import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectActivityDetailDelegate extends WatchUi.InputDelegate {
    function initialize() { InputDelegate.initialize(); }
    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        return false;
    }
}