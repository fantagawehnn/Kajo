import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectCustomFieldsView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

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
        "Hoehe", "Anstieg", "Abstieg", "GPS-Qualitaet"
    ];
    var mSelected as Lang.Array<Lang.String> = [];
    var mLargeMetricId as Lang.String = "";
    var mMetricSizes as Lang.Dictionary = {};
    var mLayoutIndex as Lang.Number = 0;
    var mLayoutCount as Lang.Number = 3;
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
        mKajoLayout = new KajoLayout();
        mPageCount = Math.floor(mMetricIds.size() / 4).toNumber();
        if ((mMetricIds.size() % 4) > 0) { mPageCount += 1; }
        loadLayout(0);
    }

    function loadLayout(layoutIndex as Lang.Number) as Void {
        mSelected = [];
        mLargeMetricId = "";
        mMetricSizes = {};
        var savedSizes = Storage.getValue("kajoMetricSizes" + layoutIndex.toString());
        if (savedSizes != null) {
            mMetricSizes = savedSizes as Lang.Dictionary;
        }
        var saved = Storage.getValue("kajoCustomMetrics" + layoutIndex.toString());
        if (saved == null && layoutIndex == 0) {
            saved = Storage.getValue("kajoCustomMetrics");
        }
        if (saved != null) {
            var stored = saved as Lang.Array<Lang.String>;
            for (var i = 0; i < stored.size() && i < 4; i += 1) {
                if (mMetricIds.indexOf(stored[i]) >= 0 && mSelected.indexOf(stored[i]) < 0) {
                    mSelected.add(stored[i]);
                }
            }
        }
        var largeSaved = Storage.getValue("kajoLargeMetricId" + layoutIndex.toString());
        if (largeSaved == null && layoutIndex == 0) {
            largeSaved = Storage.getValue("kajoLargeMetricId");
        }
        if (largeSaved != null && selectedIndex(largeSaved.toString()) >= 0) {
            mLargeMetricId = largeSaved.toString();
            if (mMetricSizes[mLargeMetricId] == null) { mMetricSizes[mLargeMetricId] = 2; }
        }
        for (var i = 0; i < mSelected.size(); i += 1) {
            var selectedMetric = mSelected[i];
            if (mMetricSizes[selectedMetric] == null) { mMetricSizes[selectedMetric] = 1; }
        }
    }

    function saveCurrentLayout() as Void {
        Storage.setValue("kajoCustomMetrics" + mLayoutIndex.toString(), mSelected);
        Storage.setValue("kajoMetricSizes" + mLayoutIndex.toString(), mMetricSizes);
        Storage.setValue("kajoLargeMetricId" + mLayoutIndex.toString(), mLargeMetricId);
        if (mLayoutIndex == 0) {
            Storage.setValue("kajoCustomMetrics", mSelected);
            Storage.setValue("kajoMetricSizes", mMetricSizes);
            Storage.setValue("kajoLargeMetricId", mLargeMetricId);
        }
    }

    function changeLayout(direction as Lang.Number) as Void {
        try {
            saveCurrentLayout();
            mLayoutIndex += direction;
            if (mLayoutIndex < 0) { mLayoutIndex = mLayoutCount - 1; }
            if (mLayoutIndex >= mLayoutCount) { mLayoutIndex = 0; }
            loadLayout(mLayoutIndex);
            mSelectedRow = -1;
            WatchUi.requestUpdate();
        } catch (error) {
            WatchUi.showToast("Seitenwechsel fehlgeschlagen", null);
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
        if (y >= (mUnit * 0.16) && y < (mUnit * 0.225)) {
            if (x < (mWidth * 0.36)) {
                changeLayout(-1);
            } else if (x > (mWidth * 0.64)) {
                changeLayout(1);
            }
            return;
        }
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
                cycleMetricSize();
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

    function cycleMetricSize() as Void {
        if (mSelectedRow < 0 || mSelectedRow >= mMetricIds.size()) {
            WatchUi.showToast("Zuerst rechts ein Datenfeld auswaehlen", null);
            return;
        }
        var metricId = mMetricIds[mSelectedRow];
        if (selectedIndex(metricId) < 0) {
            WatchUi.showToast("Datenfeld zuerst aktivieren", null);
            return;
        }
        var currentSize = 1;
        var savedSize = mMetricSizes[metricId];
        if (savedSize != null) { currentSize = savedSize as Lang.Number; }
        var nextSize = (currentSize + 1) % 3;
        mMetricSizes[metricId] = nextSize;
        mLargeMetricId = nextSize == 2 ? metricId : "";
        WatchUi.requestUpdate();
    }

    function saveConfig() as Void {
        try {
            saveCurrentLayout();
            WatchUi.showToast("Eigene Datenseiten gespeichert", null);
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } catch (error) {
            WatchUi.showToast("Speichern fehlgeschlagen", null);
        }
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;

        drawFit(dc, cx, mUnit * 0.055, "DATENFELDER",
            mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.12,
            "LAYOUT " + (mLayoutIndex + 1).toString() + "/" + mLayoutCount.toString() +
            " · SEITE " + (mPage + 1).toString() + "/" + mPageCount.toString(),
            mUnit * 0.78, Graphics.FONT_XTINY, 0x98A5AB);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, mUnit * 0.17, 328, mUnit * 0.17);

        mRowTop = Math.round(mUnit * 0.225).toNumber();
        mRowHeight = Math.round(mUnit * 0.108).toNumber();
        var rowHeight = mRowHeight * 0.82;
        var rowWidth = mKajoLayout.safeRectWidth(mRowTop, rowHeight, mUnit * 0.80);
        var left = cx - (rowWidth / 2);

        for (var row = 0; row < 4; row += 1) {
            var index = (mPage * 4) + row;
            if (index >= mMetricIds.size()) { continue; }
            var y = mRowTop + (row * mRowHeight);
            var metricId = mMetricIds[index];
            var orderIndex = selectedIndex(metricId);
            var isEnabled = orderIndex >= 0;
            var isFocused = mSelectedRow == index;
            var sizeText = "M";
            if (isEnabled) {
                var fieldSize = 1;
                var savedFieldSize = mMetricSizes[metricId];
                if (savedFieldSize != null) { fieldSize = savedFieldSize as Lang.Number; }
                sizeText = fieldSize == 0 ? "S" : fieldSize == 2 ? "L" : "M";
            }
            var stateText = isEnabled ? (orderIndex + 1).toString() + " " + sizeText : "AUS";
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), rowHeight.toNumber());
            dc.setColor(isFocused ? 0xFFB020 : (isEnabled ? 0x25D3CB : 0x344047), Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, rowHeight.toNumber());
            drawFit(dc, cx - rowWidth * 0.10, y + rowHeight * 0.22,
                mMetricLabels[index], rowWidth * 0.66, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
            drawFit(dc, cx + rowWidth * 0.36, y + rowHeight * 0.22,
                stateText, rowWidth * 0.20, Graphics.FONT_XTINY,
                isEnabled ? 0x25D3CB : 0x98A5AB);
            if (row < 3 && index < mMetricIds.size() - 1) {
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(left.toNumber(), y + mRowHeight * 0.90,
                    (left + rowWidth).toNumber(), y + mRowHeight * 0.90);
            }
        }

        mControlTop = Math.round(mUnit * 0.70).toNumber();
        mControlBottom = Math.round(mUnit * 0.775).toNumber();
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(70, mControlTop, 320, mControlTop);
        drawFit(dc, cx - mUnit * 0.25, mControlTop + mUnit * 0.025,
            "HOCH", mUnit * 0.20, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mControlTop + mUnit * 0.025,
            "GROESSE", mUnit * 0.22, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx + mUnit * 0.25, mControlTop + mUnit * 0.025,
            "RUNTER", mUnit * 0.20, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(70, mControlBottom, 320, mControlBottom);

        mSaveTop = Math.round(mUnit * 0.79).toNumber();
        mSaveBottom = Math.round(mUnit * 0.865).toNumber();
        drawFit(dc, cx, mSaveTop + mUnit * 0.02, "OBERE TASTE · SPEICHERN",
            mUnit * 0.74, Graphics.FONT_XTINY, 0x25D3CB);
        drawFit(dc, cx, mUnit * 0.89, "UNTERE TASTE · ZURÜCK",
            mUnit * 0.74, Graphics.FONT_XTINY, 0x98A5AB);
    }
}
