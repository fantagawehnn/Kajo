import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectHistoryDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectHistoryView;

    function initialize(view as KajoConnectHistoryView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.showEntry(item.getId().toString());
    }
}
