import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutListView extends WatchUi.Menu2 {

    var mHomeView as KajoConnectView;
    var mSessions as Lang.Array<Lang.Dictionary> = [];
    var mSessionIds as Lang.Array<Lang.String> = [];

    function initialize(homeView as KajoConnectView) {
        Menu2.initialize({:title => "GESPEICHERTE TRAININGS", :footer => "KAJO · TRAININGSPLAN"});
        mHomeView = homeView;
        mSessions = homeView.getPlannedSessions();

        if (mSessions.size() == 0) {
            addItem(new WatchUi.MenuItem("Keine Trainings", "In KAJO sind keine Einheiten gespeichert", "empty", {}));
            return;
        }

        for (var i = 0; i < mSessions.size(); i += 1) {
            var session = mSessions[i] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();
            var date = session["date"] == null ? "" : session["date"].toString();
            var subLabel = type;
            if (duration != "") { subLabel += " · " + duration + " min"; }
            if (date != "") { subLabel += " · " + date; }
            var id = "saved_" + i.toString();
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
