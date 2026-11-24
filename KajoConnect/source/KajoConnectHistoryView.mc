import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectHistoryView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mEntries as Lang.Array<Lang.Dictionary> = [];
    var mPage as Lang.Number = 0;
    var mPageCount as Lang.Number = 1;
    var mRowTop as Lang.Number = 82;
    var mRowHeight as Lang.Number = 74;
    var mUnit as Lang.Number = 390;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        var stored = Storage.getValue("kajoActivityHistory");
        if (stored != null) { mEntries = stored as Lang.Array<Lang.Dictionary>; }
        mPageCount = Math.floor(mEntries.size() / 3).toNumber();
        if ((mEntries.size() % 3) > 0) { mPageCount += 1; }
        if (mPageCount < 1) { mPageCount = 1; }
    }

    function nextPage(direction as Lang.Number) as Void {
        if (mPageCount <= 1) { return; }
        mPage += direction;
        if (mPage < 0) { mPage = mPageCount - 1; }
        if (mPage >= mPageCount) { mPage = 0; }
        WatchUi.requestUpdate();
    }

    function showEntryInfo(y as Lang.Number) as Void {
        if (y < mRowTop || y >= mRowTop + (mRowHeight * 3)) { return; }
        var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
        var index = (mPage * 3) + row;
        if (index >= 0 && index < mEntries.size()) {
            WatchUi.showToast("Details in der KAJO App", null);
        }
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, width, font, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, width, font, color);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        mUnit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var cx = width / 2;

        drawFit(dc, cx, mUnit * 0.075, "HISTORIE",
            mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.16, 328, mUnit * 0.16);

        if (mEntries.size() == 0) {
            drawFit(dc, cx, mUnit * 0.39, "NOCH KEINE TRAININGS",
                mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawFit(dc, cx, mUnit * 0.47, "ABGESCHLOSSENE EINHEITEN",
                mUnit * 0.78, Graphics.FONT_XTINY, 0x98A5AB);
            drawFit(dc, cx, mUnit * 0.86, "UNTERE TASTE · ZURÜCK",
                mUnit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
            return;
        }

        mRowTop = mUnit * 0.205;
        mRowHeight = mUnit * 0.185;
        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, mRowHeight * 0.86, mUnit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var row = 0; row < 3; row += 1) {
            var index = (mPage * 3) + row;
            if (index >= mEntries.size()) { continue; }
            var entry = mEntries[index] as Lang.Dictionary;
            var y = mRowTop + (row * mRowHeight);
            var date = entry["date"] == null ? "--.--." : entry["date"].toString();
            var boat = entry["boatClass"] == null ? "K1" : entry["boatClass"].toString();
            var duration = entry["duration"] == null ? "--:--" : entry["duration"].toString();
            var distance = entry["distance"] == null ? "--" : entry["distance"].toString();
            var averageHR = entry["averageHeartRate"] == null ? "--" : entry["averageHeartRate"].toString();
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 62);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 62);
            drawFit(dc, cx - rowWidth * 0.12, y + 7,
                date + " · " + boat + " · " + duration,
                rowWidth * 0.70, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            drawFit(dc, cx - rowWidth * 0.12, y + 31,
                distance + " KM", rowWidth * 0.70,
                Graphics.FONT_SMALL, 0x25D3CB);
            drawFit(dc, cx + rowWidth * 0.36, y + 20,
                averageHR, rowWidth * 0.20,
                Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawFit(dc, cx + rowWidth * 0.36, y + 42,
                "BPM", rowWidth * 0.20,
                Graphics.FONT_XTINY, 0x98A5AB);
            if (row < 2 && index < mEntries.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + 66, (left + rowWidth).toNumber(), y + 66);
            }
        }

        drawFit(dc, cx, mUnit * 0.795,
            (mPage + 1).toString() + " / " + mPageCount.toString() + " · WISCHEN",
            mUnit * 0.68, Graphics.FONT_XTINY, 0x98A5AB);
        drawFit(dc, cx, mUnit * 0.86, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
    }
}