import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutSelectDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectWorkoutSelectView;

    function initialize(view as KajoConnectWorkoutSelectView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.selectItem(item.getId().toString());
    }
}
