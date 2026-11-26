import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsView extends WatchUi.Menu2 {

    var mCounts as Lang.Array<Lang.Number> = [2, 4];

    function initialize() {
        Menu2.initialize({:title => "TRAININGSFELDER", :footer => "KAJO · ANZEIGE KONFIGURIEREN"});
        var saved = Storage.getValue("kajoTrainingFieldCount");
        var selectedCount = saved == null ? 4 : saved as Lang.Number;

        for (var i = 0; i < mCounts.size(); i += 1) {
            var count = mCounts[i];
            var subLabel = count == selectedCount ? "Aktuell ausgewählt" : "Anzahl sichtbarer Werte";
            addItem(new WatchUi.MenuItem(count.toString() + " Felder", subLabel, "count_" + count.toString(), {}));
        }
    }

    function selectItem(identifier as Lang.String) as Void {
        if (identifier == "count_2") {
            Storage.setValue("kajoTrainingFieldCount", 2);
        } else if (identifier == "count_4") {
            Storage.setValue("kajoTrainingFieldCount", 4);
        } else {
            return;
        }
        WatchUi.showToast("Trainingsanzeige gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
