import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectMenuDelegate extends WatchUi.Menu2InputDelegate {

    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        Menu2InputDelegate.initialize();
        mHomeView = homeView;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        mHomeView.openSettingsItem(item.getId().toString());
    }
}
