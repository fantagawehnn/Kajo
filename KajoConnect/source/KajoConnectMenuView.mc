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
        var index = Math.floor((y - (mUnit * 0.225)) / (mUnit * 0.135)).toNumber();
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

        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle((mUnit * 0.13).toNumber(), (mUnit * 0.105).toNumber(),
            (mUnit * 0.035).toNumber(), (mUnit * 0.035).toNumber(), (mUnit * 0.012).toNumber());
        drawLabel(dc, cx, (mUnit * 0.105).toNumber(), "EINSTELLUNGEN",
            (mUnit * 0.70).toNumber());
        mUnit = mWidth < mHeight ? mWidth : mHeight;

        for (var i = 0; i < 4; i += 1) {
            var top = mUnit * (0.225 + (i * 0.135));
            var height = mUnit * 0.095;
            var width = mKajoLayout.safeRectWidth(top, height, mUnit * 0.78);
            var left = cx - (width / 2);
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                height.toNumber(), (mUnit * 0.026).toNumber());
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                height.toNumber(), (mUnit * 0.026).toNumber());
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle((left + mUnit * 0.018).toNumber(),
                (top + mUnit * 0.022).toNumber(), (mUnit * 0.009).toNumber(),
                (height - mUnit * 0.044).toNumber(), (mUnit * 0.004).toNumber());
            drawLabel(dc, cx, (top + height * 0.30).toNumber(),
                mRows[i], (width * 0.84).toNumber());
            drawLabel(dc, cx, (top + height * 0.64).toNumber(),
                "OEFFNEN  >", (width * 0.72).toNumber());
        }

        drawLabel(dc, cx, (mUnit * 0.84).toNumber(), "ZURUECK",
            (mUnit * 0.55).toNumber());
    }
}
