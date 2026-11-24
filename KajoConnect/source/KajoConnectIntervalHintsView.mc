import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectIntervalHintsView extends WatchUi.CheckboxMenu {

    function initialize() {
        CheckboxMenu.initialize({:title => "INTERVALL-HINWEISE", :footer => "KAJO · SOFORT GESPEICHERT"});
        addItem(new WatchUi.CheckboxMenuItem("Ziel anzeigen", "Sollwert der aktuellen Phase", "target", readFlag("kajoIntervalShowTarget", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Nächstes Intervall", "Kommende Phase anzeigen", "next", readFlag("kajoIntervalShowNext", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Vibration", "Signal beim Phasenwechsel", "vibration", readFlag("kajoIntervalVibration", true), {}));
        addItem(new WatchUi.CheckboxMenuItem("Signalton", "Akustisches Signal beim Wechsel", "tone", readFlag("kajoIntervalTone", false), {}));
    }

    function readFlag(key as Lang.String, fallback as Lang.Boolean) as Lang.Boolean {
        var saved = Storage.getValue(key);
        return saved == null ? fallback : saved as Lang.Boolean;
    }

    function persistOption(identifier as Lang.String, enabled as Lang.Boolean) as Void {
        if (identifier == "target") {
            Storage.setValue("kajoIntervalShowTarget", enabled);
        } else if (identifier == "next") {
            Storage.setValue("kajoIntervalShowNext", enabled);
        } else if (identifier == "vibration") {
            Storage.setValue("kajoIntervalVibration", enabled);
        } else if (identifier == "tone") {
            Storage.setValue("kajoIntervalTone", enabled);
        }
    }
}
