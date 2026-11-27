import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoRecorderApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        var view = new KajoRecorderView();
        return [view, new KajoRecorderDelegate(view)];
    }
}
