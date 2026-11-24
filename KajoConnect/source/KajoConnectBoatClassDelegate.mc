import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectBoatClassDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectBoatClassView;

    function initialize(view as KajoConnectBoatClassView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.selectItem(item.getId().toString());
    }
}
