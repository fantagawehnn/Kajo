import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectDisplayConfigView extends WatchUi.View {

    var mEnabled = [true, true, true, true, true];
    var mRowTop = 0;
    var mRowHeight = 0;
    var mWidth = 0;
    var mHeight = 0;
    var mSaved = false;

    function initialize() {
        View.initialize();
        for (var i = 0; i < 5; i += 1) {
            var key = "kajoDisplayPage" + i.toString();
            var savedValue = getApp().getProperty(key);
            if (savedValue != null) {
                mEnabled[i] = savedValue as Lang.Boolean;
            }
        }
    }

    function toggleAt(y as Lang.Number) as Void {
        var row = Math.floor((y - mRowTop) / mRowHeight);
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
        } else if (y > mHeight * 0.82) {
            saveConfig();
        }
    }

    function saveConfig() as Void {
        for (var i = 0; i < 5; i += 1) {
            getApp().setProperty("kajoDisplayPage" + i.toString(), mEnabled[i]);
        }
        mSaved = true;
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        var center = mWidth / 2;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(center, mHeight * 0.08, Graphics.FONT_SMALL, "ANZEIGEN", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(center, mHeight * 0.15, Graphics.FONT_XTINY, "Datenseiten auswaehlen", Graphics.TEXT_JUSTIFY_CENTER);

        var labels = ["Uebersicht", "Geschwindigkeit", "Herzfrequenz", "Distanz & Zeit", "Weitere Daten"];
        mRowTop = mHeight * 0.23;
        mRowHeight = mHeight * 0.105;

        for (var i = 0; i < 5; i += 1) {
            var y = mRowTop + (i * mRowHeight);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(mWidth * 0.12, y, mWidth * 0.76, mRowHeight * 0.82, 7);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(mWidth * 0.43, y + 7, Graphics.FONT_TINY, labels[i], Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(mEnabled[i] ? Graphics.COLOR_GREEN : Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(mWidth * 0.76, y + 7, Graphics.FONT_SMALL, mEnabled[i] ? "AN" : "AUS", Graphics.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(mWidth * 0.25, mHeight * 0.83, mWidth * 0.50, mHeight * 0.08, 8);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        dc.drawText(center, mHeight * 0.845, Graphics.FONT_TINY, "SPEICHERN", Graphics.TEXT_JUSTIFY_CENTER);
    }
}