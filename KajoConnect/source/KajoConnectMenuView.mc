import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectMenuView extends WatchUi.View {

    var mHomeView as KajoConnectView;
    var mKajoLayout as KajoLayout;
    var mWidth as Lang.Number = 0;
    var mHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;
    var mRowTop as Lang.Number = 82;
    var mRowStep as Lang.Number = 58;
    var mRowHeight as Lang.Number = 42;
    var mRows as Lang.Array<Lang.String> = [
        "ANZEIGEN ANPASSEN",
        "TRAININGSUEBERSICHT",
        "UHR MIT KAJO VERBINDEN",
        "EIGENE DATENFELDER"
    ];

    function initialize(homeView as KajoConnectView) {
        View.initialize();
        mHomeView = homeView;
        mKajoLayout = new KajoLayout();
    }

    function drawLabel(dc as Dc, x as Lang.Number, y as Lang.Number,
        label as Lang.String, width as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, label, width, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
    }

    function handleTap(y as Lang.Number) as Void {
        if (y >= mUnit * 0.80) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (y < mRowTop || y >= (mRowTop + (mRowStep * 4))) { return; }
        var index = Math.floor((y - mRowTop) / mRowStep).toNumber();
        if (index < 0 || index >= 4) { return; }
        if (index == 0) {
            var config = new KajoConnectDisplayConfigView();
            WatchUi.pushView(config, new KajoConnectDisplayConfigDelegate(config), WatchUi.SLIDE_UP);
        } else if (index == 1) {
            var list = new KajoConnectWorkoutListView(mHomeView);
            WatchUi.pushView(list, new KajoConnectWorkoutListDelegate(list), WatchUi.SLIDE_UP);
        } else if (index == 2) {
            var pairing = new KajoConnectPairingView();
            WatchUi.pushView(pairing, new KajoConnectPairingDelegate(), WatchUi.SLIDE_UP);
        } else {
            var fields = new KajoConnectCustomFieldsView();
            WatchUi.pushView(fields, new KajoConnectCustomFieldsDelegate(fields), WatchUi.SLIDE_UP);
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;

        // Feste, voneinander getrennte Zonen: Titel 28-54, Karten 82-298, Zurueck 320-350.
        drawLabel(dc, cx, 30, "EINSTELLUNGEN", 270);

        for (var i = 0; i < 4; i += 1) {
            var top = mRowTop + (i * mRowStep);
            var width = mKajoLayout.safeRectWidth(top, mRowHeight, mUnit * 0.78);
            var left = cx - (width / 2);
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                mRowHeight, 12);
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                mRowHeight, 12);
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle((left + 9).toNumber(), (top + 9).toNumber(),
                4, (mRowHeight - 18).toNumber(), 2);
            // Pro Karte genau eine Textzeile. Keine zweite "Oeffnen"-Zeile, die
            // mit der eigentlichen Bezeichnung kollidieren kann.
            drawLabel(dc, cx, (top + 11).toNumber(), mRows[i], (width * 0.82).toNumber());
        }

        drawLabel(dc, cx, 330, "ZURUECK", (mUnit * 0.55).toNumber());
    }
}
