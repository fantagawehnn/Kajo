import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutListView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    var mSessions as Lang.Array<Lang.Dictionary> = [];
    var mPage as Lang.Number = 0;
    var mPageCount as Lang.Number = 1;
    var mRowTop as Lang.Number = 0;
    var mRowHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;
    var mWidth as Lang.Number = 0;
    var mHeight as Lang.Number = 0;
    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mHomeView = homeView;
        var saved = Storage.getValue("kajoPlannedSessions");
        if (saved != null) {
            mSessions = saved as Lang.Array<Lang.Dictionary>;
        }
        mPageCount = Math.floor(mSessions.size() / 3).toNumber();
        if ((mSessions.size() % 3) > 0) { mPageCount += 1; }
        if (mPageCount < 1) { mPageCount = 1; }
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (mSessions.size() == 0 || y > mUnit * 0.82) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (y >= mRowTop && y < mRowTop + (mRowHeight * 3)) {
            var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
            var index = (mPage * 3) + row;
            if (index < mSessions.size()) {
                var selected = mSessions[index] as Lang.Dictionary;
                var workoutView = new KajoConnectWorkoutView(selected, mHomeView);
                WatchUi.pushView(workoutView, new KajoConnectWorkoutDelegate(workoutView), WatchUi.SLIDE_UP);
            }
        }
    }

    function nextPage(direction as Lang.Number) as Void {
        if (mPageCount <= 1) { return; }
        mPage += direction;
        if (mPage < 0) { mPage = mPageCount - 1; }
        if (mPage >= mPageCount) { mPage = 0; }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;

        drawCentered(dc, cx, mUnit * 0.075, "TRAININGSPLAN", mUnit * 0.72,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.125,
            mSessions.size().toString() + " EINHEITEN", mUnit * 0.68,
            Graphics.FONT_XTINY, 0x00E5CC);

        if (mSessions.size() == 0) {
            var emptyY = mUnit * 0.34;
            var emptyH = mUnit * 0.22;
            var emptyW = mKajoLayout.safeRectWidth(emptyY, emptyH, mUnit * 0.72);
            var emptyX = cx - (emptyW / 2);
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(emptyX.toNumber(), emptyY.toNumber(), emptyW.toNumber(),
                emptyH.toNumber(), (mUnit * 0.035).toNumber());
            drawCentered(dc, cx, emptyY + mUnit * 0.055, "NOCH KEIN PLAN",
                emptyW * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, emptyY + mUnit * 0.12, "UHR IN DER KAJO APP VERBINDEN",
                emptyW * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, cx, mUnit * 0.84, "ZURUECK", mUnit * 0.52,
                Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            return;
        }

        mRowTop = Math.floor(mUnit * 0.215).toNumber();
        mRowHeight = Math.floor(mUnit * 0.178).toNumber();
        var cardHeight = mUnit * 0.145;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.76);
        var cardX = cx - (cardWidth / 2);

        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var date = session["date"] == null ? "Datum offen" : session["date"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "--" : session["duration"].toString();
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.026).toNumber());
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.026).toNumber());
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle((cardX + mUnit * 0.016).toNumber(),
                (y + mUnit * 0.025).toNumber(), (mUnit * 0.009).toNumber(),
                (cardHeight - mUnit * 0.05).toNumber(), (mUnit * 0.004).toNumber());
            drawCentered(dc, cx, y + mUnit * 0.025, name, cardWidth * 0.86,
                Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, y + mUnit * 0.073, date + "  /  " + type,
                cardWidth * 0.86, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, cx, y + mUnit * 0.108,
                type == "RestDay" ? "RUHETAG" : duration + " MIN",
                cardWidth * 0.86, Graphics.FONT_XTINY, 0x00E5CC);
        }

        drawCentered(dc, cx, mUnit * 0.795,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  WISCHEN",
            mUnit * 0.66, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, mUnit * 0.86, "ZURUECK", mUnit * 0.52,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
