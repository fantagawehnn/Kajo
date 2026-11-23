import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutListDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectWorkoutListView;

    function initialize(view as KajoConnectWorkoutListView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
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
