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
        if (mSessions.size() == 0) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (y >= mRowTop && y < mRowTop + (mRowHeight * 3)) {
            var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
            var index = (mPage * 3) + row;
            if (index < mSessions.size()) {
                var selected = mSessions[index] as Lang.Dictionary;
                var workoutView = new KajoConnectWorkoutView(selected, mHomeView);
                WatchUi.pushView(
                    workoutView,
                    new KajoConnectWorkoutDelegate(workoutView),
                    WatchUi.SLIDE_UP
                );
            }
        } else if (y > mUnit * 0.86) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
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
        drawCentered(dc, cx, mUnit * 0.075, "TRAININGSPLAN", mUnit * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.135,
            mSessions.size().toString() + " GEPLANTE EINHEITEN",
            mUnit * 0.70, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        if (mSessions.size() == 0) {
            drawCentered(dc, cx, mUnit * 0.42, "NOCH KEIN TRAININGSPLAN", mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, mUnit * 0.51, "UHR MIT KAJO VERBINDEN", mUnit * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, cx, mUnit * 0.90, "ZURUECK", mUnit * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
            return;
        }

        mRowTop = Math.floor(mUnit * 0.225).toNumber();
        mRowHeight = Math.floor(mUnit * 0.175).toNumber();
        var cardHeight = mUnit * 0.145;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.70);
        var cardX = cx - (cardWidth / 2);

        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var date = session["date"] == null ? "Datum offen" : session["date"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "—" : session["duration"].toString();
            dc.setColor(0x0A1A1E, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(), cardHeight.toNumber(), (mUnit * 0.025).toNumber());
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(), cardHeight.toNumber(), (mUnit * 0.025).toNumber());
            drawCentered(dc, cx, y + (mUnit * 0.025), name, cardWidth * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, y + (mUnit * 0.075), date + " · " + type, cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, cx, y + (mUnit * 0.105), type == "RestDay" ? "RUHETAG" : duration + " MIN", cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        drawCentered(dc, cx, mUnit * 0.84,
            (mPage + 1).toString() + " / " + mPageCount.toString() + " · WISCHEN",
            mUnit * 0.68, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, mUnit * 0.91, "ZURUECK", mUnit * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
    }
}
