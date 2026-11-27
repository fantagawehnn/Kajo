import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsView extends WatchUi.Menu2 {

    var mCounts as Lang.Array<Lang.Number> = [2, 4];

    function initialize() {
        Menu2.initialize({:title => "TRAININGSFELDER", :footer => "ANZAHL UND BELEGUNG"});
        var saved = Storage.getValue("kajoTrainingFieldCount");
        var selectedCount = saved == null ? 4 : saved as Lang.Number;

        for (var i = 0; i < mCounts.size(); i += 1) {
            var count = mCounts[i];
            var subLabel = count == selectedCount ? "Aktuell ausgewählt" : "Ansicht verwenden";
            addItem(new WatchUi.MenuItem(count.toString() + " Felder", subLabel, "count_" + count.toString(), {}));
        }

        addItem(new WatchUi.MenuItem("Feld 1 konfigurieren", "Messwert auswählen", "slot_0", {}));
        addItem(new WatchUi.MenuItem("Feld 2 konfigurieren", "Messwert auswählen", "slot_1", {}));
        if (selectedCount == 4) {
            addItem(new WatchUi.MenuItem("Feld 3 konfigurieren", "Messwert auswählen", "slot_2", {}));
            addItem(new WatchUi.MenuItem("Feld 4 konfigurieren", "Messwert auswählen", "slot_3", {}));
        }
    }

    function selectItem(identifier as Lang.String) as Void {
        if (identifier == "count_2") {
            Storage.setValue("kajoTrainingFieldCount", 2);
            WatchUi.showToast("2-Felder-Ansicht aktiviert", null);
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (identifier == "count_4") {
            Storage.setValue("kajoTrainingFieldCount", 4);
            WatchUi.showToast("4-Felder-Ansicht aktiviert", null);
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        var slot = -1;
        if (identifier == "slot_0") { slot = 0; }
        else if (identifier == "slot_1") { slot = 1; }
        else if (identifier == "slot_2") { slot = 2; }
        else if (identifier == "slot_3") { slot = 3; }
        if (slot >= 0) {
            var countValue = Storage.getValue("kajoTrainingFieldCount");
            var count = countValue == null ? 4 : countValue as Lang.Number;
            if (slot >= count) { return; }
            var picker = new KajoConnectLiveMetricPickerView(count, slot);
            WatchUi.pushView(picker, new KajoConnectLiveMetricPickerDelegate(picker), WatchUi.SLIDE_UP);
        }
    }
}

class KajoConnectLiveMetricPickerView extends WatchUi.Menu2 {

    var mCount as Lang.Number;
    var mSlot as Lang.Number;

    var mMetricIds as Lang.Array<Lang.String> = [
        "cadence", "heartRate", "heartRateZone", "distance", "intervalDistance",
        "pace", "speedNow", "speedAvg", "speedMax", "heartRateAvg", "heartRateMax",
        "elapsed", "calories", "power", "altitude", "ascent", "descent", "trainingEffect"
    ];

    var mMetricLabels as Lang.Array<Lang.String> = [
        "Kadenz", "Herzfrequenz", "HF-Zone", "Gesamtdistanz", "Intervall-Distanz",
        "Pace", "Geschwindigkeit aktuell", "Geschwindigkeit Ø", "Geschwindigkeit max.",
        "Herzfrequenz Ø", "Herzfrequenz max.", "Trainingszeit", "Kalorien", "Leistung",
        "Höhe", "Anstieg", "Abstieg", "Training Effect"
    ];

    function initialize(count as Lang.Number, slot as Lang.Number) {
        Menu2.initialize({:title => "FELD " + (slot + 1).toString(), :footer => "MESSWERT AUSWÄHLEN"});
        mCount = count;
        mSlot = slot;
        var key = "kajoLiveMetric" + count.toString() + "_" + slot.toString();
        var saved = Storage.getValue(key);
        var current = saved == null ? defaultMetric(count, slot) : saved.toString();

        for (var i = 0; i < mMetricIds.size(); i += 1) {
            var subLabel = mMetricIds[i] == current ? "Aktuell ausgewählt" : "";
            addItem(new WatchUi.MenuItem(mMetricLabels[i], subLabel, mMetricIds[i], {}));
        }
    }

    function defaultMetric(count as Lang.Number, slot as Lang.Number) as Lang.String {
        if (count == 2) {
            return slot == 0 ? "cadence" : "heartRate";
        }
        if (slot == 0) { return "cadence"; }
        if (slot == 1) { return "distance"; }
        if (slot == 2) { return "pace"; }
        return "heartRate";
    }

    function selectMetric(metricId as Lang.String) as Void {
        if (mMetricIds.indexOf(metricId) < 0) { return; }
        var key = "kajoLiveMetric" + mCount.toString() + "_" + mSlot.toString();
        Storage.setValue(key, metricId);
        WatchUi.showToast("Datenfeld gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
