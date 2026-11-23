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
    var mFreeTop = 0;
    var mFreeBottom = 0;
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

    function compactSyncStatus() as Lang.String {
        if (mSyncStatus == "KAJO SYNCHRONISIERT …") { return "SYNC …"; }
        if (mSyncStatus == "KAJO AKTUALISIERT") { return "SYNC OK"; }
        if (mSyncStatus == "KAJO AKTUALISIERT · CACHE FEHLER") { return "SYNC-FEHLER"; }
        if (mSyncStatus == "ZUGRIFF WIDERRUFEN – NEU KOPPELN") { return "NEU KOPPELN"; }
        if (mSyncStatus == "KAJO NICHT ERREICHBAR" ||
            mSyncStatus == "OFFLINE · GESPEICHERTER PLAN") { return "OFFLINE"; }
        if (mSyncStatus == "GESPEICHERTER TRAININGSPLAN") { return "OFFLINE"; }
        if (mSyncStatus == "NICHT MIT KAJO VERBUNDEN") { return "NICHT VERBUNDEN"; }
        return "KAJO";
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
        var todaysSessions = getTodaysSessions();

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

    function getTodaysSessions() as Lang.Array<Lang.Dictionary> {
        var today = getLocalDate();
        var todaysSessions = [];
        for (var i = 0; i < mPlannedSessions.size(); i += 1) {
            var session = mPlannedSessions[i] as Lang.Dictionary;
            var sessionDate = session["date"];
            if (sessionDate != null && sessionDate.toString() == today) {
                var sessionType = session["type"];
                if (sessionType == null || sessionType.toString() != "RestDay") {
                    todaysSessions.add(session);
                }
            }
        }
        return todaysSessions;
    }

    function handleTap(x as Lang.Number, y as Lang.Number) {
        if (y >= mMenuTop && y <= mMenuBottom) {
            WatchUi.pushView(
                new Rez.Menus.MainMenu(),
                new KajoConnectMenuDelegate(),
                WatchUi.SLIDE_UP
            );
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
            return;
        }

        if (y >= mFreeTop && y <= mFreeBottom) {
            openActivityView(null);
            return;
        }

        if (y >= mStartTop && y <= mStartBottom) {
            startActivity();
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }

        var cx = mWidth / 2;
        var todaySessions = getTodaysSessions();
        var hasTrainingToday = todaySessions.size() > 0;

        // Kompakter Kopfbereich: Status ist bewusst nachrangig.
        drawCentered(dc, cx, mUnit * 0.075, "KAJO",
            mUnit * 0.68, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.145, compactSyncStatus(),
            mUnit * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var boatLabelY = mUnit * 0.43;
        var buttonY = mUnit * 0.49;
        var startY = mUnit * 0.665;
        var startLabel = "AKTIVITAET STARTEN";

        if (hasTrainingToday) {
            // Nur heutige Einheiten erscheinen auf dem Startbildschirm.
            var cardX = cx - (mUnit * 0.37);
            var cardY = mUnit * 0.205;
            var cardWidth = mUnit * 0.74;
            var cardHeight = mUnit * 0.185;
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardX.toNumber(), cardY.toNumber(),
                cardWidth.toNumber(), cardHeight.toNumber(), (mUnit * 0.035).toNumber());

            drawCentered(dc, cx, cardY + (mUnit * 0.022), "HEUTE GEPLANT",
                cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

            if (todaySessions.size() == 1) {
                var todayWorkout = todaySessions[0] as Lang.Dictionary;
                var workoutName = todayWorkout["name"] == null
                    ? "Geplantes Training" : todayWorkout["name"].toString();
                var workoutType = todayWorkout["type"] == null
                    ? "" : todayWorkout["type"].toString();
                var workoutDuration = todayWorkout["duration"] == null
                    ? "" : todayWorkout["duration"].toString();

                drawCentered(dc, cx, cardY + (mUnit * 0.072), workoutName,
                    cardWidth * 0.88, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

                var detail = workoutType;
                if (workoutDuration != "") {
                    detail = detail == "" ? workoutDuration + " MIN"
                        : detail + "  ·  " + workoutDuration + " MIN";
                }
                if (detail != "") {
                    drawCentered(dc, cx, cardY + (mUnit * 0.132), detail,
                        cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                }
            } else {
                drawCentered(dc, cx, cardY + (mUnit * 0.082),
                    todaySessions.size().toString() + " EINHEITEN",
                    cardWidth * 0.88, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
                drawCentered(dc, cx, cardY + (mUnit * 0.135),
                    "TRAINING AUSWAEHLEN",
                    cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }

            boatLabelY = mUnit * 0.455;
            buttonY = mUnit * 0.51;
            startY = mUnit * 0.68;
            startLabel = todaySessions.size() > 1
                ? "TRAINING AUSWAEHLEN" : "TRAINING STARTEN";
            mFreeTop = mUnit * 0.80;
            mFreeBottom = mUnit * 0.875;
            drawCentered(dc, cx, mUnit * 0.815, "FREIE AKTIVITAET",
                mUnit * 0.66, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else {
            // Ohne heutiges Training gibt es keine leere Trainingskarte und keinen Hinweistext.
            drawCentered(dc, cx, mUnit * 0.285, "BEREIT ZUM PADDELN?",
                mUnit * 0.76, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            boatLabelY = mUnit * 0.395;
            buttonY = mUnit * 0.455;
            startY = mUnit * 0.625;
            startLabel = "AKTIVITAET STARTEN";
            mFreeTop = -1;
            mFreeBottom = -1;
        }

        drawCentered(dc, cx, boatLabelY, "BOOTSKLASSE",
            mUnit * 0.58, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Drei klar getrennte, gleich breite Bootsauswahlfelder.
        var buttonGap = mUnit * 0.025;
        var buttonWidth = mUnit * 0.235;
        var buttonHeight = mUnit * 0.115;
        var totalWidth = (buttonWidth * 3) + (buttonGap * 2);
        var left = cx - (totalWidth / 2);

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
                dc.fillRoundedRectangle(bx.toNumber(), buttonY.toNumber(),
                    buttonWidth.toNumber(), buttonHeight.toNumber(),
                    (mUnit * 0.03).toNumber());
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);
            } else {
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
                dc.drawRoundedRectangle(bx.toNumber(), buttonY.toNumber(),
                    buttonWidth.toNumber(), buttonHeight.toNumber(),
                    (mUnit * 0.03).toNumber());
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            }
        }

        var startWidth = mUnit * 0.66;
        var startHeight = mUnit * 0.105;
        var startX = cx - (startWidth / 2);
        mStartTop = startY;
        mStartBottom = startY + startHeight;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(startX.toNumber(), startY.toNumber(),
            startWidth.toNumber(), startHeight.toNumber(), (mUnit * 0.035).toNumber());
        drawCentered(dc, cx,
            startY + (startHeight - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            startLabel, startWidth * 0.90, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);

        mMenuTop = mUnit * 0.91;
        mMenuBottom = mUnit * 0.985;
        drawCentered(dc, cx, mUnit * 0.93, "MENUE",
            mUnit * 0.48, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
