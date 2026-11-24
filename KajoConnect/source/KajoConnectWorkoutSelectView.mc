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
        drawCentered(dc, cx, mUnit * 0.075, "HEUTE · TRAINING WÄHLEN",
            mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.17, 328, mUnit * 0.17);

        mRowTop = Math.floor(mUnit * 0.215).toNumber();
        mRowHeight = Math.floor(mUnit * 0.178).toNumber();
        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();
            var rowWidth = mKajoLayout.safeRectWidth(y, 58, mUnit * 0.80);
            var left = cx - (rowWidth / 2);
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 58);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 58);
            drawCentered(dc, cx, y + 6, compactText(name, 34), rowWidth - 22,
                Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, y + 28, type + (duration == "" ? "" : " · " + duration + " MIN"),
                rowWidth - 22, Graphics.FONT_XTINY, 0x98A5AB);
            var cue = session["mainSet"] == null ? "" : session["mainSet"].toString();
            var intensity = session["intensity"];
            if (intensity != null && intensity.toString() != "") {
                cue = cue == "" ? intensity.toString() : intensity.toString() + " · " + cue;
            }
            if (cue != "") {
                drawCentered(dc, cx, y + 43, compactText(cue, 38),
                    rowWidth - 22, Graphics.FONT_XTINY, 0x25D3CB);
            }
        }
        drawCentered(dc, cx, mUnit * 0.795,
            (mPage + 1).toString() + " / " + mPageCount.toString() + " · WISCHEN",
            mUnit * 0.68, Graphics.FONT_XTINY, 0x98A5AB);
        drawCentered(dc, cx, mUnit * 0.85, "ZURÜCK",
            mUnit * 0.55, Graphics.FONT_XTINY, 0x98A5AB);
    }
}