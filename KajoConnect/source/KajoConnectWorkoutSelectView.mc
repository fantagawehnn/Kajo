import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutSelectView extends WatchUi.Menu2 {

    var mSessions as Lang.Array<Lang.Dictionary> = [];
    var mHomeView as KajoConnectView;
    var mSessionIds as Lang.Array<Lang.String> = [];

    function initialize(sessions as Lang.Array<Lang.Dictionary>, homeView as KajoConnectView) {
        Menu2.initialize({:title => "HEUTE · TRAINING WÄHLEN", :footer => "KAJO · TAGESPLAN"});
        mSessions = sessions;
        mHomeView = homeView;

        for (var i = 0; i < mSessions.size(); i += 1) {
            var session = mSessions[i] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();
            var subLabel = type + (duration == "" ? "" : " · " + duration + " min");
            var id = "today_" + i.toString();
            mSessionIds.add(id);
            addItem(new WatchUi.MenuItem(name, subLabel, id, {}));
        }
    }

    function selectItem(identifier as Lang.String) as Void {
        var index = mSessionIds.indexOf(identifier);
        if (index < 0 || index >= mSessions.size()) { return; }
        mHomeView.startActivityWithWorkout(mSessions[index] as Lang.Dictionary);
    }
}
