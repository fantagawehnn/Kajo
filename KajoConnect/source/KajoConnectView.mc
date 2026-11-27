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
    var mStandardWorkouts as Lang.Array<Lang.Dictionary> = [];
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;
    var mBoatTop = 0;
    var mBoatBottom = 0;
    var mBoatLeft = 0;
    var mBoatRight = 0;
    var mStartTop = 0;
    var mStartBottom = 0;
    var mStartLeft = 0;
    var mStartRight = 0;
    var mSecondaryLeft = 0;
    var mSecondaryRight = 0;
    var mFreeTop = 0;
    var mFreeBottom = 0;
    var mPlanTop = 0;
    var mPlanBottom = 0;
    var mFreeTrainingTop = 0;
    var mFreeTrainingBottom = 0;
    var mMenuTop = 0;
    var mMenuBottom = 0;
    var mPlanStartY = 0;
    var mPlanRowHeight = 0;
    var mPlanStartIndex = 0;
    var mMenuStartIndex = 0;
    var mMenuRowStep as Lang.Number = 32;
    var mMenuRowCount as Lang.Number = 3;
    var mHomeSelection as Lang.Number = 0;
    var mApi as KajoConnectApi;
    var mSyncStatus as Lang.String = "NICHT MIT KAJO VERBUNDEN";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mApi = new KajoConnectApi();
        var savedBoat = Storage.getValue("kajoSelectedBoat");
        if (savedBoat != null &&
            (savedBoat.toString() == "K1" || savedBoat.toString() == "C1" || savedBoat.toString() == "C2")) {
            mSelectedBoat = savedBoat.toString();
        }
        var cachedStandardWorkouts = Storage.getValue("kajoStandardWorkouts");
        if (cachedStandardWorkouts != null) { mStandardWorkouts = cachedStandardWorkouts as Lang.Array<Lang.Dictionary>; }
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

        var standardWorkouts = data["standardWorkouts"];
        if (standardWorkouts != null) {
            mStandardWorkouts = standardWorkouts as Lang.Array<Lang.Dictionary>;
        } else {
            mStandardWorkouts = [];
        }
        try {
            Storage.setValue("kajoStandardWorkouts", mStandardWorkouts);
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
        if (mSyncStatus == "NICHT MIT KAJO VERBUNDEN") { return "OFFLINE"; }
        return "KAJO";
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }


    function drawHomeText(dc as Dc, x as Lang.Number, top as Lang.Number,
        width as Lang.Number, height as Lang.Number, text as Lang.String,
        preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextBox(dc, x, top, width, height, text, preferredFont, color);
    }

    function setPlannedSessions(sessions as Lang.Array<Lang.Dictionary>) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction as Lang.Number) as Void {
        mHomeSelection += direction;
        if (mHomeSelection < 0) { mHomeSelection = 2; }
        if (mHomeSelection > 2) { mHomeSelection = 0; }
        if (getTodaysSessions().size() == 0 && mHomeSelection == 0) {
            mHomeSelection = direction >= 0 ? 1 : 2;
        }
        WatchUi.requestUpdate();
    }

    function activateHomeSelection() as Void {
        if (mHomeSelection == 0) {
            if (getTodaysSessions().size() > 0) {
                startActivity();
            } else {
                // Ohne geplante Einheit ist die primäre Startaktion freies Training.
                openActivityView(null);
            }
        } else if (mHomeSelection == 1) {
            var listView = new KajoConnectWorkoutListView(self, null, "TRAININGS", "EINHEITEN");
            WatchUi.pushView(listView, new KajoConnectWorkoutListDelegate(listView), WatchUi.SLIDE_UP);
        } else {
            openActivityView(null);
        }
    }

    function openSettings() as Void {
        var menuView = new KajoConnectMenuView(self);
        WatchUi.pushView(menuView, new KajoConnectMenuViewDelegate(self), WatchUi.SLIDE_UP);
    }

    function openSettingsItem(identifier as Lang.String) as Void {
        if (identifier == "training_fields") {
            var view = new KajoConnectTrainingFieldsView();
            WatchUi.pushView(view, new KajoConnectTrainingFieldsDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "display_pages") {
            var view = new KajoConnectDisplayConfigView();
            WatchUi.pushView(view, new KajoConnectDisplayConfigDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "training_overview") {
            var view = new KajoConnectWorkoutListView(self, null, "TRAININGS", "EINHEITEN GESPEICHERT");
            WatchUi.pushView(view, new KajoConnectWorkoutListDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "history") {
            var view = new KajoConnectHistoryView();
            WatchUi.pushView(view, new KajoConnectHistoryDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "interval_hints") {
            var view = new KajoConnectIntervalHintsView();
            WatchUi.pushView(view, new KajoConnectIntervalHintsDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "boat_class") {
            var view = new KajoConnectBoatClassView(self);
            WatchUi.pushView(view, new KajoConnectBoatClassDelegate(view), WatchUi.SLIDE_UP);
        } else if (identifier == "units") {
            var view = new KajoConnectUnitsView();
            WatchUi.pushView(view, new KajoConnectUnitsDelegate(), WatchUi.SLIDE_UP);
        } else if (identifier == "pairing") {
            var view = new KajoConnectPairingView();
            WatchUi.pushView(view, new KajoConnectPairingDelegate(), WatchUi.SLIDE_UP);
        } else if (identifier == "custom_fields") {
            var view = new KajoConnectCustomFieldsView();
            WatchUi.pushView(view, new KajoConnectCustomFieldsDelegate(view), WatchUi.SLIDE_UP);
        }
    }

    function getPlannedSessions() as Lang.Array<Lang.Dictionary> {
        return mPlannedSessions;
    }

    function getStandardWorkouts() as Lang.Array<Lang.Dictionary> {
        return mStandardWorkouts;
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

        // Der Start auf dem Home-Bildschirm soll die Aktivität direkt beginnen.
        activityView.startRecording();
    }

    function startActivity() as Void {
        var todaysSessions = getTodaysSessions();

        if (todaysSessions.size() > 1) {
            var selector = new KajoConnectWorkoutListView(self, todaysSessions, "HEUTE WÄHLEN", "EINHEITEN HEUTE");
            WatchUi.pushView(selector, new KajoConnectWorkoutListDelegate(selector), WatchUi.SLIDE_UP);
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

    function moveHomeSelection(direction as Lang.Number) as Void {
        mHomeSelection += direction;
        if (mHomeSelection < 0) { mHomeSelection = 2; }
        if (mHomeSelection > 2) { mHomeSelection = 0; }
        if (getTodaysSessions().size() == 0 && mHomeSelection == 0) {
            mHomeSelection = direction >= 0 ? 1 : 2;
        }
        WatchUi.requestUpdate();
    }

    function cycleBoatClass() as Void {
        if (mSelectedBoat == "K1") {
            mSelectedBoat = "C1";
        } else if (mSelectedBoat == "C1") {
            mSelectedBoat = "C2";
        } else {
            mSelectedBoat = "K1";
        }
        Storage.setValue("kajoSelectedBoat", mSelectedBoat);
        WatchUi.requestUpdate();
    }

    function setBoatClass(boatClass as Lang.String) as Void {
        if (boatClass != "K1" && boatClass != "C1" && boatClass != "C2") { return; }
        mSelectedBoat = boatClass;
        Storage.setValue("kajoSelectedBoat", mSelectedBoat);
        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        // Bootsklasse direkt im Kopfbereich weiterschalten.
        if (y >= mBoatTop && y <= mBoatBottom &&
            x >= mBoatLeft && x <= mBoatRight) {
            cycleBoatClass();
            return;
        }

        if (mStartLeft > 0 && x >= mStartLeft && x <= mStartRight &&
            y >= mStartTop && y <= mStartBottom) {
            mHomeSelection = 0;
            activateHomeSelection();
            return;
        }

        if (x >= mSecondaryLeft && x <= mSecondaryRight &&
            y >= mPlanTop && y <= mPlanBottom) {
            mHomeSelection = 1;
            activateHomeSelection();
            return;
        }

        if (x >= mSecondaryLeft && x <= mSecondaryRight &&
            y >= mFreeTrainingTop && y <= mFreeTrainingBottom) {
            mHomeSelection = 2;
            activateHomeSelection();
        }
    }

    function onUpdate(dc as Dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);

        var cx = mWidth / 2;
        var todaySessions = getTodaysSessions();
        var mainWidth = mKajoLayout.safeRectWidth(92, 86, mUnit * 0.82);
        var mainLeft = cx - (mainWidth / 2);

        // Kopfbereich mit direkt antippbarer Bootsklasse.
        drawHomeText(dc, cx, 20, 220, 28, "KAJO",
            Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        // Großzügige Touch-Fläche für die Bootsklasse:
        // Die gesamte Kopfzeile ist antippbar, nicht nur der Text selbst.
        mBoatTop = 40;
        mBoatBottom = 92;
        mBoatLeft = 0;
        mBoatRight = mWidth;
        drawHomeText(dc, cx, 51, mUnit * 0.68, 24,
            mSelectedBoat, Graphics.FONT_SMALL, 0x25D3CB);

        dc.setColor(0x344047, Graphics.COLOR_BLACK);
        dc.drawLine(
            (cx - (mUnit * 0.39)).toNumber(),
            87,
            (cx + (mUnit * 0.39)).toNumber(),
            87
        );

        // Tagesbereich: nur bei vorhandener Einheit als Startfläche.
        mStartTop = 96;
        mStartBottom = 178;
        if (todaySessions.size() == 0) {
            mStartLeft = 0;
            mStartRight = 0;
            drawHomeText(dc, cx, 119, mainWidth, 30,
                "Kein Training geplant", Graphics.FONT_SMALL, 0x98A5AB);
        } else {
            mStartLeft = mainLeft;
            mStartRight = mainLeft + mainWidth;

            var workoutName = "";
            var workoutDetail = "";
            if (todaySessions.size() == 1) {
                var workout = todaySessions[0] as Lang.Dictionary;
                workoutName = workout["name"] == null
                    ? "Geplantes Training" : workout["name"].toString();
                var duration = workout["duration"] == null
                    ? "" : workout["duration"].toString();
                var type = workout["type"] == null
                    ? "" : workout["type"].toString();
                workoutDetail = duration == "" ? type : duration + " min · " + type;
            } else {
                workoutName = todaySessions.size().toString() + " Einheiten heute";
                workoutDetail = "Training auswählen";
            }

            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(mainLeft.toNumber(), 105, 3, 58);
            drawHomeText(dc, cx + 8, 106, mainWidth - 24, 27,
                workoutName, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawHomeText(dc, cx + 8, 137, mainWidth - 24, 22,
                workoutDetail, Graphics.FONT_XTINY, 0x98A5AB);
        }

        // Trennlinie oberhalb der beiden Menüeinträge.
        dc.setColor(0x344047, Graphics.COLOR_BLACK);
        dc.drawLine(cx - (mUnit * 0.39), 185, cx + (mUnit * 0.39), 185);

        mPlanTop = 197;
        mPlanBottom = 246;
        mFreeTrainingTop = 253;
        mFreeTrainingBottom = 302;
        var rowWidth = mKajoLayout.safeRectWidth(
            mPlanTop, mFreeTrainingBottom - mPlanTop, mUnit * 0.80
        );
        var rowLeft = cx - (rowWidth / 2);
        mSecondaryLeft = rowLeft;
        mSecondaryRight = rowLeft + rowWidth;

        // Trainingsdatenbank – absichtlich ohne Navigationspfeil.
        dc.setColor(mHomeSelection == 1 ? 0x25D3CB : 0x98A5AB, Graphics.COLOR_BLACK);
        dc.fillCircle(rowLeft.toNumber() + 19, 221, 10);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.fillCircle(rowLeft.toNumber() + 19, 221, 5);
        drawHomeText(dc, cx + 12, 207, rowWidth - 48, 30,
            "Trainings", Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        dc.setColor(0x344047, Graphics.COLOR_BLACK);
        dc.drawLine(rowLeft.toNumber(), 249, (rowLeft + rowWidth).toNumber(), 249);

        // Freies Training.
        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.fillCircle(rowLeft.toNumber() + 19, 278, 11);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.drawLine(rowLeft.toNumber() + 16, 271, rowLeft.toNumber() + 25, 278);
        dc.drawLine(rowLeft.toNumber() + 25, 278, rowLeft.toNumber() + 16, 285);
        dc.drawLine(rowLeft.toNumber() + 16, 285, rowLeft.toNumber() + 16, 271);
        drawHomeText(dc, cx + 12, 264, rowWidth - 48, 30,
            "Freies Training", Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        // Touch-Ziele entsprechen den sichtbaren Zeilen.
        mPlanTop = 197;
        mPlanBottom = 246;
        mFreeTrainingTop = 253;
        mFreeTrainingBottom = 302;
    }
}
