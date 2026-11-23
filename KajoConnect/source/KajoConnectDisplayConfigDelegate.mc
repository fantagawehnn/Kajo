import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDisplayConfigDelegate extends WatchUi.BehaviorDelegate {

    var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent) {
        var coordinates = clickEvent.getCoordinates();
        mView.toggleAt(coordinates[1]);
        return true;
    }
}