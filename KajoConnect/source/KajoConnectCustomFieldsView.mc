import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectCustomFieldsView extends WatchUi.View {

    var mMetricIds as Lang.Array<Lang.String> = [
        "speedNow", "speedAvg", "speedMax", "heartRate", "heartRateZone",
        "heartRateAvg", "heartRateMax", "distance", "elapsed",
        "calories", "cadence", "power", "trainingEffect",
        "altitude", "ascent", "descent", "gpsAccuracy"
    ];
    var mMetricLabels as Lang.Array<Lang.String> = [
        "Geschwindigkeit", "Tempo Durchschnitt", "Tempo Maximum", "Herzfrequenz", "HF-Zone",
        "HF Durchschnitt", "HF Maximum", "Distanz", "Zeit",
        "Kalorien", "Kadenz", "Leistung", "Training Effect",
        "Hoehe", "Anstieg", "Abstieg", "GPS-Genauigkeit"
    ];
    var mSelected as Lang.Array<Lang.String> = [];
    var mLargeMetricId as Lang.String = "";
    var mControlTop as Lang.Number = 0;
    var mControlBottom as Lang.Number = 0;
    var mPage as Lang.Number = 0;
    var mPageCount as Lang.Number = 4;
    var mSelectedRow as Lang.Number = -1;
    var mRowTop as Lang.Number = 0;
    var mRowHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;
    var mWidth as Lang.Number = 0;
    var mHeight as Lang.Number = 0;
    var mSaveTop as Lang.Number = 0;
    var mSaveBottom as Lang.Number = 0;

    function initialize() {
        View.initialize();
        mPageCount = Math.floor(mMetricIds.size() / 4).toNumber();
        if ((mMetricIds.size() % 4) > 0) { mPageCount += 1; }
        var saved = Storage.getValue("kajoCustomMetrics");
        if (saved != null) {
            var stored = saved as Lang.Array<Lang.String>;
            for (var i = 0; i < stored.size() && i < 4; i += 1) {
                if (mMetricIds.indexOf(stored[i]) >= 0) {
                    mSelected.add(stored[i]);
                }
            }
        }
        var largeSaved = Storage.getValue("kajoLargeMetricId");
        if (largeSaved != null && selectedIndex(largeSaved.toString()) >= 0) {
            mLargeMetricId = largeSaved.toString();
        }
    }

    function selectedIndex(metricId as Lang.String) as Lang.Number {
        return mSelected.indexOf(metricId);
    }

    function toggleMetric(index as Lang.Number) as Void {
        if (index < 0 || index >= mMetricIds.size()) { return; }
        var metricId = mMetricIds[index];
        var existing = selectedIndex(metricId);
        if (existing >= 0) {
            mSelected.remove(metricId);
            if (metricId == mLargeMetricId) { mLargeMetricId = ""; }
            if (mSelectedRow == index) { mSelectedRow = -1; }
        } else {
            if (mSelected.size() >= 4) {
                WatchUi.showToast("Maximal vier Datenfelder auswaehlen", null);
                return;
            }
            mSelected.add(metricId);
            mSelectedRow = index;
        }
        WatchUi.requestUpdate();
    }

    function moveSelected(direction as Lang.Number) as Void {
        if (mSelectedRow < 0 || mSelectedRow >= mMetricIds.size()) {
            WatchUi.showToast("Zuerst rechts ein Datenfeld auswaehlen", null);
            return;
        }
        var metricId = mMetricIds[mSelectedRow];
        var current = selectedIndex(metricId);
        var target = current + direction;
        if (current < 0) {
            WatchUi.showToast("Datenfeld ist nicht aktiviert", null);
            return;
        }
        if (target < 0 || target >= mSelected.size()) { return; }
        var swap = mSelected[target];
        mSelected[target] = mSelected[current];
        mSelected[current] = swap;
        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (mRowHeight > 0 && y >= mRowTop && y < mRowTop + (mRowHeight * 4)) {
            var row = Math.floor((y - mRowTop) / mRowHeight).toNumber();
            var index = (mPage * 4) + row;
            if (index < mMetricIds.size()) {
                if (x < mWidth * 0.60) {
                    toggleMetric(index);
                } else {
                    mSelectedRow = index;
                    WatchUi.requestUpdate();
                }
            }
            return;
        }

        if (y >= mControlTop && y <= mControlBottom) {
            if (x < mWidth * 0.375) {
                moveSelected(-1);
            } else if (x < mWidth * 0.625) {
                toggleLargeMetric();
            } else {
                moveSelected(1);
            }
            return;
        }
        if (y >= mSaveTop && y <= mSaveBottom) {
            saveConfig();
        }
    }

    function nextPage(direction as Lang.Number) as Void {
        mPage += direction;
        if (mPage < 0) { mPage = mPageCount - 1; }
        if (mPage >= mPageCount) { mPage = 0; }
        mSelectedRow = -1;
        WatchUi.requestUpdate();
    }

    function toggleLargeMetric() as Void {
        if (mSelectedRow < 0 || mSelectedRow >= mMetricIds.size()) {
            WatchUi.showToast("Zuerst rechts ein Datenfeld auswaehlen", null);
            return;
        }
        var metricId = mMetricIds[mSelectedRow];
        if (selectedIndex(metricId) < 0) {
            WatchUi.showToast("Datenfeld zuerst aktivieren", null);
            return;
        }
        mLargeMetricId = mLargeMetricId == metricId ? "" : metricId;
        WatchUi.requestUpdate();
    }

    function saveConfig() as Void {
        try {
            Storage.setValue("kajoCustomMetrics", mSelected);
            Storage.setValue("kajoLargeMetricId", mLargeMetricId);
            WatchUi.showToast("Eigene Datenfelder gespeichert", null);
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } catch (error) {
            WatchUi.showToast("Speichern fehlgeschlagen", null);
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }
        var cx = mWidth / 2;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.085).toNumber(),
            Graphics.FONT_SMALL, "EIGENE DATENFELDER", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.15).toNumber(),
            Graphics.FONT_XTINY, "Bis zu vier Kennzahlen", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.19).toNumber(),
            Graphics.FONT_XTINY, "Seite " + (mPage + 1).toString() + " / " + mPageCount.toString() + " · WISCHEN", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(Math.round(cx).toNumber(), Math.round(mUnit * 0.215).toNumber(),
            Graphics.FONT_XTINY, "Links AN/AUS · Rechts auswaehlen", Graphics.TEXT_JUSTIFY_CENTER);

        mRowTop = Math.round(mUnit * 0.235).toNumber();
        mRowHeight = Math.round(mUnit * 0.125).toNumber();
        var cardWidth = mUnit * 0.70;
        var cardX = cx - (cardWidth / 2);
        var cardHeight = mRowHeight * 0.82;

        for (var row = 0; row < 4; row += 1) {
            var index = (mPage * 4) + row;
            if (index >= mMetricIds.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var metricId = mMetricIds[index];
            var orderIndex = selectedIndex(metricId);
            var isEnabled = orderIndex >= 0;
            var isFocused = mSelectedRow == index;
            var stateText = isEnabled ? (orderIndex + 1).toString() + " AN" : "AUS";
            dc.setColor(isFocused ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(Math.round(cardX).toNumber(), Math.round(y).toNumber(),
                Math.round(cardWidth).toNumber(), Math.round(cardHeight).toNumber(),
                Math.round(mUnit * 0.02).toNumber());

            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(Math.round(cardX + cardWidth * 0.36).toNumber(),
                Math.round(y + (cardHeight - dc.getFontHeight(Graphics.FONT_TINY)) / 2).toNumber(),
                Graphics.FONT_TINY, mMetricLabels[index], Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(isEnabled ? Graphics.COLOR_GREEN : Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(Math.round(cardX + cardWidth * 0.83).toNumber(),
                Math.round(y + (cardHeight - dc.getFontHeight(Graphics.FONT_TINY)) / 2).toNumber(),
                Graphics.FONT_TINY, stateText, Graphics.TEXT_JUSTIFY_CENTER);
        }

        mControlTop = Math.round(mUnit * 0.755).toNumber();
        mControlBottom = Math.round(mUnit * 0.82).toNumber();
        var controlWidth = mUnit * 0.20;
        var controlHeight = mControlBottom - mControlTop;
        var centers = [cx - (mUnit * 0.25), cx, cx + (mUnit * 0.25)];
        var labels = ["HOCH", "GROSS", "RUNTER"];
        for (var b = 0; b < 3; b += 1) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(Math.round(centers[b] - controlWidth / 2).toNumber(),
                Math.round(mControlTop).toNumber(), Math.round(controlWidth).toNumber(),
                Math.round(controlHeight).toNumber(), Math.round(mUnit * 0.02).toNumber());
            dc.drawText(Math.round(centers[b]).toNumber(),
                Math.round(mControlTop + (controlHeight - dc.getFontHeight(Graphics.FONT_XTINY)) / 2).toNumber(),
                Graphics.FONT_XTINY, labels[b], Graphics.TEXT_JUSTIFY_CENTER);
        }

        mSaveTop = Math.round(mUnit * 0.85).toNumber();
        mSaveBottom = (mUnit * 91 / 100).toNumber();
        var saveWidth = mUnit * 0.48;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(Math.round(cx - saveWidth / 2).toNumber(),
            Math.round(mSaveTop).toNumber(), Math.round(saveWidth).toNumber(),
            Math.round((mSaveBottom - mSaveTop)).toNumber(), Math.round(mUnit * 0.02).toNumber());
        dc.drawText(Math.round(cx).toNumber(),
            Math.round(mSaveTop + ((mSaveBottom - mSaveTop) - dc.getFontHeight(Graphics.FONT_XTINY)) / 2).toNumber(),
            Graphics.FONT_XTINY, "SPEICHERN", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
