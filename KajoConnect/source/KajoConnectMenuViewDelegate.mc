import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectMenuViewDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectMenuView;

    function initialize(view as KajoConnectMenuView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[1]);
        return true;
    }
}
