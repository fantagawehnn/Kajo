import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

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
    var mMenuStartIndex = 0;
    var mApi as KajoConnectApi;
    var mSyncStatus as Lang.String = "NICHT MIT KAJO VERBUNDEN";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
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
        return mKajoLayout.fitFont(dc, text, maxWidth, preferredFont);
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
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function setPlannedSessions(sessions as Lang.Array<Lang.Dictionary>) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {
        // Auf dem Startbildschirm wird die Trainingsliste vertikal weitergeschoben.
        mMenuStartIndex += direction;
        if (mMenuStartIndex < 0) { mMenuStartIndex = 0; }
        if (mMenuStartIndex > 1) { mMenuStartIndex = 1; }
        WatchUi.requestUpdate();
    }

    function openActivityView(workout as Lang.Dictionary or Null) as Void {
        var activityView = new KajoConnectActivityView(mSelectedBoat);
        if (workout != null) {
            activityView.setSelectedWorkout(workout as Lang.Dictionary);
        } else {
            activityView.setFreeActivity();
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
            showWorkoutDetails(todaysSessions[0] as Lang.Dictionary);
        } else {
            openActivityView(null);
        }
    }

    // Zeigt vor dem Aufzeichnen die Detailansicht der ausgewaehlten Einheit.
    function showWorkoutDetails(workout as Lang.Dictionary) as Void {
        var workoutView = new KajoConnectWorkoutView(workout, self);
        WatchUi.pushView(
            workoutView,
            new KajoConnectWorkoutDelegate(workoutView),
            WatchUi.SLIDE_UP
        );
    }

    // Startet die ausgewaehlte Einheit direkt aus ihrer Vorschau.
    function beginWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        openActivityView(workout);
    }

    // Wird von der Auswahlansicht aufgerufen, nachdem eine Einheit angetippt wurde.
    function startActivityWithWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        showWorkoutDetails(workout);
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
        // Die Sportart-/Bootsklasse bleibt direkt im Header waehlbar.
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
            return;
        }

        // Die gesamte Trainingskachel oeffnet den heutigen Trainingseinstieg.
        if (y >= mStartTop && y <= mStartBottom) {
            startActivity();
            return;
        }

        // Scrollbare Trainingsliste: Freies Training, Plan, Historie, Einstellungen.
        if (y >= mFreeTop && y <= mFreeBottom) {
            var row = Math.floor((y - mFreeTop) / (mUnit * 0.067)).toNumber();
            var index = mMenuStartIndex + row;
            if (index == 0) {
                openActivityView(null);
            } else if (index == 1) {
                var listView = new KajoConnectWorkoutListView(self);
                WatchUi.pushView(listView, new KajoConnectWorkoutListDelegate(listView), WatchUi.SLIDE_UP);
            } else if (index == 2) {
                WatchUi.showToast("Trainingshistorie ist noch nicht verfuegbar", null);
            } else if (index == 3) {
                var menuView = new KajoConnectMenuView(self);
                WatchUi.pushView(
                    menuView,
                    new KajoConnectMenuViewDelegate(menuView),
                    WatchUi.SLIDE_UP
                );
            }
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;
        var todaySessions = getTodaysSessions();

        // KAJO home: one clear header, one primary training action, four compact routes.
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle((mUnit * 0.105).toNumber(), (mUnit * 0.075).toNumber(),
            (mUnit * 0.035).toNumber(), (mUnit * 0.035).toNumber(), (mUnit * 0.012).toNumber());
        drawCentered(dc, cx, mUnit * 0.075, "KAJO", mUnit * 0.54,
            Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.132, compactSyncStatus(), mUnit * 0.60,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Boot class selector. The three equal tap zones remain easy to hit.
        mBoatTop = mUnit * 0.165;
        mBoatBottom = mUnit * 0.225;
        mBoatLeft = cx - (mUnit * 0.36);
        mBoatRight = cx + (mUnit * 0.36);
        var selectorY = mBoatTop;
        var selectorH = mBoatBottom - mBoatTop;
        var selectorW = mKajoLayout.safeRectWidth(selectorY, selectorH, mUnit * 0.72);
        var selectorX = cx - (selectorW / 2);
        dc.setColor(0x07191D, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(selectorX.toNumber(), selectorY.toNumber(),
            selectorW.toNumber(), selectorH.toNumber(), (mUnit * 0.025).toNumber());
        var classLabels = ["K1", "C1", "C2"];
        for (var b = 0; b < 3; b += 1) {
            var segmentX = selectorX + (selectorW * b / 3);
            var segmentWidth = selectorW / 3;
            if (classLabels[b] == mSelectedBoat) {
                dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle(segmentX.toNumber(), selectorY.toNumber(),
                    segmentWidth.toNumber(), selectorH.toNumber(), (mUnit * 0.022).toNumber());
            }
            drawCentered(dc, segmentX + (segmentWidth / 2),
                selectorY + (selectorH * 0.24), classLabels[b], segmentWidth * 0.86,
                Graphics.FONT_SMALL,
                classLabels[b] == mSelectedBoat ? Graphics.COLOR_BLACK : Graphics.COLOR_LT_GRAY);
        }

        // Today's session is the dominant action, with deliberately short copy.
        mStartTop = mUnit * 0.265;
        mStartBottom = mUnit * 0.465;
        var cardY = mStartTop;
        var cardH = mStartBottom - mStartTop;
        var cardW = mKajoLayout.safeRectWidth(cardY, cardH, mUnit * 0.82);
        var cardX = cx - (cardW / 2);
        dc.setColor(0x07191D, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(cardX.toNumber(), cardY.toNumber(), cardW.toNumber(),
            cardH.toNumber(), (mUnit * 0.045).toNumber());
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(cardX.toNumber(), (cardY + mUnit * 0.025).toNumber(),
            (mUnit * 0.012).toNumber(), (cardH - mUnit * 0.05).toNumber(),
            (mUnit * 0.006).toNumber());

        var heroName = "FREIES TRAINING";
        var heroDetails = "JETZT STARTEN";
        if (todaySessions.size() == 1) {
            var todayWorkout = todaySessions[0] as Lang.Dictionary;
            heroName = todayWorkout["name"] == null ? "GEPLANTES TRAINING" : todayWorkout["name"].toString();
            var durationText = todayWorkout["duration"] == null ? "" : todayWorkout["duration"].toString() + " MIN";
            var typeText = todayWorkout["type"] == null ? "TRAINING" : todayWorkout["type"].toString();
            heroDetails = durationText == "" ? typeText : durationText + "  /  " + typeText;
        } else if (todaySessions.size() > 1) {
            heroName = todaySessions.size().toString() + " TRAININGSEINHEITEN";
            heroDetails = "EINHEIT AUSWAEHLEN";
        }
        drawCentered(dc, cx, cardY + (mUnit * 0.052), "HEUTE", cardW * 0.78,
            Graphics.FONT_XTINY, 0x00E5CC);
        drawCentered(dc, cx, cardY + (mUnit * 0.092), heroName, cardW * 0.82,
            Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, cardY + (mUnit * 0.15), heroDetails, cardW * 0.82,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, cx, cardY + (mUnit * 0.177), "ANTIPPEN ZUM STARTEN",
            cardW * 0.82, Graphics.FONT_XTINY, 0x00E5CC);

        // Secondary navigation uses one consistent row height and matching hit areas.
        mFreeTop = mUnit * 0.515;
        mFreeBottom = mUnit * 0.825;
        var rowStep = mUnit * 0.073;
        var rowH = mUnit * 0.060;
        var labels = ["FREIES TRAINING", "TRAININGSPLAN", "HISTORIE", "EINSTELLUNGEN"];
        var hints = ["OHNE VORGABE", "GEPLANTE EINHEITEN", "BALD VERFUEGBAR", "ANZEIGE & UHR"];
        for (var row = 0; row < 4; row += 1) {
            var itemIndex = mMenuStartIndex + row;
            if (itemIndex >= labels.size()) { continue; }
            var rowY = mFreeTop + (row * rowStep);
            var rowWidth = mKajoLayout.safeRectWidth(rowY, rowH, mUnit * 0.76);
            var rowX = cx - (rowWidth / 2);
            dc.setColor(0x071316, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(rowX.toNumber(), rowY.toNumber(), rowWidth.toNumber(),
                rowH.toNumber(), (mUnit * 0.022).toNumber());
            dc.setColor(0x17343A, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(rowX.toNumber(), rowY.toNumber(), rowWidth.toNumber(),
                rowH.toNumber(), (mUnit * 0.022).toNumber());
            drawCentered(dc, rowX + rowWidth * 0.43, rowY + rowH * 0.17,
                labels[itemIndex], rowWidth * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, rowX + rowWidth * 0.43, rowY + rowH * 0.52,
                hints[itemIndex], rowWidth * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, rowX + rowWidth * 0.88, rowY + rowH * 0.28,
                ">", rowWidth * 0.12, Graphics.FONT_MEDIUM, 0x00E5CC);
        }
    }

}
