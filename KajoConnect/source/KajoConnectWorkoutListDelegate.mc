import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutListDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectWorkoutListView;

    function initialize(view as KajoConnectWorkoutListView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.selectItem(item.getId().toString());
    }
}
