import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDisplayConfigDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectDisplayConfigView;

    function initialize(view as KajoConnectDisplayConfigView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var checkbox = item as WatchUi.CheckboxMenuItem;
        mView.persistToggle(item.getId().toString(), checkbox.isChecked());
    }
}
