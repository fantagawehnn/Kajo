import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectDisplayConfigView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    var mEnabled as Lang.Array<Lang.Boolean> = [true, true, true, true, true];
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

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        return mKajoLayout.fitFont(dc, text, maxWidth, preferredFont);
    }
    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        // Erst die tatsaechliche vertikale Textposition innerhalb des runden
        // Displays bestimmen, danach die dort verfuegbare Kreisbreite messen.
        var font = mKajoLayout.fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        var safeY = mKajoLayout.safeTextY(y.toNumber(), dc.getFontHeight(font));
        var safeWidth = mKajoLayout.safeTextWidth(dc, x.toNumber(), safeY, font, maxWidth.toNumber());

        // Falls die Kreisform weniger Platz bietet, Schrift weiter verkleinern.
        var fittedFont = mKajoLayout.fitFont(dc, text, safeWidth, preferredFont);
        if (fittedFont != font) {
            font = fittedFont;
            safeY = mKajoLayout.safeTextY(y.toNumber(), dc.getFontHeight(font));
            safeWidth = mKajoLayout.safeTextWidth(dc, x.toNumber(), safeY, font, maxWidth.toNumber());
        }

        var displayText = text;
        while (displayText.length() > 0 && dc.getTextWidthInPixels(displayText, font) > safeWidth) {
            if (displayText.length() <= 4) { displayText = ""; }
            else { displayText = displayText.substring(0, displayText.length() - 4) + "..."; }
        }
        if (displayText == "" || safeWidth <= 0) { return; }
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(safeY).toNumber(), font, displayText, Graphics.TEXT_JUSTIFY_CENTER);
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
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;
        // Einheitliches KAJO-Detail: dezenter cyanfarbener Randakzent.
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.105).toNumber(), (mUnit * 0.105).toNumber(),
            (mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber());
        dc.drawLine((mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber(),
            (mUnit * 0.15).toNumber(), (mUnit * 0.052).toNumber());
        dc.drawLine((mUnit * 0.15).toNumber(), (mUnit * 0.052).toNumber(),
            (mUnit * 0.185).toNumber(), (mUnit * 0.04).toNumber());

        drawFit(dc, cx, mUnit * 0.095, "ANZEIGEN", mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.16, "DATENSEITEN AUSWAEHLEN", mUnit * 0.74, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var labels = ["Uebersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        mRowTop = mUnit * 0.235;
        mRowHeight = mUnit * 0.108;

        var cardHeight = mRowHeight * 0.82;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.68);
        var cardX = cx - (cardWidth / 2);

        for (var i = 0; i < 5; i += 1) {
            var y = mRowTop + (i * mRowHeight);
            dc.setColor(0x091417, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(Math.round(cardX).toNumber(), Math.round(y).toNumber(),
                Math.round(cardWidth).toNumber(), Math.round(cardHeight).toNumber(),
                Math.round(mUnit * 0.025).toNumber());
            dc.setColor(0x1A4A52, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(Math.round(cardX).toNumber(), Math.round(y).toNumber(), Math.round(cardWidth).toNumber(), Math.round(cardHeight).toNumber(), Math.round(mUnit * 0.025).toNumber());

            var state = mEnabled[i] ? "AN" : "AUS";
            var labelWidth = Math.floor(cardWidth * 0.62).toNumber();
            var font = fitFont(dc, labels[i], labelWidth, Graphics.FONT_SMALL);
            drawFit(dc, cardX + (labelWidth / 2) + (mUnit * 0.015),
                Math.round(y + (cardHeight - dc.getFontHeight(font)) / 2).toNumber(),
                labels[i], labelWidth * 0.96, font, Graphics.COLOR_WHITE);

            drawFit(dc, cardX + cardWidth * 0.84,
                Math.round(y + (cardHeight - dc.getFontHeight(mKajoLayout.fontForPercent(dc, 0.045))) / 2).toNumber(),
                state, cardWidth * 0.22, Graphics.FONT_TINY,
                mEnabled[i] ? Graphics.COLOR_GREEN : Graphics.COLOR_LT_GRAY);
        }

        var saveHeight = mUnit * 0.085;
        var saveY = mUnit * 0.78;
        var saveWidth = mKajoLayout.safeRectWidth(saveY, saveHeight, mUnit * 0.46);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(Math.round(cx - saveWidth / 2).toNumber(), Math.round(saveY).toNumber(), Math.round(saveWidth).toNumber(), Math.round(saveHeight).toNumber(), Math.round(mUnit * 0.03).toNumber());
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        drawFit(dc, cx, Math.round(saveY + (saveHeight - dc.getFontHeight(mKajoLayout.fontForPercent(dc, 0.055))) / 2).toNumber(),
            "SPEICHERN", saveWidth * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
    }
}
