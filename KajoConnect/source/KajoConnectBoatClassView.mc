import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectBoatClassView extends WatchUi.Menu2 {

    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        Menu2.initialize({:title => "BOOTSKLASSE", :footer => "KAJO · TRAININGSKLASSE"});
        mHomeView = homeView;

        var saved = Storage.getValue("kajoSelectedBoat");
        var selected = saved == null ? "K1" : saved.toString();
        addItem(new WatchUi.MenuItem("K1 · Kajak", selected == "K1" ? "Aktuell ausgewählt" : "Kajak", "K1", {}));
        addItem(new WatchUi.MenuItem("C1 · Canadier", selected == "C1" ? "Aktuell ausgewählt" : "Canadier Einer", "C1", {}));
        addItem(new WatchUi.MenuItem("C2 · Canadier", selected == "C2" ? "Aktuell ausgewählt" : "Canadier Zweier", "C2", {}));
    }

    function selectItem(boatClass as Lang.String) as Void {
        if (boatClass != "K1" && boatClass != "C1" && boatClass != "C2") { return; }
        mHomeView.setBoatClass(boatClass);
        WatchUi.showToast("Bootsklasse " + boatClass + " gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
