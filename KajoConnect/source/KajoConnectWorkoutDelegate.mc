import Toybox.WatchUi;

class KajoConnectWorkoutDelegate extends WatchUi.BehaviorDelegate {

    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onTap(clickEvent) {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        return true;
    }
}