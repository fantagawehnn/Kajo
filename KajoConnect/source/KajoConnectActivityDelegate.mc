import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectActivityDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectActivityView;

    function initialize(view as KajoConnectActivityView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent) {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    // Vertikales Wischen wechselt zwischen den Datenansichten.
    function onNextPage() {
        mView.nextDisplayPage(1);
        return true;
    }

    function onPreviousPage() {
        mView.nextDisplayPage(-1);
        return true;
    }
}