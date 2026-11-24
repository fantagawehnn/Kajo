import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectDisplayConfigView extends WatchUi.CheckboxMenu {

    function initialize() {
        CheckboxMenu.initialize({:title => "DATENSEITEN", :footer => "MINDESTENS EINE SEITE AKTIV"});
        var labels = ["Übersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        for (var i = 0; i < labels.size(); i += 1) {
            var key = "kajoDisplayPage" + i.toString();
            var saved = Storage.getValue(key);
            var enabled = saved == null ? true : saved as Lang.Boolean;
            addItem(new WatchUi.CheckboxMenuItem(labels[i], enabled ? "Aktiv" : "Deaktiviert", "page_" + i.toString(), enabled, {}));
        }
    }

    function persistToggle(identifier as Lang.String, enabled as Lang.Boolean) as Void {
        var activeCount = 0;
        for (var i = 0; i < 5; i += 1) {
            var item = getItem(i) as WatchUi.CheckboxMenuItem;
            if (item.isChecked()) { activeCount += 1; }
        }

        if (activeCount == 0) {
            var index = findItemById(identifier);
            if (index >= 0) {
                var selected = getItem(index) as WatchUi.CheckboxMenuItem;
                selected.setChecked(true);
            }
            WatchUi.showToast("Mindestens eine Datenseite muss aktiv bleiben", null);
            return;
        }

        for (var i = 0; i < 5; i += 1) {
            var item = getItem(i) as WatchUi.CheckboxMenuItem;
            Storage.setValue("kajoDisplayPage" + i.toString(), item.isChecked());
        }
    }
}
