import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsView extends WatchUi.Menu2 {

    var mCounts as Lang.Array<Lang.Number> = [1, 2, 4, 6];

    function initialize() {
        Menu2.initialize({:title => "TRAININGSFELDER", :footer => "KAJO · ANZEIGE KONFIGURIEREN"});
        var saved = Storage.getValue("kajoTrainingFieldCount");
        var selectedCount = saved == null ? 4 : saved as Lang.Number;

        for (var i = 0; i < mCounts.size(); i += 1) {
            var count = mCounts[i];
            var subLabel = count == selectedCount ? "Aktuell ausgewählt" : "Anzahl sichtbarer Werte";
            addItem(new WatchUi.MenuItem(count.toString() + " Felder", subLabel, "count_" + count.toString(), {}));
        }
        addItem(new WatchUi.MenuItem("Messwerte auswählen", "Status, Puls, Frequenz, Distanz, Pace", "metrics", {}));
    }

    function selectItem(identifier as Lang.String) as Void {
        if (identifier == "metrics") {
            var menu = new KajoConnectTrainingMetricMenu();
            WatchUi.pushView(menu, new KajoConnectTrainingMetricDelegate(menu), WatchUi.SLIDE_UP);
            return;
        }
        if (identifier == "count_1") {
            Storage.setValue("kajoTrainingFieldCount", 1);
        } else if (identifier == "count_2") {
            Storage.setValue("kajoTrainingFieldCount", 2);
        } else if (identifier == "count_4") {
            Storage.setValue("kajoTrainingFieldCount", 4);
        } else if (identifier == "count_6") {
            Storage.setValue("kajoTrainingFieldCount", 6);
        } else {
            return;
        }
        WatchUi.showToast("Trainingsanzeige gespeichert", null);
    }
}

class KajoConnectTrainingMetricMenu extends WatchUi.CheckboxMenu {

    function initialize() {
        CheckboxMenu.initialize({:title => "MESSWERTE", :footer => "KAJO · SOFORT GESPEICHERT"});
        addItem(new WatchUi.CheckboxMenuItem("Intervallstatus", "Aktuelle Trainingsphase", "status", readFlag("kajoTrainingShowStatus", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Puls + Zone", "Herzfrequenz und Zone", "hr", readFlag("kajoTrainingShowHR", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Schlagfrequenz", "Schläge pro Minute", "cadence", readFlag("kajoTrainingShowCadence", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Distanz", "Zurückgelegte Strecke", "distance", readFlag("kajoTrainingShowDistance", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Pace", "Zeit pro Kilometer", "pace", readFlag("kajoTrainingShowPace", true), {}));
    }

    function readFlag(key as Lang.String, fallback as Lang.Boolean) as Lang.Boolean {
        var saved = Storage.getValue(key);
        return saved == null ? fallback : saved as Lang.Boolean;
    }

    function persistOption(identifier as Lang.String, enabled as Lang.Boolean) as Void {
        if (identifier == "status") {
            Storage.setValue("kajoTrainingShowStatus", enabled);
        } else if (identifier == "hr") {
            Storage.setValue("kajoTrainingShowHR", enabled);
        } else if (identifier == "cadence") {
            Storage.setValue("kajoTrainingShowCadence", enabled);
        } else if (identifier == "distance") {
            Storage.setValue("kajoTrainingShowDistance", enabled);
        } else if (identifier == "pace") {
            Storage.setValue("kajoTrainingShowPace", enabled);
        }
    }
}
