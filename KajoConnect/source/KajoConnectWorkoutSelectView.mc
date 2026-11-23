import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutSelectView extends WatchUi.View {

    var mSessions as Lang.Array<Lang.Dictionary>;
    var mHomeView as KajoConnectView;
    var mPage as Lang.Number = 0;
    var mPageCount as Lang.Number = 1;
    var mRowTop as Lang.Number = 0;
    var mRowHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;

    function initialize(sessions as Lang.Array<Lang.Dictionary>, homeView as KajoConnectView) {
        View.initialize();
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
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(y).toNumber(), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y >= mRowTop && y < mRowTop + (mRowHeight * 3)) {
            var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
            var index = (mPage * 3) + row;
            if (index < mSessions.size()) {
                mHomeView.startActivityWithWorkout(mSessions[index] as Lang.Dictionary);
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
        var width = dc.getWidth();
        var height = dc.getHeight();
        mUnit = width;
        if (height < mUnit) { mUnit = height; }
        var cx = width / 2;

        drawCentered(dc, cx, mUnit * 0.09, "EINHEIT AUSWAEHLEN", mUnit * 0.78,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.155, "WELCHES TRAINING STARTET JETZT?",
            mUnit * 0.78, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        mRowTop = Math.floor(mUnit * 0.225).toNumber();
        mRowHeight = Math.floor(mUnit * 0.185).toNumber();
        var cardWidth = mUnit * 0.74;
        var cardHeight = mUnit * 0.155;
        var cardX = cx - (cardWidth / 2);

        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();

            dc.setColor(0x07151D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.03).toNumber());
            dc.setColor(0x12485A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.03).toNumber());

            drawCentered(dc, cx, y + (mUnit * 0.025), compactText(name, 34), cardWidth * 0.88,
                Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            var detail = type;
            if (duration != "") { detail += "  ·  " + duration + " MIN"; }
            drawCentered(dc, cx, y + (mUnit * 0.085), detail, cardWidth * 0.88,
                Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            var intensity = session["intensity"];
            var mainSet = session["mainSet"];
            var cue = mainSet == null ? "" : mainSet.toString();
            if (intensity != null && intensity.toString() != "") {
                cue = cue == "" ? intensity.toString() : intensity.toString() + " · " + cue;
            }
            if (cue != "") {
                drawCentered(dc, cx, y + (mUnit * 0.12), compactText(cue, 42), cardWidth * 0.88,
                    Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            }
        }

        drawCentered(dc, cx, mUnit * 0.84,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  WISCHEN",
            mUnit * 0.70, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, mUnit * 0.91, "EINHEIT ANTIPPEN",
            mUnit * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
    }
}
