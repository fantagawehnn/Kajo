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

        drawFit(dc, cx, mUnit * 0.065, "DATENFELDER",
            mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.115, "MAXIMAL 4 PRO SEITE",
            mUnit * 0.72, Graphics.FONT_XTINY, 0x00E5CC);
        drawFit(dc, cx, mUnit * 0.16,
            "SEITE " + (mLayoutIndex + 1).toString() + "/" + mLayoutCount.toString() +
            "    LISTE " + (mPage + 1).toString() + "/" + mPageCount.toString(),
            mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        mRowTop = Math.round(mUnit * 0.225).toNumber();
        mRowHeight = Math.round(mUnit * 0.108).toNumber();
        var cardHeight = mRowHeight * 0.82;
        var cardWidth = mKajoLayout.safeRectWidth(mRowTop, cardHeight, mUnit * 0.76);
        var cardX = cx - (cardWidth / 2);

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
            dc.setColor(isFocused ? 0x10272B : 0x071619, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.022).toNumber());
            dc.setColor(isFocused ? 0x00E5CC : 0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardX.toNumber(), y.toNumber(), cardWidth.toNumber(),
                cardHeight.toNumber(), (mUnit * 0.022).toNumber());
            if (isEnabled) {
                dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle((cardX + mUnit * 0.015).toNumber(),
                    (y + mUnit * 0.018).toNumber(), (mUnit * 0.009).toNumber(),
                    (cardHeight - mUnit * 0.036).toNumber(), (mUnit * 0.004).toNumber());
            }
            drawFit(dc, cardX + cardWidth * 0.39,
                y + (cardHeight * 0.27), mMetricLabels[index],
                cardWidth * 0.62, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
            drawFit(dc, cardX + cardWidth * 0.84,
                y + (cardHeight * 0.30), stateText,
                cardWidth * 0.25, Graphics.FONT_XTINY,
                isEnabled ? 0x00E5CC : Graphics.COLOR_LT_GRAY);
        }

        mControlTop = Math.round(mUnit * 0.70).toNumber();
        mControlBottom = Math.round(mUnit * 0.775).toNumber();
        var controlWidth = mUnit * 0.21;
        var controlHeight = mControlBottom - mControlTop;
        var centers = [cx - (mUnit * 0.25), cx, cx + (mUnit * 0.25)];
        var labels = ["HOCH", "GROESSE", "RUNTER"];
        for (var b = 0; b < 3; b += 1) {
            var left = centers[b] - (controlWidth / 2);
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(left.toNumber(), mControlTop,
                controlWidth.toNumber(), controlHeight.toNumber(), (mUnit * 0.02).toNumber());
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(left.toNumber(), mControlTop,
                controlWidth.toNumber(), controlHeight.toNumber(), (mUnit * 0.02).toNumber());
            drawFit(dc, centers[b], mControlTop + (controlHeight * 0.28),
                labels[b], controlWidth * 0.90, Graphics.FONT_XTINY,
                b == 1 ? 0x00E5CC : Graphics.COLOR_WHITE);
        }

        mSaveTop = Math.round(mUnit * 0.79).toNumber();
        mSaveBottom = Math.round(mUnit * 0.865).toNumber();
        var saveWidth = mKajoLayout.safeRectWidth(mSaveTop, mSaveBottom - mSaveTop, mUnit * 0.54);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle((cx - saveWidth / 2).toNumber(), mSaveTop,
            saveWidth.toNumber(), (mSaveBottom - mSaveTop).toNumber(),
            (mUnit * 0.025).toNumber());
        drawFit(dc, cx, mSaveTop + (mUnit * 0.022), "SPEICHERN",
            saveWidth * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
    }
}
