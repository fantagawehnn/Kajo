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
        for (var i = 0; i < 5; i += 1) {
            Storage.setValue("kajoDisplayPage" + i.toString(), mEnabled[i]);
        }
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
        drawFit(dc, cx, mUnit * 0.13, "DATENSEITEN EIN- ODER AUSBLENDEN",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x00E5CC);

        var labels = ["Uebersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        mRowTop = mUnit * 0.205;
        mRowHeight = mUnit * 0.105;
        var cardHeight = mRowHeight * 0.82;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.76);
        var cardX = cx - (cardWidth / 2);

        for (var i = 0; i < 5; i += 1) {
            var y = mRowTop + (i * mRowHeight);
            dc.setColor(0x071619, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.022).toNumber());
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.022).toNumber());
            if (mEnabled[i]) {
                dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle((cardX + mUnit * 0.015).toNumber(),
                    (y + mUnit * 0.016).toNumber(), (mUnit * 0.009).toNumber(),
                    (cardHeight - mUnit * 0.032).toNumber(), (mUnit * 0.004).toNumber());
            }
            var state = mEnabled[i] ? "AN" : "AUS";
            var labelWidth = cardWidth * 0.68;
            drawFit(dc, cardX + (labelWidth / 2) + (mUnit * 0.035),
                y + (cardHeight * 0.27), labels[i], labelWidth * 0.94,
                Graphics.FONT_TINY, Graphics.COLOR_WHITE);
            drawFit(dc, cardX + cardWidth * 0.86,
                y + (cardHeight * 0.30), state, cardWidth * 0.22,
                Graphics.FONT_XTINY, mEnabled[i] ? 0x00E5CC : Graphics.COLOR_LT_GRAY);
        }

        var saveHeight = mUnit * 0.08;
        var saveY = mUnit * 0.77;
        var saveWidth = mKajoLayout.safeRectWidth(saveY, saveHeight, mUnit * 0.54);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle((cx - saveWidth / 2).toNumber(), saveY.toNumber(),
            saveWidth.toNumber(), saveHeight.toNumber(), (mUnit * 0.025).toNumber());
        drawFit(dc, cx, saveY + (mUnit * 0.022), "SPEICHERN",
            saveWidth * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
    }
}
