import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mSelectedBoat = "K1";
    var mPlannedSessions as Lang.Array<Lang.Dictionary> = [];
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;
    var mBoatTop = 0;
    var mBoatBottom = 0;
    var mBoatLeft = 0;
    var mBoatRight = 0;
    var mStartTop = 0;
    var mStartBottom = 0;
    var mMenuTop = 0;
    var mMenuBottom = 0;
    var mPlanStartY = 0;
    var mPlanRowHeight = 0;
    var mPlanStartIndex = 0;
    var mApi as KajoConnectApi;
    var mSyncStatus as Lang.String = "NICHT MIT KAJO VERBUNDEN";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    function initialize() {
        View.initialize();
        mApi = new KajoConnectApi();
        var cachedSessions = Storage.getValue("kajoPlannedSessions");
        if (cachedSessions != null) {
            mPlannedSessions = cachedSessions as Lang.Array<Lang.Dictionary>;
            if (mPlannedSessions.size() > 0) {
                mSyncStatus = "GESPEICHERTER TRAININGSPLAN";
            }
        }
    }

    function onShow() as Void {
        syncFromKajo();
    }

    function padDatePart(value as Lang.Number) as Lang.String {
        return value < 10 ? "0" + value.toString() : value.toString();
    }

    function getLocalDate() as Lang.String {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return info.year.toString() + "-" + padDatePart(info.month) + "-" + padDatePart(info.day);
    }

    function syncFromKajo() as Void {
        var token = Storage.getValue("kajoDeviceToken");
        if (token == null || token.toString().length() == 0) {
            mSyncStatus = mPlannedSessions.size() > 0
                ? "GESPEICHERTER TRAININGSPLAN"
                : "NICHT MIT KAJO VERBUNDEN";
            WatchUi.requestUpdate();
            return;
        }

        mSyncStatus = "KAJO SYNCHRONISIERT …";
        WatchUi.requestUpdate();
        mApi.postJson(
            mEndpoint,
            { "action" => "sync", "localDate" => getLocalDate() },
            token.toString(),
            method(:onSyncResponse)
        );
    }

    function onSyncResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        if (responseCode != 200 || data == null) {
            if (responseCode == 401) {
                Storage.setValue("kajoDeviceToken", "");
                mSyncStatus = "ZUGRIFF WIDERRUFEN – NEU KOPPELN";
            } else {
                mSyncStatus = mPlannedSessions.size() > 0
                    ? "OFFLINE · GESPEICHERTER PLAN"
                    : "KAJO NICHT ERREICHBAR";
            }
            WatchUi.requestUpdate();
            return;
        }

        var sessions = data["plannedSessions"];
        if (sessions != null) {
            mPlannedSessions = sessions as Lang.Array<Lang.Dictionary>;
            mPlanStartIndex = 0;
        } else {
            mPlannedSessions = [];
        }
        var cacheSaved = true;
        try {
            Storage.setValue("kajoPlannedSessions", mPlannedSessions);
        } catch (error) {
            cacheSaved = false;
        }

        var displayLayouts = data["displayLayouts"];
        if (displayLayouts != null) {
            var layouts = displayLayouts as Lang.Array<Lang.Dictionary>;
            // Immer alle drei Slots aktualisieren. So werden entfernte Datenseiten
            // auch auf der Uhr gelöscht und bleiben nicht als veralteter Cache bestehen.
            for (var layoutIndex = 0; layoutIndex < 3; layoutIndex += 1) {
                var metricIds = [];
                var metricSizes = {};
                var metricPositions = {};
                var largeMetricId = "";

                if (layoutIndex < layouts.size()) {
                    var layout = layouts[layoutIndex] as Lang.Dictionary;
                    var receivedMetrics = layout["metrics"];
                    if (receivedMetrics != null) {
                        var metrics = receivedMetrics as Lang.Array<Lang.Dictionary>;
                        for (var metricIndex = 0; metricIndex < metrics.size() && metricIndex < 4; metricIndex += 1) {
                            var metric = metrics[metricIndex] as Lang.Dictionary;
                            var metricIdValue = metric["id"];
                            if (metricIdValue == null) { continue; }
                            var metricId = metricIdValue.toString();
                            if (metricIds.indexOf(metricId) >= 0) { continue; }
                            var sizeValue = metric["size"];
                            var sizeText = sizeValue == null ? "medium" : sizeValue.toString();
                            var numericSize = sizeText == "small" ? 0 : sizeText == "large" ? 2 : 1;
                            var positionValue = metric["position"];
                            var positionNumber = positionValue == null ? metricIndex : positionValue as Lang.Number;
                            if (positionNumber < 0 || positionNumber > 4) { positionNumber = metricIndex; }
                            metricIds.add(metricId);
                            metricSizes[metricId] = numericSize;
                            metricPositions[metricId] = positionNumber;
                            if (numericSize == 2) { largeMetricId = metricId; }
                        }
                    }
                }

                try {
                    Storage.setValue("kajoCustomMetrics" + layoutIndex.toString(), metricIds);
                    Storage.setValue("kajoMetricSizes" + layoutIndex.toString(), metricSizes);
                    Storage.setValue("kajoMetricPositions" + layoutIndex.toString(), metricPositions);
                    Storage.setValue("kajoLargeMetricId" + layoutIndex.toString(), largeMetricId);
                    if (layoutIndex == 0) {
                        Storage.setValue("kajoCustomMetrics", metricIds);
                        Storage.setValue("kajoMetricSizes", metricSizes);
                        Storage.setValue("kajoLargeMetricId", largeMetricId);
                    }
                } catch (error) {
                    cacheSaved = false;
                }
            }
        }

        var zoneInfo = data["heartRateZones"];
        var zoneValues = [];
        if (zoneInfo != null) {
            var zoneDictionary = zoneInfo as Lang.Dictionary;
            var receivedZones = zoneDictionary["zones"];
            if (receivedZones != null) {
                zoneValues = receivedZones as Lang.Array<Lang.Number>;
            }
        }
        try {
            if (zoneValues.size() == 4) {
                for (var i = 0; i < 4; i += 1) {
                    Storage.setValue("kajoHeartRateZone" + i.toString(), zoneValues[i]);
                }
                Storage.setValue("kajoHeartRateZoneDate", getLocalDate());
            } else {
                for (var i = 0; i < 4; i += 1) {
                    Storage.setValue("kajoHeartRateZone" + i.toString(), 0);
                }
                Storage.setValue("kajoHeartRateZoneDate", "");
            }
        } catch (error) {
            cacheSaved = false;
        }

        mSyncStatus = cacheSaved ? "KAJO AKTUALISIERT" : "KAJO AKTUALISIERT · CACHE FEHLER";
        WatchUi.requestUpdate();
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_SMALL;
        }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_TINY;
        }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_XTINY;
        }
        return font;
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(x.toNumber(), y.toNumber(), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function setPlannedSessions(sessions as Lang.Array<Lang.Dictionary>) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {
        var count = mPlannedSessions.size();
        if (count <= 2) { return; }
        mPlanStartIndex += direction;
        if (mPlanStartIndex < 0) { mPlanStartIndex = 0; }
        if (mPlanStartIndex > count - 2) { mPlanStartIndex = count - 2; }
        WatchUi.requestUpdate();
    }

    function openActivityView(workout as Lang.Dictionary or Null) as Void {
        var activityView = new KajoConnectActivityView(mSelectedBoat);
        if (workout != null) {
            activityView.setSelectedWorkout(workout as Lang.Dictionary);
        }

        var storedZoneDate = Storage.getValue("kajoHeartRateZoneDate");
        if (storedZoneDate != null && storedZoneDate.toString() == getLocalDate()) {
            var zoneValues = [];
            var zonesValid = true;
            for (var zoneIndex = 0; zoneIndex < 4; zoneIndex += 1) {
                var zoneValue = Storage.getValue("kajoHeartRateZone" + zoneIndex.toString());
                if (zoneValue == null || (zoneValue as Lang.Number) <= 0) {
                    zonesValid = false;
                    break;
                }
                zoneValues.add(zoneValue as Lang.Number);
            }
            if (zonesValid) { activityView.setHeartRateZones(zoneValues); }
        }

        WatchUi.pushView(
            activityView,
            new KajoConnectActivityDelegate(activityView),
            WatchUi.SLIDE_UP
        );
    }

    function startActivity() as Void {
        var today = getLocalDate();
        var todaysSessions = [];
        for (var i = 0; i < mPlannedSessions.size(); i += 1) {
            var session = mPlannedSessions[i] as Lang.Dictionary;
            var sessionDate = session["date"];
            if (sessionDate != null && sessionDate.toString() == today) {
                todaysSessions.add(session);
            }
        }

        if (todaysSessions.size() > 1) {
            var selector = new KajoConnectWorkoutSelectView(todaysSessions, self);
            WatchUi.pushView(selector, new KajoConnectWorkoutSelectDelegate(selector), WatchUi.SLIDE_UP);
        } else if (todaysSessions.size() == 1) {
            openActivityView(todaysSessions[0] as Lang.Dictionary);
        } else {
            openActivityView(null);
        }
    }

    // Wird von der Auswahlansicht aufgerufen, nachdem eine Einheit angetippt wurde.
    function startActivityWithWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        openActivityView(workout);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) {
        // Die sichtbare MENUE-Beschriftung ist direkt antippbar.
        if (y >= mMenuTop && y <= mMenuBottom) {
            WatchUi.pushView(
                new Rez.Menus.MainMenu(),
                new KajoConnectMenuDelegate(),
                WatchUi.SLIDE_UP
            );
            return;
        }

        if (mPlannedSessions.size() > 0 &&
            y >= mPlanStartY &&
            y < mPlanStartY + (mPlanRowHeight * 2)) {
            var row = 0;
            if (y >= mPlanStartY + mPlanRowHeight) { row = 1; }
            var index = mPlanStartIndex + row;
            if (index < mPlannedSessions.size()) {
                var selectedSession = mPlannedSessions[index] as Lang.Dictionary;
                WatchUi.pushView(
                    new KajoConnectWorkoutView(selectedSession),
                    new KajoConnectWorkoutDelegate(),
                    WatchUi.SLIDE_UP
                );
                return;
            }
        }

        if (y >= mStartTop && y <= mStartBottom) {
            startActivity();
            return;
        }

        if (y >= mBoatTop && y <= mBoatBottom &&
            x >= mBoatLeft && x <= mBoatRight) {
            var relativeX = x - mBoatLeft;
            var third = (mBoatRight - mBoatLeft) / 3;
            if (relativeX < third) {
                mSelectedBoat = "K1";
            } else if (relativeX < (third * 2)) {
                mSelectedBoat = "C1";
            } else {
                mSelectedBoat = "C2";
            }
            WatchUi.requestUpdate();
            WatchUi.showToast(mSelectedBoat + " ausgewaehlt", null);
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }

        var cx = mWidth / 2;
        var scale = mUnit;

        // Die Inhalte bleiben in der zentralen, kreisförmig sicheren Displayzone.
        drawCentered(dc, cx, scale * 0.105, "KAJO", scale * 0.72, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, scale * 0.185, "HEUTE", scale * 0.68, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, scale * 0.215, mSyncStatus, scale * 0.74, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var sessionCount = mPlannedSessions.size();
        var activityLabelY = scale * 0.49;

        if (sessionCount > 0) {
            drawCentered(dc, cx, scale * 0.245, "TRAININGSPLAN", scale * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            mPlanStartY = scale * 0.285;
            mPlanRowHeight = scale * 0.092;

            var visibleCount = 2;
            if (sessionCount == 1) { visibleCount = 1; }

            for (var i = 0; i < visibleCount; i += 1) {
                var index = mPlanStartIndex + i;
                if (index < sessionCount) {
                    var rowY = mPlanStartY + (i * mPlanRowHeight);
                    var cardWidth = scale * 0.66;
                    var cardHeight = scale * 0.075;
                    var cardX = cx - (cardWidth / 2);
                    dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
                    dc.fillRoundedRectangle(cardX.toNumber(), rowY.toNumber(), cardWidth.toNumber(), cardHeight.toNumber(), (scale * 0.025).toNumber());
                    var session = mPlannedSessions[index] as Lang.Dictionary;
                    var sessionText = session["name"] == null ? "Geplante Einheit" : session["name"].toString();
                    drawCentered(
                        dc, cx,
                        rowY + (cardHeight - dc.getFontHeight(Graphics.FONT_TINY)) / 2,
                        sessionText,
                        cardWidth - (scale * 0.08),
                        Graphics.FONT_SMALL,
                        Graphics.COLOR_WHITE
                    );
                }
            }

            if (sessionCount > 2) {
                drawCentered(dc, cx, mPlanStartY + (2 * mPlanRowHeight),
                    "WEITERE EINHEITEN: WISCHEN", scale * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
            if (sessionCount == 1) {
                activityLabelY = scale * 0.49;
            } else {
                activityLabelY = scale * 0.515;
            }
        } else {
            drawCentered(dc, cx, scale * 0.30, "DEIN TRAINING", scale * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, scale * 0.36, "Noch keine Einheit angezeigt", scale * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        drawCentered(dc, cx, activityLabelY, "AKTIVITAET STARTEN", scale * 0.76, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        // Drei große, gleich breite Auswahlflächen mit ausreichend Abstand.
        var buttonGap = scale * 0.025;
        var buttonWidth = scale * 0.24;
        var buttonHeight = scale * 0.13;
        var totalWidth = (buttonWidth * 3) + (buttonGap * 2);
        var left = cx - (totalWidth / 2);
        var buttonY = scale * 0.575;

        mBoatTop = buttonY;
        mBoatBottom = buttonY + buttonHeight;
        mBoatLeft = left;
        mBoatRight = left + totalWidth;

        var labels = ["K1", "C1", "C2"];
        for (var b = 0; b < 3; b += 1) {
            var bx = left + (b * (buttonWidth + buttonGap));
            var selected = (labels[b] == mSelectedBoat);

            if (selected) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle(bx.toNumber(), buttonY.toNumber(), buttonWidth.toNumber(), buttonHeight.toNumber(), (scale * 0.035).toNumber());
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);
            } else {
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
                dc.drawRoundedRectangle(bx.toNumber(), buttonY.toNumber(), buttonWidth.toNumber(), buttonHeight.toNumber(), (scale * 0.035).toNumber());
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            }
        }

        // Start-Schaltfläche liegt oberhalb des unteren Kreisrandes.
        var startWidth = scale * 0.60;
        var startHeight = scale * 0.095;
        var startX = cx - (startWidth / 2);
        mStartTop = scale * 0.755;
        mStartBottom = mStartTop + startHeight;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(startX.toNumber(), mStartTop.toNumber(), startWidth.toNumber(), startHeight.toNumber(), (scale * 0.04).toNumber());
        drawCentered(dc, cx,
            mStartTop + (startHeight - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            "STARTEN", startWidth * 0.85, Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);

        mMenuTop = scale * 0.875;
        mMenuBottom = scale * 0.985;
        drawCentered(dc, cx, scale * 0.91, "MENUE", scale * 0.50, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
    }
}
