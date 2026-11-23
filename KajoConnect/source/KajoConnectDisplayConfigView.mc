import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectDisplayConfigView extends WatchUi.View {

    var mEnabled as Lang.Array<Lang.Boolean> = [true, true, true, true, true];
    var mRowTop = 0;
    var mRowHeight = 0;
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;

    function initialize() {
        View.initialize();
        for (var i = 0; i < 5; i += 1) {
            var key = "kajoDisplayPage" + i.toString();
            var savedValue = Storage.getValue(key);
            if (savedValue != null) { mEnabled[i] = savedValue as Lang.Boolean; }
        }
    }

    function toggleAt(y as Lang.Number) as Void {
        if (mRowHeight <= 0) { return; }
        var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
        if (row >= 0 && row < 5) {
            mEnabled[row] = !mEnabled[row];
            var active = 0;
            for (var i = 0; i < 5; i += 1) {
                if (mEnabled[i]) { active += 1; }
            }
            if (active == 0) {
                mEnabled[row] = true;
                WatchUi.showToast("Mindestens eine Seite muss aktiv bleiben", null);
            }
            WatchUi.requestUpdate();
        } else if (y > mUnit * 0.82) {
            saveConfig();
        }
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function saveConfig() as Void {
        for (var i = 0; i < 5; i += 1) {
            Storage.setValue("kajoDisplayPage" + i.toString(), mEnabled[i]);
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }
        var cx = mWidth / 2;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.095).toNumber(), Graphics.FONT_SMALL, "ANZEIGEN", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.16).toNumber(), Graphics.FONT_XTINY, "Datenseiten auswaehlen", Graphics.TEXT_JUSTIFY_CENTER);

        var labels as Lang.Array<Lang.String> = ["Uebersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        mRowTop = mUnit * 0.235;
        mRowHeight = mUnit * 0.108;

        var cardWidth = mUnit * 0.68;
        var cardX = cx - (cardWidth / 2);
        var cardHeight = mRowHeight * 0.82;

        for (var i = 0; i < 5; i += 1) {
            var y = mRowTop + (i * mRowHeight);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(Math.round(cardX).toNumber(), Math.round(y).toNumber(), Math.round(cardWidth).toNumber(), Math.round(cardHeight).toNumber(), Math.round(mUnit * 0.025).toNumber());

            var state = mEnabled[i] ? "AN" : "AUS";
            var labelWidth = Math.floor(cardWidth * 0.62).toNumber();
            var font = fitFont(dc, labels[i], labelWidth, Graphics.FONT_SMALL);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(Math.round(cardX + (labelWidth / 2) + (mUnit * 0.015)).toNumber(),
                Math.round(y + (cardHeight - dc.getFontHeight(font)) / 2).toNumber(),
                font, labels[i], Graphics.TEXT_JUSTIFY_CENTER);

            dc.setColor(mEnabled[i] ? Graphics.COLOR_GREEN : Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(Math.round(cardX + cardWidth * 0.84).toNumber(),
                Math.round(y + (cardHeight - dc.getFontHeight(Graphics.FONT_TINY)) / 2).toNumber(),
                Graphics.FONT_TINY, state, Graphics.TEXT_JUSTIFY_CENTER);
        }

        var saveWidth = mUnit * 0.54;
        var saveHeight = mUnit * 0.085;
        var saveY = mUnit * 0.825;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(Math.round(cx - saveWidth / 2).toNumber(), Math.round(saveY).toNumber(), Math.round(saveWidth).toNumber(), Math.round(saveHeight).toNumber(), Math.round(mUnit * 0.03).toNumber());
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        dc.drawText(Math.round(cx).toNumber(), Math.round(saveY + (saveHeight - dc.getFontHeight(Graphics.FONT_SMALL)) / 2).toNumber(),
            Graphics.FONT_SMALL, "SPEICHERN", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
