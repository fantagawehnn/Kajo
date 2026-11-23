import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectWorkoutView;

    function initialize(view as KajoConnectWorkoutView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }
}