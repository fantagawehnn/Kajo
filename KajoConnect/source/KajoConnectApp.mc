import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {

        var view = new KajoConnectView();

        return [view, new KajoConnectDelegate(view)];
    }
}

function getApp() as KajoConnectApp {
    return Application.getApp() as KajoConnectApp;
}