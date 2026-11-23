import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectMenuDelegate extends WatchUi.MenuInputDelegate {

    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        MenuInputDelegate.initialize();
        mHomeView = homeView;
    }

    function onMenuItem(item as Symbol) as Void {
        if (item == :item_1) {
            var view = new KajoConnectDisplayConfigView();
            WatchUi.pushView(view, new KajoConnectDisplayConfigDelegate(view), WatchUi.SLIDE_UP);
        } else if (item == :item_2) {
            var view = new KajoConnectWorkoutListView(mHomeView);
            WatchUi.pushView(view, new KajoConnectWorkoutListDelegate(view), WatchUi.SLIDE_UP);
        } else if (item == :item_3) {
            var view = new KajoConnectPairingView();
            WatchUi.pushView(view, new KajoConnectPairingDelegate(), WatchUi.SLIDE_UP);
        } else if (item == :item_4) {
            var view = new KajoConnectCustomFieldsView();
            WatchUi.pushView(view, new KajoConnectCustomFieldsDelegate(view), WatchUi.SLIDE_UP);
        }
    }
}