import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutListView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mSessions as Lang.Array<Lang.Dictionary> = [];
    var mPage as Lang.Number = 0;
    var mSelectedRow as Lang.Number = 0;
    var mPageCount as Lang.Number = 1;
    var mRowTop as Lang.Number = 0;
    var mRowHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;
    var mHomeView as KajoConnectView;

    function initialize(homeView as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mHomeView = homeView;
        var saved = Storage.getValue("kajoPlannedSessions");
        if (saved != null) { mSessions = saved as Lang.Array<Lang.Dictionary>; }
        mPageCount = Math.floor(mSessions.size() / 3).toNumber();
        if ((mSessions.size() % 3) > 0) { mPageCount += 1; }
        if (mPageCount < 1) { mPageCount = 1; }
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function moveSelection(direction as Lang.Number) as Void {
        if (mSessions.size() == 0) { return; }
        var index = (mPage * 3) + mSelectedRow + direction;
        if (index < 0) { index = mSessions.size() - 1; }
        if (index >= mSessions.size()) { index = 0; }
        mPage = Math.floor(index / 3).toNumber();
        mSelectedRow = index % 3;
        WatchUi.requestUpdate();
    }

    function selectFocused() as Void {
        var index = (mPage * 3) + mSelectedRow;
        if (index >= 0 && index < mSessions.size()) {
            var selected = mSessions[index] as Lang.Dictionary;
            var workoutView = new KajoConnectWorkoutView(selected, mHomeView);
            WatchUi.pushView(workoutView, new KajoConnectWorkoutDelegate(workoutView), WatchUi.SLIDE_UP);
        }
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y > mUnit * 0.82) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        if (mSessions.size() == 0 || y < mRowTop || y >= mRowTop + (mRowHeight * 3)) { return; }
        var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
        mSelectedRow = row;
        var index = (mPage * 3) + row;
        if (index < mSessions.size()) {
            var selected = mSessions[index] as Lang.Dictionary;
            var workoutView = new KajoConnectWorkoutView(selected, mHomeView);
            WatchUi.pushView(workoutView, new KajoConnectWorkoutDelegate(workoutView), WatchUi.SLIDE_UP);
        }
    }

    function nextPage(direction as Lang.Number) as Void {
        if (mPageCount <= 1) { return; }
        mPage += direction;
        if (mPage < 0) { mPage = mPageCount - 1; }
        if (mPage >= mPageCount) { mPage = 0; }
        mSelectedRow = 0;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        mUnit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var cx = width / 2;
        drawCentered(dc, cx, mUnit * 0.075, "GESPEICHERT", mUnit * 0.72,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.17, 328, mUnit * 0.17);

        if (mSessions.size() == 0) {
            drawCentered(dc, cx, mUnit * 0.39, "NOCH KEIN TRAINING",
                mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, mUnit * 0.46, "PLAN IN KAJO SYNCHRONISIEREN",
                mUnit * 0.72, Graphics.FONT_XTINY, 0x98A5AB);
            drawCentered(dc, cx, mUnit * 0.84, "ZURÜCK", mUnit * 0.52,
                Graphics.FONT_XTINY, 0x98A5AB);
            return;
        }

        mRowTop = Math.floor(mUnit * 0.215).toNumber();
        mRowHeight = Math.floor(mUnit * 0.178).toNumber();
        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mSessions.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
            var date = session["date"] == null ? "Datum offen" : session["date"].toString();
            var type = session["type"] == null ? "Training" : session["type"].toString();
            var duration = session["duration"] == null ? "--" : session["duration"].toString();
            var rowWidth = mKajoLayout.safeRectWidth(y, 58, mUnit * 0.80);
            var left = cx - (rowWidth / 2);
            var selectedRow = row == mSelectedRow;
            dc.setColor(selectedRow ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 58);
            dc.setColor(selectedRow ? 0x25D3CB : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 58);
            drawCentered(dc, cx, y + 7, name, rowWidth - 22,
                Graphics.FONT_SMALL, selectedRow ? Graphics.COLOR_WHITE : 0x98A5AB);
            drawCentered(dc, cx, y + 30, date + " · " + type,
                rowWidth - 22, Graphics.FONT_XTINY, 0x98A5AB);
            drawCentered(dc, cx, y + 44,
                type == "RestDay" ? "RUHETAG" : duration + " MIN",
                rowWidth - 22, Graphics.FONT_XTINY, 0x25D3CB);
            if (row < 2 && index < mSessions.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + 61, (left + rowWidth).toNumber(), y + 61);
            }
        }

        drawCentered(dc, cx, mUnit * 0.795,
            (mPage + 1).toString() + " / " + mPageCount.toString() + " · WISCHEN",
            mUnit * 0.66, Graphics.FONT_XTINY, 0x98A5AB);
        drawCentered(dc, cx, mUnit * 0.85, "ZURÜCK",
            mUnit * 0.52, Graphics.FONT_XTINY, 0x98A5AB);
    }
}