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
    var mRowTop as Lang.Number = 67;
    var mRowStep as Lang.Number = 34;
    var mRowHeight as Lang.Number = 28;
    var mRows as Lang.Array<Lang.String> = [
        "TRAININGSFELDER",
        "DATENSEITEN",
        "TRAININGSÜBERSICHT",
        "HISTORIE",
        "INTERVALL-HINWEISE",
        "BOOTSKLASSE",
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
        if (y >= mUnit * 0.90) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (y < mRowTop || y >= (mRowTop + (mRowStep * 8))) { return; }
        var index = Math.floor((y - mRowTop) / mRowStep).toNumber();
        if (index < 0 || index >= 8) { return; }
        if (index == 0) {
            var trainingFields = new KajoConnectTrainingFieldsView();
            WatchUi.pushView(trainingFields, new KajoConnectTrainingFieldsDelegate(trainingFields), WatchUi.SLIDE_UP);
        } else if (index == 1) {
            var config = new KajoConnectDisplayConfigView();
            WatchUi.pushView(config, new KajoConnectDisplayConfigDelegate(config), WatchUi.SLIDE_UP);
        } else if (index == 2) {
            var list = new KajoConnectWorkoutListView(mHomeView);
            WatchUi.pushView(list, new KajoConnectWorkoutListDelegate(list), WatchUi.SLIDE_UP);
        } else if (index == 3) {
            var history = new KajoConnectHistoryView();
            WatchUi.pushView(history, new KajoConnectHistoryDelegate(history), WatchUi.SLIDE_UP);
        } else if (index == 4) {
            var hints = new KajoConnectIntervalHintsView();
            WatchUi.pushView(hints, new KajoConnectIntervalHintsDelegate(hints), WatchUi.SLIDE_UP);
        } else if (index == 5) {
            var boatClass = new KajoConnectBoatClassView(mHomeView);
            WatchUi.pushView(boatClass, new KajoConnectBoatClassDelegate(boatClass), WatchUi.SLIDE_UP);
        } else if (index == 6) {
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

        drawLabel(dc, cx, 30, "EINSTELLUNGEN", 270);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, 64, 328, 64);

        mRowTop = 67;
        for (var i = 0; i < mRows.size(); i += 1) {
            var top = mRowTop + (i * mRowStep);
            var rowWidth = mKajoLayout.safeRectWidth(top, mRowHeight, mUnit * 0.80);
            var left = cx - (rowWidth / 2);
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), top.toNumber(), rowWidth.toNumber(), mRowHeight);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), top.toNumber(), 4, mRowHeight);
            drawLabel(dc, cx, (top + 12).toNumber(), mRows[i], (rowWidth - 24).toNumber());
            if (i < mRows.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), top + mRowHeight + 5,
                    (left + rowWidth).toNumber(), top + mRowHeight + 5);
            }
        }
        drawLabel(dc, cx, 350, "ZURÜCK", (mUnit * 0.55).toNumber());
    }
}