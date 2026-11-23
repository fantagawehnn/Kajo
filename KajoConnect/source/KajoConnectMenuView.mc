import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectMenuView extends WatchUi.View {

    var mHomeView as KajoConnectView;
    var mLayout as KajoLayout;
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
        mLayout = new KajoLayout();
    }

    function drawLabel(dc as Dc, x as Lang.Number, y as Lang.Number,
        label as Lang.String, width as Lang.Number) as Void {
        var font = mLayout.fitFont(dc, label, width, Graphics.FONT_SMALL);
        var safeY = mLayout.safeTextY(y, dc.getFontHeight(font));
        var safeWidth = mLayout.safeTextWidth(dc, x, safeY, font, width);
        while (label.length() > 0 && dc.getTextWidthInPixels(label, font) > safeWidth) {
            if (label.length() <= 4) { label = ""; }
            else { label = label.substring(0, label.length() - 4) + "..."; }
        }
        if (label == "" || safeWidth <= 0) { return; }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(x, safeY, font, label, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function handleTap(y as Lang.Number) as Void {
        var first = mUnit * 0.255;
        var step = mUnit * 0.145;
        var index = Math.floor((y - first) / step).toNumber();
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
        mLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;

        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.12).toNumber(), (mUnit * 0.10).toNumber(),
            (mUnit * 0.17).toNumber(), (mUnit * 0.065).toNumber());

        drawLabel(dc, cx, (mUnit * 0.13).toNumber(), "KAJO MENUE", (mUnit * 0.70).toNumber());

        for (var i = 0; i < 4; i += 1) {
            var top = mUnit * (0.245 + (i * 0.145));
            var height = mUnit * 0.095;
            var width = mLayout.safeRectWidth(top, height, mUnit * 0.76);
            var left = cx - (width / 2);
            dc.setColor(0x091417, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                height.toNumber(), (mUnit * 0.025).toNumber());
            dc.setColor(0x1A4A52, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(left.toNumber(), top.toNumber(), width.toNumber(),
                height.toNumber(), (mUnit * 0.025).toNumber());
            drawLabel(dc, cx, (top + (height * 0.29)).toNumber(),
                mRows[i], (width * 0.86).toNumber());
        }

        drawLabel(dc, cx, (mUnit * 0.87).toNumber(), "ANTIPPEN ZUM OEFFNEN",
            (mUnit * 0.68).toNumber());
    }
}
