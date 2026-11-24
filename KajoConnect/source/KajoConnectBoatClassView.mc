import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectBoatClassView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mHomeView as KajoConnectView;
    var mSelectedBoat as Lang.String = "K1";
    var mOptions as Lang.Array<Lang.String> = ["K1", "C1", "C2"];
    var mRowTop as Lang.Number = 104;
    var mRowStep as Lang.Number = 65;
    var mUnit as Lang.Number = 390;

    function initialize(homeView as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mHomeView = homeView;
        var saved = Storage.getValue("kajoSelectedBoat");
        if (saved != null &&
            (saved.toString() == "K1" || saved.toString() == "C1" || saved.toString() == "C2")) {
            mSelectedBoat = saved.toString();
        }
    }

    function moveSelection(direction as Lang.Number) as Void {
        var index = 0;
        for (var i = 0; i < mOptions.size(); i += 1) {
            if (mOptions[i] == mSelectedBoat) { index = i; }
        }
        index += direction;
        if (index < 0) { index = mOptions.size() - 1; }
        if (index >= mOptions.size()) { index = 0; }
        mSelectedBoat = mOptions[index];
        WatchUi.requestUpdate();
    }

    function selectAt(y as Lang.Number) as Void {
        var row = Math.floor((y - mRowTop) / mRowStep).toNumber();
        if (row >= 0 && row < mOptions.size()) {
            mSelectedBoat = mOptions[row];
            WatchUi.requestUpdate();
        }
    }

    function saveConfig() as Void {
        mHomeView.setBoatClass(mSelectedBoat);
        WatchUi.showToast("Bootsklasse " + mSelectedBoat + " gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, width, font, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, width, font, color);
    }

    function onUpdate(dc as Dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        mUnit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var cx = width / 2;
        drawFit(dc, cx, mUnit * 0.075, "BOOTSKLASSE",
            mUnit * 0.75, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.15, "AKTUELLE TRAININGSKLASSE",
            mUnit * 0.78, Graphics.FONT_XTINY, 0x98A5AB);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.20, 328, mUnit * 0.20);

        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, 54, mUnit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var i = 0; i < mOptions.size(); i += 1) {
            var y = mRowTop + (i * mRowStep);
            var selected = mOptions[i] == mSelectedBoat;
            dc.setColor(selected ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 54);
            dc.setColor(selected ? 0x25D3CB : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 54);
            drawFit(dc, cx, y + 14, mOptions[i],
                rowWidth * 0.70, Graphics.FONT_NUMBER_MEDIUM,
                selected ? 0x25D3CB : Graphics.COLOR_WHITE);
            if (selected) {
                drawFit(dc, cx + rowWidth * 0.32, y + 20, "✓",
                    rowWidth * 0.12, Graphics.FONT_SMALL, 0x25D3CB);
            }
        }
        drawFit(dc, cx, mUnit * 0.79, "OBERE TASTE · SPEICHERN",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx, mUnit * 0.86, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
    }
}