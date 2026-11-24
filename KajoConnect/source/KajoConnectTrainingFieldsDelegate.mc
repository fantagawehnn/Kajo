import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectTrainingFieldsView;

    function initialize(view as KajoConnectTrainingFieldsView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.selectItem(item.getId().toString());
    }
}

class KajoConnectTrainingMetricDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectTrainingMetricMenu;

    function initialize(view as KajoConnectTrainingMetricMenu) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var checkbox = item as WatchUi.CheckboxMenuItem;
        mView.persistOption(item.getId().toString(), checkbox.isChecked());
    }
}
