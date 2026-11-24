import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutListDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectWorkoutListView;

    function initialize(view as KajoConnectWorkoutListView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            // Obere Taste öffnet den ersten sichtbaren Eintrag der aktuellen Seite.
            mView.handleTap(100, 100);
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