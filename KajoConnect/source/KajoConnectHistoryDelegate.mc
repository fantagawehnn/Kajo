import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectHistoryDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectHistoryView;

    function initialize(view as KajoConnectHistoryView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        if (keyEvent.getKey() == WatchUi.KEY_ESC) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        if (keyEvent.getKey() == WatchUi.KEY_ENTER || keyEvent.getKey() == WatchUi.KEY_START) {
            mView.showSelectedEntry();
            return true;
        }
        return false;
    }

    function onMenu() as Lang.Boolean {
        mView.moveSelection(1);
        return true;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.showEntryInfo(coordinates[1]);
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