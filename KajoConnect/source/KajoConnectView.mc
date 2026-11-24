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
        WatchUi.requestUpdate();
    }

    function activateHomeSelection() as Void {
        if (mHomeSelection == 0) {
            startActivity();
        } else if (mHomeSelection == 1) {
            var listView = new KajoConnectWorkoutListView(self);
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
            var view = new KajoConnectWorkoutListView(self);
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

    function moveHomeSelection(direction as Lang.Number) as Void {
        mHomeSelection += direction;
        if (mHomeSelection < 0) { mHomeSelection = 2; }
        if (mHomeSelection > 2) { mHomeSelection = 0; }
        WatchUi.requestUpdate();
    }

    function setBoatClass(boatClass as Lang.String) as Void {
        if (boatClass != "K1" && boatClass != "C1" && boatClass != "C2") { return; }
        mSelectedBoat = boatClass;
        Storage.setValue("kajoSelectedBoat", mSelectedBoat);
        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y >= 48 && y <= 66 && x >= 54 && x <= 336) {
            var relativeX = x - 54;
            var third = 282 / 3;
            if (relativeX < third) { mSelectedBoat = "K1"; }
            else if (relativeX < (third * 2)) { mSelectedBoat = "C1"; }
            else { mSelectedBoat = "C2"; }
            Storage.setValue("kajoSelectedBoat", mSelectedBoat);
            WatchUi.requestUpdate();
            return;
        }
        if (y >= mStartTop && y <= mStartBottom) {
            mHomeSelection = 0;
            activateHomeSelection();
            return;
        }
        if (y >= mFreeTop && y <= mFreeBottom) {
            var row = Math.floor((y - mFreeTop) / mMenuRowStep).toNumber();
            if (row == 0) {
                mHomeSelection = 1;
                activateHomeSelection();
            } else if (row == 1) {
                mHomeSelection = 2;
                activateHomeSelection();
            }
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

        var todayLabel = "Kein Training geplant";
        var todayDetail = "Freies Training";
        if (todaySessions.size() == 1) {
            var workout = todaySessions[0] as Lang.Dictionary;
            todayLabel = workout["name"] == null ? "Geplantes Training" : workout["name"].toString();
            var duration = workout["duration"] == null ? "" : workout["duration"].toString();
            var type = workout["type"] == null ? "" : workout["type"].toString();
            todayDetail = duration == "" ? type : duration + " MIN · " + type;
        } else if (todaySessions.size() > 1) {
            todayLabel = todaySessions.size().toString() + " EINHEITEN HEUTE";
            todayDetail = "Training auswählen";
        }

        drawHomeText(dc, cx, 28, 250, 28, "KAJO", Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawHomeText(dc, cx, 55, 260, 16,
            mSelectedBoat + " · " + compactSyncStatus(),
            Graphics.FONT_XTINY, mSyncStatus == "KAJO AKTUALISIERT" ? 0x25D3CB : 0x98A5AB);

        var boatWidth = mKajoLayout.safeRectWidth(76, 30, mUnit * 0.72);
        var boatLeft = cx - (boatWidth / 2);
        dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
        dc.fillRectangle(boatLeft.toNumber(), 76, boatWidth.toNumber(), 30);
        drawHomeText(dc, cx, 83, boatWidth - 12, 16,
            "K1       C1       C2", Graphics.FONT_XTINY, 0x25D3CB);

        mStartTop = 118;
        mStartBottom = 218;
        var mainWidth = mKajoLayout.safeRectWidth(mStartTop, 94, mUnit * 0.82);
        var mainLeft = cx - (mainWidth / 2);
        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.fillRectangle(mainLeft.toNumber(), mStartTop, mainWidth.toNumber(), 94);
        drawHomeText(dc, cx, 135, mainWidth - 22, 24,
            "TRAINING STARTEN", Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);
        drawHomeText(dc, cx, 166, mainWidth - 22, 34,
            todayLabel, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
        drawHomeText(dc, cx, 194, mainWidth - 22, 14,
            todayDetail, Graphics.FONT_XTINY, Graphics.COLOR_BLACK);

        mFreeTop = 232;
        mFreeBottom = 332;
        mMenuRowStep = 52;
        var secondaryWidth = mKajoLayout.safeRectWidth(232, 94, mUnit * 0.82);
        var secondaryLeft = cx - (secondaryWidth / 2);
        for (var item = 0; item < 2; item += 1) {
            var top = 232 + (item * 52);
            var label = item == 0 ? "TRAININGSPLAN & SPEICHER" : "FREIES TRAINING";
            var detail = item == 0
                ? mPlannedSessions.size().toString() + " EINHEITEN GESPEICHERT"
                : "OHNE GEPLANTE EINHEIT";
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(secondaryLeft.toNumber(), top, secondaryWidth.toNumber(), 44);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(secondaryLeft.toNumber(), top, 3, 44);
            drawHomeText(dc, cx, top + 5, secondaryWidth - 18, 18,
                label, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            drawHomeText(dc, cx, top + 23, secondaryWidth - 18, 14,
                detail, Graphics.FONT_XTINY, 0x98A5AB);
        }
        drawHomeText(dc, cx, 344, 240, 16, "MENÜTASTE · EINSTELLUNGEN",
            Graphics.FONT_XTINY, 0x98A5AB);
    }

    }

}
