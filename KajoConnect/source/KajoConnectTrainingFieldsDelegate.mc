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

    var mView;

    function initialize(view) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var checkbox = item as WatchUi.CheckboxMenuItem;
        mView.persistOption(item.getId().toString(), checkbox.isChecked());
    }
}


class KajoConnectLiveMetricPickerDelegate extends WatchUi.Menu2InputDelegate {

    var mView as KajoConnectLiveMetricPickerView;

    function initialize(view as KajoConnectLiveMetricPickerView) {
        Menu2InputDelegate.initialize();
        mView = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mView.selectMetric(item.getId().toString());
    }
}
