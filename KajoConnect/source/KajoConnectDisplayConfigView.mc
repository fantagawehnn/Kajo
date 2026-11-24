import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectDisplayConfigView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    var mEnabled as Lang.Array<Lang.Boolean> = [true, true, true, true, true];
    var mSelectedRow as Lang.Number = 0;
    var mRowTop = 0;
    var mRowHeight = 0;
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        for (var i = 0; i < 5; i += 1) {
            var key = "kajoDisplayPage" + i.toString();
            var savedValue = Storage.getValue(key);
            if (savedValue != null) { mEnabled[i] = savedValue as Lang.Boolean; }
        }
    }

    function moveSelection(direction as Lang.Number) as Void {
        mSelectedRow += direction;
        if (mSelectedRow < 0) { mSelectedRow = 4; }
        if (mSelectedRow > 4) { mSelectedRow = 0; }
        WatchUi.requestUpdate();
    }

    function persistConfig() as Void {
        for (var i = 0; i < 5; i += 1) {
            Storage.setValue("kajoDisplayPage" + i.toString(), mEnabled[i]);
        }
    }

    function toggleSelected() as Void {
        toggleRow(mSelectedRow);
    }

    function toggleRow(row as Lang.Number) as Void {
        if (row < 0 || row >= 5) { return; }
        mSelectedRow = row;
        mEnabled[row] = !mEnabled[row];
        var active = 0;
        for (var i = 0; i < 5; i += 1) {
            if (mEnabled[i]) { active += 1; }
        }
        if (active == 0) {
            mEnabled[row] = true;
            WatchUi.showToast("Mindestens eine Seite muss aktiv bleiben", null);
        } else {
            persistConfig();
        }
        WatchUi.requestUpdate();
    }

    function toggleAt(y as Lang.Number) as Void {
        if (mRowHeight <= 0) { return; }
        var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
        if (row >= 0 && row < 5) {
            toggleRow(row);
        } else if (y > mUnit * 0.75) {
            saveConfig();
        }
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        return mKajoLayout.fitFont(dc, text, maxWidth, preferredFont);
    }
    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function saveConfig() as Void {
        persistConfig();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;

        drawFit(dc, cx, mUnit * 0.075, "ANZEIGE",
            mUnit * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.16, 328, mUnit * 0.16);

        var labels = ["Übersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        mRowTop = mUnit * 0.205;
        mRowHeight = mUnit * 0.105;
        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, mRowHeight * 0.82, mUnit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var i = 0; i < 5; i += 1) {
            var y = mRowTop + (i * mRowHeight);
            var focused = i == mSelectedRow;
            dc.setColor(focused ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), (mRowHeight * 0.82).toNumber());
            dc.setColor(focused ? 0xFFB020 : (mEnabled[i] ? 0x25D3CB : 0x344047), Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, (mRowHeight * 0.82).toNumber());
            drawFit(dc, cx - rowWidth * 0.12, y + mRowHeight * 0.20,
                labels[i], rowWidth * 0.66, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
            var state = mEnabled[i] ? "AN" : "AUS";
            drawFit(dc, cx + rowWidth * 0.36, y + mRowHeight * 0.20,
                state, rowWidth * 0.20, Graphics.FONT_XTINY,
                mEnabled[i] ? 0x25D3CB : 0x98A5AB);
            if (i < 4) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + (mRowHeight * 0.90),
                    (left + rowWidth).toNumber(), y + (mRowHeight * 0.90));
            }
        }

        drawFit(dc, cx, mUnit * 0.79, "OBERE TASTE · ÄNDERN",
            mUnit * 0.72, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx, mUnit * 0.86, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.72, Graphics.FONT_XTINY, 0x98A5AB);
    }
}
