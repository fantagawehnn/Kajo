import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutSelectView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    var mSessions as Lang.Array<Lang.Dictionary>;
    var mHomeView as KajoConnectView;
    var mPage as Lang.Number = 0;
    var mPageCount as Lang.Number = 1;
    var mRowTop as Lang.Number = 0;
    var mRowHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;

    function initialize(sessions as Lang.Array<Lang.Dictionary>, homeView as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mSessions = sessions;
        mHomeView = homeView;
        mPageCount = Math.floor(mSessions.size() / 3).toNumber();
        if ((mSessions.size() % 3) > 0) { mPageCount += 1; }
        if (mPageCount < 1) { mPageCount = 1; }
    }

    function compactText(value as Lang.String, maxLength as Lang.Number) as Lang.String {
        if (value.length() <= maxLength) { return value; }
        if (maxLength <= 3) { return value.substring(0, maxLength); }
        return value.substring(0, maxLength - 3) + "...";
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y > mUnit * 0.82) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (y >= mRowTop && y < mRowTop + (mRowHeight * 3)) {
            var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
            var index = (mPage * 3) + row;
            if (index < mSessions.size()) {
                mHomeView.startActivityWithWorkout(mSessions[index] as Lang.Dictionary);
            }
        }
    }

    function selectFirstWorkout() as Void {
        var index = mPage * 3;
        if (index >= 0 && index < mSessions.size()) {
            mHomeView.startActivityWithWorkout(mSessions[index] as Lang.Dictionary);
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
        var width = dc.getWidth();
        var height = dc.getHeight();
        mUnit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var cx = width / 2;

        drawCentered(dc, cx, mUnit * 0.075, "TRAINING STARTEN", mUnit * 0.76,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        // Auswahl wird durch die Karten selbst erklaert.

        mRowTop = Math.floor(mUnit * 0.215).toNumber();
        mRowHeight = Math.floor(mUnit * 0.178).toNumber();
        var cardHeight = mUnit * 0.15;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.76);
        var cardX = cx - (cardWidth / 2);

        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();

            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.028).toNumber());
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.028).toNumber());
            drawCentered(dc, cx, y + mUnit * 0.027, compactText(name, 34),
                cardWidth * 0.86, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            var detail = type;
            if (duration != "") { detail += "  /  " + duration + " MIN"; }
            drawCentered(dc, cx, y + mUnit * 0.077, detail,
                cardWidth * 0.86, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            var intensity = session["intensity"];
            var mainSet = session["mainSet"];
            var cue = mainSet == null ? "" : mainSet.toString();
            if (intensity != null && intensity.toString() != "") {
                cue = cue == "" ? intensity.toString() : intensity.toString() + "  /  " + cue;
            }
            if (cue != "") {
                drawCentered(dc, cx, y + mUnit * 0.112, compactText(cue, 38),
                    cardWidth * 0.86, Graphics.FONT_XTINY, 0x00E5CC);
            }
        }

        drawCentered(dc, cx, mUnit * 0.795,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  WISCHEN",
            mUnit * 0.68, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, mUnit * 0.86, "ZURUECK", mUnit * 0.55,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
