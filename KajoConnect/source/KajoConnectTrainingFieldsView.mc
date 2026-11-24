import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectTrainingFieldsView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mFieldCount as Lang.Number = 4;
    var mValues as Lang.Array<Lang.Boolean> = [true, true, true, true, true];
    var mLabels as Lang.Array<Lang.String> = [
        "INTERVALL-STATUS",
        "PULS + ZONE",
        "SCHLAGFREQUENZ",
        "DISTANZ",
        "PACE"
    ];
    var mCounts as Lang.Array<Lang.Number> = [1, 2, 4, 6];
    var mRowTop as Lang.Number = 126;
    var mRowStep as Lang.Number = 42;
    var mUnit as Lang.Number = 390;
    var mWidth as Lang.Number = 390;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        var savedCount = Storage.getValue("kajoTrainingFieldCount");
        if (savedCount != null &&
            (savedCount == 1 || savedCount == 2 || savedCount == 4 || savedCount == 6)) {
            mFieldCount = savedCount as Lang.Number;
        }
        var keys = [
            "kajoTrainingShowStatus",
            "kajoTrainingShowHR",
            "kajoTrainingShowCadence",
            "kajoTrainingShowDistance",
            "kajoTrainingShowPace"
        ];
        for (var i = 0; i < keys.size(); i += 1) {
            var saved = Storage.getValue(keys[i]);
            if (saved != null) { mValues[i] = saved as Lang.Boolean; }
        }
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y >= 65 && y <= 112) {
            var index = Math.floor((x - 40) / 78).toNumber();
            if (index >= 0 && index < mCounts.size()) {
                mFieldCount = mCounts[index];
                WatchUi.requestUpdate();
            }
            return;
        }
        var row = Math.floor((y - mRowTop) / mRowStep).toNumber();
        if (row >= 0 && row < mValues.size()) {
            mValues[row] = !mValues[row];
            WatchUi.requestUpdate();
        }
    }

    function saveConfig() as Void {
        Storage.setValue("kajoTrainingFieldCount", mFieldCount);
        Storage.setValue("kajoTrainingShowStatus", mValues[0]);
        Storage.setValue("kajoTrainingShowHR", mValues[1]);
        Storage.setValue("kajoTrainingShowCadence", mValues[2]);
        Storage.setValue("kajoTrainingShowDistance", mValues[3]);
        Storage.setValue("kajoTrainingShowPace", mValues[4]);
        WatchUi.showToast("Trainingsfelder gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, font, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, font, color);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mUnit = mWidth < dc.getHeight() ? mWidth : dc.getHeight();
        mKajoLayout.configure(dc.getWidth(), dc.getHeight());
        var cx = mWidth / 2;

        drawFit(dc, cx, mUnit * 0.065, "TRAININGSFELDER",
            mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.15, "ANZAHL SICHTBARER FELDER",
            mUnit * 0.78, Graphics.FONT_XTINY, 0x98A5AB);

        var optionWidth = mUnit * 0.17;
        for (var i = 0; i < mCounts.size(); i += 1) {
            var x = 40 + (i * 78);
            var selected = mFieldCount == mCounts[i];
            dc.setColor(selected ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(x, mUnit * 0.205, optionWidth, 34);
            dc.setColor(selected ? 0x25D3CB : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(x, mUnit * 0.205, 3, 34);
            drawFit(dc, x + optionWidth / 2, mUnit * 0.225,
                mCounts[i].toString(), optionWidth * 0.8,
                Graphics.FONT_MEDIUM, selected ? 0x25D3CB : Graphics.COLOR_WHITE);
        }

        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.31, 328, mUnit * 0.31);
        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, 34, mUnit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var row = 0; row < mValues.size(); row += 1) {
            var y = mRowTop + (row * mRowStep);
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 34);
            dc.setColor(mValues[row] ? 0x25D3CB : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 34);
            drawFit(dc, cx - rowWidth * 0.10, y + 10, mLabels[row],
                rowWidth * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            drawFit(dc, cx + rowWidth * 0.37, y + 10,
                mValues[row] ? "AN" : "AUS", rowWidth * 0.18,
                Graphics.FONT_XTINY, mValues[row] ? 0x25D3CB : 0x98A5AB);
            if (row < mValues.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + 38, (left + rowWidth).toNumber(), y + 38);
            }
        }

        drawFit(dc, cx, mUnit * 0.865, "OBERE TASTE · SPEICHERN",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx, mUnit * 0.92, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
    }
}