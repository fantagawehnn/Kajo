import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectHistoryView extends WatchUi.Menu2 {

    var mEntries as Lang.Array<Lang.Dictionary> = [];
    var mEntryIds as Lang.Array<Lang.String> = [];

    function initialize() {
        Menu2.initialize({:title => "AKTIVITÄTEN", :footer => "KAJO · LETZTE EINHEITEN"});
        var stored = Storage.getValue("kajoActivityHistory");
        if (stored != null) { mEntries = stored as Lang.Array<Lang.Dictionary>; }

        if (mEntries.size() == 0) {
            addItem(new WatchUi.MenuItem("Noch keine Trainings", "Abgeschlossene Einheiten erscheinen hier", "empty", {}));
            return;
        }

        for (var i = 0; i < mEntries.size(); i += 1) {
            var entry = mEntries[i] as Lang.Dictionary;
            var date = entry["date"] == null ? "Datum unbekannt" : entry["date"].toString();
            var boat = entry["boatClass"] == null ? "KANU" : entry["boatClass"].toString();
            var name = entry["name"] == null ? "" : entry["name"].toString();
            var duration = entry["duration"] == null ? "" : entry["duration"].toString();
            var distance = entry["distance"] == null || entry["distance"].toString() == "--"
                ? "" : entry["distance"].toString() + " km";
            var hr = entry["averageHeartRate"] == null || entry["averageHeartRate"].toString() == "--"
                ? "" : "Ø " + entry["averageHeartRate"].toString() + " bpm";

            var title = date + " · " + boat;
            if (name != "" && name != "FREIE AKTIVITAET" && name != "FREIES TRAINING") {
                title += " · " + name;
            }

            var subLabel = duration == "" ? "Dauer nicht verfügbar" : duration;
            if (distance != "") { subLabel += " · " + distance; }
            if (hr != "") { subLabel += " · " + hr; }

            var id = "history_" + i.toString();
            mEntryIds.add(id);
            addItem(new WatchUi.MenuItem(title, subLabel, id, {}));
        }
    }

    function showEntry(identifier as Lang.String) as Void {
        var index = mEntryIds.indexOf(identifier);
        if (index < 0 || index >= mEntries.size()) { return; }
        var entry = mEntries[index] as Lang.Dictionary;
        var detailView = new KajoConnectActivityDetailView(entry);
        WatchUi.pushView(
            detailView,
            new KajoConnectActivityDetailDelegate(),
            WatchUi.SLIDE_UP
        );
    }
}
