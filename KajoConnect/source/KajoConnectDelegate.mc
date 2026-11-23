import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDelegate extends WatchUi.BehaviorDelegate {

    var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent) {

        var coordinates = clickEvent.getCoordinates();

        var x = coordinates[0];
        var y = coordinates[1];

        mView.handleTap(x, y);

        return true;
    }

    function onNextPage() {
        mView.scrollPlan(1);
        return true;
    }

    function onPreviousPage() {
        mView.scrollPlan(-1);
        return true;
    }

    function onMenu() {

        WatchUi.pushView(
            new Rez.Menus.MainMenu(),
            new KajoConnectMenuDelegate(),
            WatchUi.SLIDE_UP
        );

        return true;
    }
}