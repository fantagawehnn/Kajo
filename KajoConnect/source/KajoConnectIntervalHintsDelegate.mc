import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectIntervalHintsDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectIntervalHintsView;

    function initialize(view as KajoConnectIntervalHintsView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var checkbox = item as WatchUi.CheckboxMenuItem;
        mView.persistOption(item.getId().toString(), checkbox.isChecked());
    }
}
