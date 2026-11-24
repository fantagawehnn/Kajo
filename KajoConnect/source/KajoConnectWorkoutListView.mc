import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutListView extends WatchUi.View {

    var mHomeView as KajoConnectView;
    var mSessions as Lang.Array<Lang.Dictionary> = [];
    var mWorkoutLayout as KajoLayout;
    var mSelectedIndex as Lang.Number = 0;
    var mFirstVisibleIndex as Lang.Number = 0;
    var mRowTop as Lang.Number = 94;
    var mRowHeight as Lang.Number = 54;
    var mRowGap as Lang.Number = 8;
    var mVisibleRows as Lang.Number = 4;
    var mTitle as Lang.String = "TRAININGSPLAN";
    var mCountLabel as Lang.String = "EINHEITEN GESPEICHERT";

    function initialize(homeView as KajoConnectView,
        sessions as Lang.Array<Lang.Dictionary> or Null,
        title as Lang.String,
        countLabel as Lang.String) {
        View.initialize();
        mHomeView = homeView;
        mSessions = sessions == null ? homeView.getPlannedSessions() : sessions;
        mTitle = title;
        mCountLabel = countLabel;
        mWorkoutLayout = new KajoLayout();
    }

    function moveSelection(direction as Lang.Number) as Void {
        if (mSessions.size() == 0) { return; }
        mSelectedIndex += direction;
        if (mSelectedIndex < 0) { mSelectedIndex = 0; }
        if (mSelectedIndex >= mSessions.size()) {
            mSelectedIndex = mSessions.size() - 1;
        }

        if (mSelectedIndex < mFirstVisibleIndex) {
            mFirstVisibleIndex = mSelectedIndex;
        } else if (mSelectedIndex >= mFirstVisibleIndex + mVisibleRows) {
            mFirstVisibleIndex = mSelectedIndex - mVisibleRows + 1;
        }
        WatchUi.requestUpdate();
    }

    function selectCurrent() as Void {
        if (mSelectedIndex < 0 || mSelectedIndex >= mSessions.size()) { return; }
        mHomeView.startActivityWithWorkout(mSessions[mSelectedIndex] as Lang.Dictionary);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (mSessions.size() == 0) { return; }
        var rowStep = mRowHeight + mRowGap;
        if (y < mRowTop || y >= mRowTop + (mVisibleRows * rowStep)) { return; }
        var visibleIndex = Math.floor((y - mRowTop) / rowStep).toNumber();
        var index = mFirstVisibleIndex + visibleIndex;
        if (index >= 0 && index < mSessions.size()) {
            mSelectedIndex = index;
            selectCurrent();
        }
    }

    function onUpdate(dc as Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        var cx = width / 2;

        mWorkoutLayout.configure(width, height);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        mWorkoutLayout.drawTextBox(dc, cx, 25, (unit * 0.78).toNumber(), 28,
            mTitle, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        mWorkoutLayout.drawTextBox(dc, cx, 55, (unit * 0.78).toNumber(), 22,
            mSessions.size().toString() + " " + mCountLabel,
            Graphics.FONT_XTINY, 0x98A5AB);

        if (mSessions.size() == 0) {
            mWorkoutLayout.drawTextBox(dc, cx, 158, (unit * 0.78).toNumber(), 32,
                "KEINE TRAININGS", Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            mWorkoutLayout.drawTextBox(dc, cx, 195, (unit * 0.78).toNumber(), 28,
                "IN KAJO SIND KEINE EINHEITEN GESPEICHERT",
                Graphics.FONT_XTINY, 0x98A5AB);
            mWorkoutLayout.drawTextBox(dc, cx, 342, (unit * 0.78).toNumber(), 20,
                "ZURÜCK · UNTERE TASTE", Graphics.FONT_XTINY, 0x25D3CB);
            return;
        }

        var rowStep = mRowHeight + mRowGap;
        var requestedWidth = (unit * 0.82).toNumber();
        for (var visible = 0; visible < mVisibleRows; visible += 1) {
            var index = mFirstVisibleIndex + visible;
            if (index >= mSessions.size()) { break; }

            var session = mSessions[index] as Lang.Dictionary;
            var name = session["name"] == null
                ? "GEPLANTE EINHEIT"
                : session["name"].toString();
            var type = session["type"] == null ? "TRAINING" : session["type"].toString();
            var duration = session["duration"] == null ? "" : session["duration"].toString();
            var date = session["date"] == null ? "" : session["date"].toString();
            var details = type;
            if (duration != "") { details += " · " + duration + " MIN"; }
            if (date != "") { details += " · " + date; }

            var rowY = mRowTop + (visible * rowStep);
            var rowWidth = mWorkoutLayout.safeRectWidthAt(cx, rowY, mRowHeight, requestedWidth);
            var rowLeft = cx - (rowWidth / 2);
            var selected = index == mSelectedIndex;

            dc.setColor(selected ? 0x123034 : 0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(
                rowLeft.toNumber(), rowY, rowWidth.toNumber(), mRowHeight, 8
            );
            dc.setColor(selected ? 0x25D3CB : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(rowLeft.toNumber(), rowY, 4, mRowHeight);

            mWorkoutLayout.drawTextBox(dc, cx, rowY + 4, rowWidth - 18, 23,
                name, Graphics.FONT_SMALL,
                selected ? Graphics.COLOR_WHITE : 0xD7DEE2);
            mWorkoutLayout.drawTextBox(dc, cx, rowY + 29, rowWidth - 18, 18,
                details, Graphics.FONT_XTINY, 0x98A5AB);
        }

        var firstLabel = (mFirstVisibleIndex + 1).toString();
        var lastIndex = mFirstVisibleIndex + mVisibleRows;
        if (lastIndex > mSessions.size()) { lastIndex = mSessions.size(); }
        var rangeLabel = firstLabel + "–" + lastIndex.toString() +
            " / " + mSessions.size().toString();
        mWorkoutLayout.drawTextBox(dc, cx, 345, (unit * 0.78).toNumber(), 18,
            rangeLabel + " · OBEN/UNTEN WÄHLEN",
            Graphics.FONT_XTINY, 0x25D3CB);
    }
}
