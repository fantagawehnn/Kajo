import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectIntervalHintsView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mValues as Lang.Array<Lang.Boolean> = [true, true, true, false];
    var mSelectedRow as Lang.Number = 0;
    var mLabels as Lang.Array<Lang.String> = [
        "ZIEL ANZEIGEN",
        "NÄCHSTES INTERVALL",
        "VIBRATION BEI WECHSEL",
        "TON BEI WECHSEL"
    ];
    var mRowTop as Lang.Number = 88;
    var mRowHeight as Lang.Number = 56;
    var mUnit as Lang.Number = 390;
    var mWidth as Lang.Number = 390;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        var keys = [
            "kajoIntervalShowTarget",
            "kajoIntervalShowNext",
            "kajoIntervalVibration",
            "kajoIntervalTone"
        ];
        for (var i = 0; i < keys.size(); i += 1) {
            var saved = Storage.getValue(keys[i]);
            if (saved != null) { mValues[i] = saved as Lang.Boolean; }
        }
    }

    function moveSelection(direction as Lang.Number) as Void {
        mSelectedRow += direction;
        if (mSelectedRow < 0) { mSelectedRow = mValues.size() - 1; }
        if (mSelectedRow >= mValues.size()) { mSelectedRow = 0; }
        WatchUi.requestUpdate();
    }

    function persistValues() as Void {
        Storage.setValue("kajoIntervalShowTarget", mValues[0]);
        Storage.setValue("kajoIntervalShowNext", mValues[1]);
        Storage.setValue("kajoIntervalVibration", mValues[2]);
        Storage.setValue("kajoIntervalTone", mValues[3]);
    }

    function toggleSelected() as Void {
        mValues[mSelectedRow] = !mValues[mSelectedRow];
        persistValues();
        WatchUi.requestUpdate();
    }

    function toggleAt(y as Lang.Number) as Void {
        var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
        if (row >= 0 && row < mValues.size()) {
            mSelectedRow = row;
            toggleSelected();
        }
    }

    function saveConfig() as Void {
        persistValues();
        WatchUi.showToast("Intervall-Hinweise gespeichert", null);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, font, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, font, color);
    }

    function onUpdate(dc as Dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        mWidth = dc.getWidth();
        mUnit = mWidth < dc.getHeight() ? mWidth : dc.getHeight();
        mKajoLayout.configure(dc.getWidth(), dc.getHeight());
        var cx = mWidth / 2;
        drawFit(dc, cx, mUnit * 0.075, "INTERVALL-HINWEISE",
            mUnit * 0.80, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.16, 328, mUnit * 0.16);

        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, 46, mUnit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var i = 0; i < mValues.size(); i += 1) {
            var y = mRowTop + (i * mRowHeight);
            var focused = i == mSelectedRow;
            dc.setColor(focused ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 46);
            dc.setColor(focused ? 0xFFB020 : (mValues[i] ? 0x25D3CB : 0x344047), Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 46);
            drawFit(dc, cx - rowWidth * 0.10, y + 14, mLabels[i],
                rowWidth * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            drawFit(dc, cx + rowWidth * 0.37, y + 14,
                mValues[i] ? "AN" : "AUS", rowWidth * 0.18,
                Graphics.FONT_XTINY, mValues[i] ? 0x25D3CB : 0x98A5AB);
            if (i < mValues.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + 50, (left + rowWidth).toNumber(), y + 50);
            }
        }
        drawFit(dc, cx, mUnit * 0.79, "OBERE TASTE · ÄNDERN",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx, mUnit * 0.86, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
    }
}