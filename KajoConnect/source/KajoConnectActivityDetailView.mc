import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectActivityDetailView extends WatchUi.View {
    var mEntry as Lang.Dictionary;
    var mActivityLayout as KajoLayout;

    function initialize(entry as Lang.Dictionary) {
        View.initialize();
        mEntry = entry;
        mActivityLayout = new KajoLayout();
    }

    function valueFor(key as Lang.String, fallback as Lang.String) as Lang.String {
        var value = mEntry[key];
        return value == null || value.toString() == "" ? fallback : value.toString();
    }

    function drawRow(dc as Dc, cx as Lang.Number, y as Lang.Number,
        label as Lang.String, value as Lang.String, width as Lang.Number) as Void {
        mActivityLayout.drawTextBox(dc, cx, y, width, 18, label, Graphics.FONT_XTINY, 0x98A5AB);
        mActivityLayout.drawTextBox(dc, cx, y + 17, width, 30, value, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
    }

    function onUpdate(dc as Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        var cx = width / 2;
        var contentWidth = (unit * 0.82).toNumber();
        mActivityLayout.configure(width, height);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        mActivityLayout.drawTextBox(dc, cx, 20, contentWidth, 26, "AKTIVITÄT",
            Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        mActivityLayout.drawTextBox(dc, cx, 49, contentWidth, 18,
            valueFor("date", "DATUM UNBEKANNT") + " · " + valueFor("boatClass", "KANU"),
            Graphics.FONT_XTINY, 0x25D3CB);
        dc.setColor(0x344047, Graphics.COLOR_BLACK);
        dc.drawLine(cx - (unit * 0.39), 76, cx + (unit * 0.39), 76);

        var workoutName = valueFor("name", "FREIES TRAINING");
        if (workoutName == "FREIE AKTIVITAET" || workoutName == "FREIES TRAINING") {
            workoutName = "Freies Training";
        }
        mActivityLayout.drawTextBox(dc, cx, 87, contentWidth, 28, workoutName,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawRow(dc, cx, 130, "DAUER", valueFor("duration", "--"), contentWidth);
        var distance = valueFor("distance", "--");
        if (distance != "--") { distance += " km"; }
        drawRow(dc, cx, 184, "DISTANZ", distance, contentWidth);
        var heartRate = valueFor("averageHeartRate", "--");
        if (heartRate != "--") { heartRate += " bpm"; }
        drawRow(dc, cx, 238, "Ø HERZFREQUENZ", heartRate, contentWidth);

        dc.setColor(0x344047, Graphics.COLOR_BLACK);
        dc.drawLine(cx - (unit * 0.39), 300, cx + (unit * 0.39), 300);
        mActivityLayout.drawTextBox(dc, cx, 312, contentWidth, 22,
            "UNTEN · ZURÜCK", Graphics.FONT_XTINY, 0x25D3CB);
    }
}