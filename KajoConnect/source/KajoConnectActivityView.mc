import Toybox.Activity;
import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

class KajoConnectActivityView extends WatchUi.View {

    var mBoatClass as Lang.String;
    var mEngine;
    var mTimer;
    var mStatus = "BEREIT";
    var mButtonTop = 0;
    var mButtonBottom = 0;
    var mScreenWidth = 0;
    var mScreenHeight = 0;
    var mUnit = 0;
    var mPage = 0;
    var mPageCount = 5;
    var mEnabledPageIds as Lang.Array<Lang.Number> = [0, 1, 2, 3, 4];
    var mCurrentPageId = 0;
    var mCustomMetricIds as Lang.Array<Lang.String> = [];
    var mCustomMetricIds1 as Lang.Array<Lang.String> = [];
    var mCustomMetricIds2 as Lang.Array<Lang.String> = [];
    var mLargeMetricId as Lang.String = "";
    var mLargeMetricId1 as Lang.String = "";
    var mLargeMetricId2 as Lang.String = "";
    var mCustomMetricSizes0 as Lang.Dictionary = {};
    var mCustomMetricSizes1 as Lang.Dictionary = {};
    var mCustomMetricSizes2 as Lang.Dictionary = {};
    var mCustomMetricPositions0 as Lang.Dictionary = {};
    var mCustomMetricPositions1 as Lang.Dictionary = {};
    var mCustomMetricPositions2 as Lang.Dictionary = {};
    var mCustomPageCount as Lang.Number = 0;
    // KAJO liefert die vier oberen Zonengrenzen; die Uhr berechnet keine eigenen Zonen.
    var mHeartRateZones as Lang.Array<Lang.Number> = [];
    var mCurrentWorkoutState as Lang.String = "FREE";
    var mCurrentWorkoutName as Lang.String = "FREIES TRAINING";
    var mCurrentWorkoutType as Lang.String = "";
    var mCurrentWorkoutDuration as Lang.String = "";
    var mCurrentWorkoutDescription as Lang.String = "";
    var mCurrentWorkoutIntensity as Lang.String = "";
    var mCurrentWorkoutMainSet as Lang.String = "";

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
        loadDisplayPages();
        loadCurrentWorkout();
    }

    function compactWorkoutText(value as Lang.String, maxLength as Lang.Number) as Lang.String {
        if (value.length() <= maxLength) { return value; }
        if (maxLength <= 3) { return value.substring(0, maxLength); }
        return value.substring(0, maxLength - 3) + "...";
    }

    function setSelectedWorkout(workout as Lang.Dictionary) as Void {
        mCurrentWorkoutState = "PLANNED";
        mCurrentWorkoutName = workout["name"] == null ? "GEPLANTE EINHEIT" : workout["name"].toString();
        mCurrentWorkoutType = workout["type"] == null ? "" : workout["type"].toString();
        mCurrentWorkoutDuration = workout["duration"] == null ? "" : workout["duration"].toString();
        mCurrentWorkoutDescription = workout["desc"] == null ? "" : workout["desc"].toString();
        mCurrentWorkoutIntensity = workout["intensity"] == null ? "" : workout["intensity"].toString();
        mCurrentWorkoutMainSet = workout["mainSet"] == null ? "" : workout["mainSet"].toString();
    }

    function loadCurrentWorkout() as Void {
        var sessions = Storage.getValue("kajoPlannedSessions");
        mCurrentWorkoutState = "FREE";
        mCurrentWorkoutName = "FREIES TRAINING";
        mCurrentWorkoutType = "";
        mCurrentWorkoutDuration = "";
        mCurrentWorkoutDescription = "";
        mCurrentWorkoutIntensity = "";
        mCurrentWorkoutMainSet = "";
        if (sessions == null) { return; }

        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var today = info.year.toString() + "-" +
            (info.month < 10 ? "0" : "") + info.month.toString() + "-" +
            (info.day < 10 ? "0" : "") + info.day.toString();
        var planned = sessions as Lang.Array<Lang.Dictionary>;
        var todayIndex = -1;
        var todayCount = 0;

        for (var i = 0; i < planned.size(); i += 1) {
            var session = planned[i] as Lang.Dictionary;
            var sessionDate = session["date"];
            if (sessionDate != null && sessionDate.toString() == today) {
                todayCount += 1;
                todayIndex = i;
            }
        }

        if (todayCount == 0) { return; }
        if (todayCount > 1) {
            mCurrentWorkoutState = "MULTIPLE";
            mCurrentWorkoutName = "MEHRERE EINHEITEN";
            return;
        }

        mCurrentWorkoutState = "PLANNED";
        var selected = planned[todayIndex] as Lang.Dictionary;
        if (selected["name"] != null) { mCurrentWorkoutName = selected["name"].toString(); }
        if (selected["type"] != null) { mCurrentWorkoutType = selected["type"].toString(); }
        if (selected["duration"] != null) { mCurrentWorkoutDuration = selected["duration"].toString(); }
        if (selected["desc"] != null) { mCurrentWorkoutDescription = selected["desc"].toString(); }
        if (selected["intensity"] != null) { mCurrentWorkoutIntensity = selected["intensity"].toString(); }
        if (selected["mainSet"] != null) { mCurrentWorkoutMainSet = selected["mainSet"].toString(); }
    }

    function loadDisplayPages() as Void {
        mEnabledPageIds = [];
        for (var i = 0; i < 5; i += 1) {
            var savedValue = Storage.getValue("kajoDisplayPage" + i.toString());
            if (savedValue == null || (savedValue as Lang.Boolean)) {
                mEnabledPageIds.add(i);
            }
        }
        if (mEnabledPageIds.size() == 0) { mEnabledPageIds = [0]; }
        mCustomMetricIds = loadCustomMetricIds(0);
        mCustomMetricIds1 = loadCustomMetricIds(1);
        mCustomMetricIds2 = loadCustomMetricIds(2);
        mLargeMetricId = loadLargeMetricId(0, mCustomMetricIds);
        mLargeMetricId1 = loadLargeMetricId(1, mCustomMetricIds1);
        mLargeMetricId2 = loadLargeMetricId(2, mCustomMetricIds2);
        mCustomMetricSizes0 = loadMetricSizes(0, mCustomMetricIds, mLargeMetricId);
        mCustomMetricSizes1 = loadMetricSizes(1, mCustomMetricIds1, mLargeMetricId1);
        mCustomMetricSizes2 = loadMetricSizes(2, mCustomMetricIds2, mLargeMetricId2);
        mCustomMetricPositions0 = loadMetricPositions(0, mCustomMetricIds);
        mCustomMetricPositions1 = loadMetricPositions(1, mCustomMetricIds1);
        mCustomMetricPositions2 = loadMetricPositions(2, mCustomMetricIds2);
        mCustomPageCount = 0;
        if (mCustomMetricIds.size() > 0) { mCustomPageCount += 1; }
        if (mCustomMetricIds1.size() > 0) { mCustomPageCount += 1; }
        if (mCustomMetricIds2.size() > 0) { mCustomPageCount += 1; }
        mPageCount = mEnabledPageIds.size() + mCustomPageCount;
        mPage = 0;
    }

    function loadCustomMetricIds(layoutIndex as Lang.Number) as Lang.Array<Lang.String> {
        var savedMetrics = Storage.getValue("kajoCustomMetrics" + layoutIndex.toString());
        if (savedMetrics == null && layoutIndex == 0) {
            savedMetrics = Storage.getValue("kajoCustomMetrics");
        }
        if (savedMetrics == null) { return []; }
        return savedMetrics as Lang.Array<Lang.String>;
    }

    function loadMetricPositions(layoutIndex as Lang.Number, metrics as Lang.Array<Lang.String>) as Lang.Dictionary {
        var saved = Storage.getValue("kajoMetricPositions" + layoutIndex.toString());
        var positions = {};
        if (saved != null) { positions = saved as Lang.Dictionary; }
        var defaults = metrics.size() == 1 ? [4]
            : metrics.size() == 2 ? [0, 1]
            : metrics.size() == 3 ? [0, 1, 4] : [0, 1, 2, 3];
        var used = [];
        for (var i = 0; i < metrics.size() && i < 4; i += 1) {
            var metricId = metrics[i];
            var savedPosition = positions[metricId];
            var position = savedPosition == null ? defaults[i] : savedPosition as Lang.Number;
            if (position < 0 || position > 4 || used.indexOf(position) >= 0) {
                position = defaults[i];
            }
            if (used.indexOf(position) >= 0) {
                for (var candidate = 0; candidate <= 4; candidate += 1) {
                    if (used.indexOf(candidate) < 0) { position = candidate; break; }
                }
            }
            positions[metricId] = position;
            used.add(position);
        }
        return positions;
    }

    function getCustomMetricPositions(layoutIndex as Lang.Number) as Lang.Dictionary {
        if (layoutIndex == 0) { return mCustomMetricPositions0; }
        if (layoutIndex == 1) { return mCustomMetricPositions1; }
        return mCustomMetricPositions2;
    }

    function loadLargeMetricId(layoutIndex as Lang.Number, metrics as Lang.Array<Lang.String>) as Lang.String {
        var savedLarge = Storage.getValue("kajoLargeMetricId" + layoutIndex.toString());
        if (savedLarge == null && layoutIndex == 0) {
            savedLarge = Storage.getValue("kajoLargeMetricId");
        }
        if (savedLarge != null && metrics.indexOf(savedLarge.toString()) >= 0) {
            return savedLarge.toString();
        }
        return "";
    }

    function loadMetricSizes(layoutIndex as Lang.Number, metrics as Lang.Array<Lang.String>,
        legacyLargeMetricId as Lang.String) as Lang.Dictionary {
        var sizes = {};
        var savedSizes = Storage.getValue("kajoMetricSizes" + layoutIndex.toString());
        if (savedSizes == null && layoutIndex == 0) {
            savedSizes = Storage.getValue("kajoMetricSizes");
        }
        if (savedSizes != null) { sizes = savedSizes as Lang.Dictionary; }
        for (var i = 0; i < metrics.size(); i += 1) {
            var metricId = metrics[i];
            if (sizes[metricId] == null) {
                sizes[metricId] = metricId == legacyLargeMetricId ? 2 : 1;
            }
        }
        return sizes;
    }

    function getCustomMetricSizes(layoutIndex as Lang.Number) as Lang.Dictionary {
        if (layoutIndex == 0) { return mCustomMetricSizes0; }
        if (layoutIndex == 1) { return mCustomMetricSizes1; }
        return mCustomMetricSizes2;
    }

    function getMetricSize(metricId as Lang.String, sizes as Lang.Dictionary) as Lang.Number {
        var size = sizes[metricId];
        if (size == null) { return 1; }
        return size as Lang.Number;
    }

    function getMetricFont(size as Lang.Number) {
        if (size == 0) { return Graphics.FONT_SMALL; }
        if (size == 2) { return Graphics.FONT_LARGE; }
        return Graphics.FONT_MEDIUM;
    }

    function getCustomMetricIds(layoutIndex as Lang.Number) as Lang.Array<Lang.String> {
        if (layoutIndex == 0) { return mCustomMetricIds; }
        if (layoutIndex == 1) { return mCustomMetricIds1; }
        return mCustomMetricIds2;
    }

    function getLargeMetricId(layoutIndex as Lang.Number) as Lang.String {
        if (layoutIndex == 0) { return mLargeMetricId; }
        if (layoutIndex == 1) { return mLargeMetricId1; }
        return mLargeMetricId2;
    }

    // Übernimmt die von KAJO berechneten Grenzen (obere Grenze Z1 bis Z4).
    function setHeartRateZones(zones as Lang.Array<Lang.Number>) as Void {
        if (zones.size() != 4) {
            mHeartRateZones = [];
            WatchUi.requestUpdate();
            return;
        }

        for (var i = 1; i < zones.size(); i += 1) {
            if (zones[i] <= zones[i - 1]) {
                mHeartRateZones = [];
                WatchUi.requestUpdate();
                return;
            }
        }

        mHeartRateZones = zones;
        WatchUi.requestUpdate();
    }

    function getCurrentHeartRateZone(heartRate) as Lang.Number {
        if (heartRate == null || heartRate <= 0 || mHeartRateZones.size() != 4) {
            return 0;
        }

        for (var i = 0; i < 4; i += 1) {
            if (heartRate <= mHeartRateZones[i]) {
                return i + 1;
            }
        }
        return 5;
    }

    function getCustomMetricLabel(metricId as Lang.String) as Lang.String {
        if (metricId == "speedNow") { return "GESCHWINDIGKEIT"; }
        if (metricId == "speedAvg") { return "DURCHSCHNITTSTEMPO"; }
        if (metricId == "speedMax") { return "MAXIMALGESCHWINDIGKEIT"; }
        if (metricId == "heartRate") { return "HERZFREQUENZ"; }
        if (metricId == "heartRateZone") { return "HF-ZONE"; }
        if (metricId == "heartRateAvg") { return "HF DURCHSCHNITT"; }
        if (metricId == "heartRateMax") { return "HF MAXIMUM"; }
        if (metricId == "distance") { return "DISTANZ"; }
        if (metricId == "elapsed") { return "ZEIT"; }
        if (metricId == "calories") { return "KALORIEN"; }
        if (metricId == "cadence") { return "KADENZ"; }
        if (metricId == "power") { return "LEISTUNG"; }
        if (metricId == "trainingEffect") { return "TRAINING EFFECT"; }
        if (metricId == "altitude") { return "HOEHE"; }
        if (metricId == "ascent") { return "ANSTIEG"; }
        if (metricId == "descent") { return "ABSTIEG"; }
        if (metricId == "gpsAccuracy") { return "GPS-QUALITAET"; }
        return "GPS-QUALITAET";
    }

    function getCustomMetricValue(metricId as Lang.String, values as Lang.Dictionary) as Lang.String {
        var value = values[metricId];
        return value == null ? "--" : value.toString();
    }

    function getCustomMetricUnit(metricId as Lang.String) as Lang.String {
        if (metricId == "speedNow" || metricId == "speedAvg" || metricId == "speedMax") { return "KM/H"; }
        if (metricId == "heartRate" || metricId == "heartRateAvg" || metricId == "heartRateMax") { return "BPM"; }
        if (metricId == "distance") { return "KM"; }
        if (metricId == "calories") { return "KCAL"; }
        if (metricId == "cadence") { return "RPM"; }
        if (metricId == "power") { return "W"; }
        if (metricId == "altitude" || metricId == "ascent" || metricId == "descent") { return "M"; }
        return "";
    }

    function drawCustomMetric(dc as Dc, cx, metricId as Lang.String, values as Lang.Dictionary,
        x, y, width, valueFont) as Void {
        var label = getCustomMetricLabel(metricId);
        var value = getCustomMetricValue(metricId, values);
        var unit = getCustomMetricUnit(metricId);
        drawMetric(dc, x, y, label, value, unit, width, valueFont);
    }

    function drawCustomMetricPage(dc as Dc, cx, values as Lang.Dictionary,
        metricIds as Lang.Array<Lang.String>, metricSizes as Lang.Dictionary,
        metricPositions as Lang.Dictionary, pageTitle as Lang.String) as Void {
        drawPageHeader(dc, pageTitle);

        for (var i = 0; i < metricIds.size() && i < 4; i += 1) {
            var metricId = metricIds[i];
            var position = metricPositions[metricId];
            if (position == null) { position = i; }

            var x = mScreenWidth * 0.29;
            var y = mUnit * 0.33;
            var slotWidth = mUnit * 0.39;

            if (position == 1 || position == 3) { x = mScreenWidth * 0.71; }
            if (position == 2 || position == 3) { y = mUnit * 0.59; }
            if (position == 4) {
                x = cx;
                y = mUnit * 0.59;
                slotWidth = mUnit * 0.68;
            }

            var fieldSize = getMetricSize(metricId, metricSizes);
            var tileWidth = slotWidth;
            var tileHeight = mUnit * 0.22;
            var valueFont = Graphics.FONT_MEDIUM;

            if (fieldSize == 0) {
                tileWidth = slotWidth * 0.86;
                tileHeight = mUnit * 0.18;
                valueFont = Graphics.FONT_SMALL;
            } else if (fieldSize == 2) {
                tileWidth = position == 4 ? slotWidth : slotWidth * 1.04;
                tileHeight = mUnit * 0.24;
                valueFont = Graphics.FONT_LARGE;
            }

            var tileTop = y - (mUnit * 0.055);
            drawDashboardPanel(dc, x - (tileWidth / 2), tileTop, tileWidth, tileHeight);

            var label = getCustomMetricLabel(metricId);
            var value = getCustomMetricValue(metricId, values);
            var unit = getCustomMetricUnit(metricId);
            drawFit(dc, x, tileTop + (mUnit * 0.018), label, tileWidth * 0.88,
                Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawFit(dc, x, tileTop + (mUnit * 0.065), value, tileWidth * 0.88,
                valueFont, Graphics.COLOR_WHITE);
            if (unit != "") {
                drawFit(dc, x, tileTop + (mUnit * 0.145), unit, tileWidth * 0.88,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
        }
    }

    function drawDashboardPanel(dc as Dc, x, y, width, height) as Void {
        dc.setColor(0x07151D, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(x.toNumber(), y.toNumber(), width.toNumber(), height.toNumber(), (mUnit * 0.045).toNumber());
        dc.setColor(0x12485A, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(x.toNumber(), y.toNumber(), width.toNumber(), height.toNumber(), (mUnit * 0.045).toNumber());
    }

    function drawHeartRateRing(dc as Dc, centerX, centerY, radius, zone as Lang.Number) as Void {
        var colors = [0x20D98A, 0x8BE34A, 0xE3E84A, 0xFFB52E, 0xF04455];
        var startAngle = -132.0;
        for (var segment = 0; segment < 5; segment += 1) {
            var dimColors = [0x155A43, 0x426A2B, 0x777A28, 0x80551D, 0x762A35];
            var segmentColor = dimColors[segment];
            if (zone == segment + 1) { segmentColor = colors[segment]; }
            dc.setColor(segmentColor, Graphics.COLOR_BLACK);
            var previousX = centerX + (Math.cos(startAngle * 0.0174533) * radius);
            var previousY = centerY + (Math.sin(startAngle * 0.0174533) * radius);
            for (var step = 1; step <= 12; step += 1) {
                var angle = startAngle + (step * 6.0);
                var nextX = centerX + (Math.cos(angle * 0.0174533) * radius);
                var nextY = centerY + (Math.sin(angle * 0.0174533) * radius);
                dc.drawLine(
                    Math.round(previousX).toNumber(), Math.round(previousY).toNumber(),
                    Math.round(nextX).toNumber(), Math.round(nextY).toNumber()
                );
                previousX = nextX;
                previousY = nextY;
            }
            startAngle += 74.0;
        }
    }

    function drawActivityDashboard(dc as Dc, cx, hrNow as Lang.String, elapsed as Lang.String,
        distance as Lang.String, speedNow as Lang.String, zone as Lang.Number) as Void {
        drawHeartRateRing(dc, cx, mUnit * 0.49, mUnit * 0.465, zone);

        drawFit(dc, cx, mUnit * 0.105, compactWorkoutText(mCurrentWorkoutName, 32), mUnit * 0.68,
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        var workoutSubline = mCurrentWorkoutType;
        if (mCurrentWorkoutState == "MULTIPLE") {
            workoutSubline = "BITTE TRAININGSPLAN PRUEFEN";
        } else if (mCurrentWorkoutState == "FREE") {
            workoutSubline = "KEINE EINHEIT GEPLANT";
        } else {
            if (mCurrentWorkoutDuration != "") {
                if (workoutSubline != "") { workoutSubline += "  ·  "; }
                workoutSubline += mCurrentWorkoutDuration + " MIN";
            }
            if (workoutSubline == "") { workoutSubline = "GEPLANTE EINHEIT"; }
        }
        drawFit(dc, cx, mUnit * 0.155, workoutSubline, mUnit * 0.68,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        // Kompakte Trainingsvorgabe: Hauptteil hat Vorrang, Intensitaet bleibt als Kontext sichtbar.
        var workoutCue = compactWorkoutText(mCurrentWorkoutMainSet, 34);
        if (mCurrentWorkoutIntensity != "") {
            workoutCue = workoutCue != ""
                ? mCurrentWorkoutIntensity + "  ·  " + workoutCue
                 : compactWorkoutText(mCurrentWorkoutIntensity, 34);
        }
        if (workoutCue == "") { workoutCue = compactWorkoutText(mCurrentWorkoutDescription, 42); }
        if (workoutCue != "") {
            drawFit(dc, cx, mUnit * 0.19, workoutCue, mUnit * 0.68,
                Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        }

        var panelX = mUnit * 0.145;
        var panelWidth = mUnit * 0.71;
        drawDashboardPanel(dc, panelX, mUnit * 0.215, panelWidth, mUnit * 0.245);
        drawFit(dc, cx, mUnit * 0.245, "HERZFREQUENZ", panelWidth * 0.84,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, cx, mUnit * 0.285, hrNow, panelWidth * 0.80,
            Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.375, "BPM  ·  " + (zone > 0 ? "ZONE " + zone.toString() : "ZONE --"),
            panelWidth * 0.84, Graphics.FONT_SMALL, zone > 0 ? 0xFFB52E : Graphics.COLOR_LT_GRAY);

        var splitGap = mUnit * 0.018;
        var halfWidth = (panelWidth - splitGap) / 2;
        drawDashboardPanel(dc, panelX, mUnit * 0.48, halfWidth, mUnit * 0.155);
        drawDashboardPanel(dc, panelX + halfWidth + splitGap, mUnit * 0.48, halfWidth, mUnit * 0.155);
        drawFit(dc, panelX + halfWidth / 2, mUnit * 0.505, "ZEIT", halfWidth * 0.84,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, panelX + halfWidth / 2, mUnit * 0.545, elapsed, halfWidth * 0.88,
            Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawFit(dc, panelX + halfWidth + splitGap + halfWidth / 2, mUnit * 0.505,
            "DISTANZ", halfWidth * 0.84, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, panelX + halfWidth + splitGap + halfWidth / 2, mUnit * 0.545,
            distance, halfWidth * 0.88, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.665, "KM", mUnit * 0.24, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        drawDashboardPanel(dc, mUnit * 0.29, mUnit * 0.715, mUnit * 0.42, mUnit * 0.075);
        drawFit(dc, cx, mUnit * 0.735, "GESCHWINDIGKEIT  " + speedNow + " KM/H",
            mUnit * 0.38, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function drawHeartRateZone(dc as Dc, centerX, top, width, zone as Lang.Number) as Void {
        if (zone == 0) {
            drawFit(dc, centerX, top, "ZONE --", width, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            return;
        }

        drawFit(dc, centerX, top, "HERZFREQUENZZONE  Z" + zone.toString(), width, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);

        var segmentGap = mUnit * 0.012;
        var segmentWidth = (width - (segmentGap * 4)) / 5;
        var barTop = top + (mUnit * 0.045);
        var barHeight = mUnit * 0.022;
        var left = centerX - (width / 2);

        for (var i = 0; i < 5; i += 1) {
            var x = left + (i * (segmentWidth + segmentGap));
            dc.setColor((i + 1) == zone ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(
                x.toNumber(),
                barTop.toNumber(),
                segmentWidth.toNumber(),
                barHeight.toNumber(),
                (barHeight / 2).toNumber()
            );
        }
    }

    function startRecording() as Void {
        var started = mEngine.start(mBoatClass);
        if (started) {
            mStatus = "AUFZEICHNUNG";
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function onTimer() as Void { WatchUi.requestUpdate(); }
    function onPosition(positionInfo as Position.Info) as Void { WatchUi.requestUpdate(); }

    function finishRecording() as Void {
        mTimer.stop();
        Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
        if (mEngine.finish()) {
            mStatus = "GESPEICHERT";
        } else {
            mStatus = "SPEICHERN FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function nextDisplayPage(direction as Lang.Number) as Void {
        if (mStatus != "AUFZEICHNUNG") { return; }
        mPage += direction;
        if (mPage < 0) {
            mPage = mPageCount - 1;
        } else if (mPage >= mPageCount) {
            mPage = 0;
        }
        WatchUi.requestUpdate();
    }

    // Aktion der oberen physischen Taste.
    function handlePrimaryButton() as Void {
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            startRecording();
        } else if (mStatus == "AUFZEICHNUNG") {
            finishRecording();
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            finishRecording();
        } else if (mStatus == "GESPEICHERT") {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }

    // Aktion der unteren physischen Taste. true bedeutet: Taste wurde
    // als Rundenmarkierung verarbeitet; false lässt die Zurück-Funktion zu.
    function handleLapButton() as Lang.Boolean {
        if (mStatus != "AUFZEICHNUNG") {
            return false;
        }

        if (mEngine.addLap()) {
            WatchUi.showToast("Runde gespeichert", null);
        } else {
            WatchUi.showToast("Runde konnte nicht gespeichert werden", null);
        }
        return true;
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y < mButtonTop || y > mButtonBottom) { return; }
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            startRecording();
            return;
        }
        if (mStatus == "AUFZEICHNUNG") {
            if (x < mScreenWidth / 2) {
                if (mEngine.addLap()) { WatchUi.showToast("Runde gespeichert", null); }
            } else {
                finishRecording();
            }
            return;
        }
        if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            finishRecording();
            return;
        }
        if (mStatus == "GESPEICHERT") {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }

    function formatTime(milliseconds as Lang.Number) as Lang.String {
        var totalSeconds = Math.floor(milliseconds / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds - (hours * 3600)) / 60);
        var seconds = totalSeconds - (hours * 3600) - (minutes * 60);
        var minuteText = minutes.toString();
        var secondText = seconds.toString();
        if (hours > 0) {
            if (minutes < 10) { minuteText = "0" + minuteText; }
            if (seconds < 10) { secondText = "0" + secondText; }
            return hours.toString() + ":" + minuteText + ":" + secondText;
        }
        if (minutes < 10) { minuteText = "0" + minuteText; }
        if (seconds < 10) { secondText = "0" + secondText; }
        return minuteText + ":" + secondText;
    }

    function numberText(value, decimals as Lang.Number) as Lang.String {
        if (value == null) { return "--"; }
        var multiplier = 1;
        if (decimals == 1) { multiplier = 10; }
        if (decimals == 2) { multiplier = 100; }
        var rounded = Math.round(value * multiplier).toNumber();
        if (decimals == 0) { return rounded.toString(); }
        var whole = Math.floor(rounded / multiplier);
        var fraction = rounded - (whole * multiplier);
        var fractionText = fraction.toString();
        if (decimals == 2 && fraction < 10) { fractionText = "0" + fractionText; }
        return whole.toString() + "." + fractionText;
    }

    function valueOrDash(value) as Lang.String {
        if (value == null) { return "--"; }
        return value.toString();
    }

    // Garmin liefert GPS-Qualitaet als Enum (0 bis 4), nicht als Distanz in Metern.
    function gpsQualityText(value) as Lang.String {
        if (value == null) { return "--"; }
        if (value == Position.QUALITY_NOT_AVAILABLE) { return "KEIN FIX"; }
        if (value == Position.QUALITY_LAST_KNOWN) { return "LETZTER FIX"; }
        if (value == Position.QUALITY_POOR) { return "SCHWACH"; }
        if (value == Position.QUALITY_USABLE) { return "NUTZBAR"; }
        if (value == Position.QUALITY_GOOD) { return "GUT"; }
        return "--";
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(y).toNumber(), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function drawPageHeader(dc as Dc, title as Lang.String) as Void {
        var cx = mScreenWidth / 2;
        drawFit(dc, cx, mUnit * 0.105, title, mUnit * 0.58, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.17,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  ↑ ↓",
            mUnit * 0.65, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function drawMetric(dc as Dc, x, y, label as Lang.String, value as Lang.String, unit as Lang.String, maxWidth, valueFont) as Void {
        drawFit(dc, x, y, label, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        var valueY = y + (mUnit * 0.065);
        var font = fitFont(dc, value, maxWidth, valueFont);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(valueY).toNumber(), font, value, Graphics.TEXT_JUSTIFY_CENTER);
        if (unit != "") {
            drawFit(dc, x, valueY + (mUnit * 0.065), unit, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }
    }

    function drawButton(dc as Dc, centerX, top, width, label as Lang.String) as Void {
        var height = mButtonBottom - mButtonTop;
        var left = centerX - (width / 2);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(
            Math.round(left).toNumber(),
            Math.round(top).toNumber(),
            Math.round(width).toNumber(),
            Math.round(height).toNumber(),
            Math.round(mUnit * 0.025).toNumber()
        );
        drawFit(
            dc,
            centerX,
            top + (height - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            label,
            width * 0.86,
            Graphics.FONT_SMALL,
            Graphics.COLOR_WHITE
        );
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mScreenWidth = dc.getWidth();
        mScreenHeight = dc.getHeight();
        mUnit = mScreenWidth;
        if (mScreenHeight < mUnit) { mUnit = mScreenHeight; }

        var cx = mScreenWidth / 2;
        if (mPage < mEnabledPageIds.size()) {
            mCurrentPageId = mEnabledPageIds[mPage] as Lang.Number;
        } else {
            var customIndex = mPage - mEnabledPageIds.size();
            for (var i = 0; i < 3; i += 1) {
                if (getCustomMetricIds(i).size() > 0) {
                    if (customIndex == 0) {
                        mCurrentPageId = 5 + i;
                        break;
                    }
                    customIndex -= 1;
                }
            }
        }
        var activityInfo = null;
        if (mStatus == "AUFZEICHNUNG") { activityInfo = Activity.getActivityInfo(); }

        var speedNow = "--";
        var speedAvg = "--";
        var speedMax = "--";
        var hrNow = "--";
        var currentHeartRate = null;
        var currentHeartRateZone = 0;
        var hrAvg = "--";
        var hrMax = "--";
        var distance = "--";
        var elapsed = "00:00";
        var calories = "--";
        var cadenceNow = "--";
        var powerNow = "--";
        var trainingEffect = "--";
        var altitude = "--";
        var ascent = "--";
        var descent = "--";
        var gpsText = "GPS AUS";
        var gpsAccuracy = "--";

        if (activityInfo != null) {
            if (activityInfo.currentSpeed != null) { speedNow = numberText(activityInfo.currentSpeed * 3.6, 1); }
            if (activityInfo.averageSpeed != null) { speedAvg = numberText(activityInfo.averageSpeed * 3.6, 1); }
            if (activityInfo.maxSpeed != null) { speedMax = numberText(activityInfo.maxSpeed * 3.6, 1); }
            currentHeartRate = activityInfo.currentHeartRate;
            hrNow = valueOrDash(currentHeartRate);
            currentHeartRateZone = getCurrentHeartRateZone(currentHeartRate);
            hrAvg = valueOrDash(activityInfo.averageHeartRate);
            hrMax = valueOrDash(activityInfo.maxHeartRate);
            if (activityInfo.elapsedDistance != null) { distance = numberText(activityInfo.elapsedDistance / 1000.0, 2); }
            if (activityInfo.timerTime != null) {
                elapsed = formatTime(activityInfo.timerTime);
            } else if (activityInfo.elapsedTime != null) {
                elapsed = formatTime(activityInfo.elapsedTime);
            }
            calories = valueOrDash(activityInfo.calories);
            cadenceNow = valueOrDash(activityInfo.currentCadence);
            powerNow = valueOrDash(activityInfo.currentPower);
            trainingEffect = numberText(activityInfo.trainingEffect, 1);
            altitude = numberText(activityInfo.altitude, 0);
            ascent = valueOrDash(activityInfo.totalAscent);
            descent = valueOrDash(activityInfo.totalDescent);
            gpsText = activityInfo.currentLocation != null ? "GPS AKTIV" : "GPS SUCHT";
            gpsAccuracy = gpsQualityText(activityInfo.currentLocationAccuracy);
        }

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawPageHeader(dc, "AKTIVITAET");
            drawFit(dc, cx, mUnit * 0.34, "BEREIT", mUnit * 0.72, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
            drawFit(dc, cx, mUnit * 0.47, "Aufzeichnung starten", mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
            drawFit(dc, cx, mUnit * 0.57, "Bootsklasse im Startmenue gewaehlt", mUnit * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else if (mCurrentPageId == 0) {
            drawActivityDashboard(dc, cx, hrNow, elapsed, distance, speedNow, currentHeartRateZone);
        } else if (mCurrentPageId == 1) {
            drawPageHeader(dc, "GESCHWINDIGKEIT");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", speedNow, "KM/H", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "DURCHSCHNITT", speedAvg, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "MAXIMUM", speedMax, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 2) {
            drawPageHeader(dc, "HERZFREQUENZ");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", hrNow, "BPM", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "DURCHSCHNITT", hrAvg, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "MAXIMUM", hrMax, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawHeartRateZone(dc, cx, mUnit * 0.715, mUnit * 0.62, currentHeartRateZone);
        } else if (mCurrentPageId == 3) {
            drawPageHeader(dc, "DISTANZ & ZEIT");
            drawMetric(dc, cx, mUnit * 0.25, "DISTANZ", distance, "KM", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "ZEIT", elapsed, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "KALORIEN", calories, "KCAL", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId >= 5 && mCurrentPageId <= 7) {
            var customMetricValues = {
                "speedNow" => speedNow,
                "speedAvg" => speedAvg,
                "speedMax" => speedMax,
                "heartRate" => hrNow,
                "heartRateZone" => currentHeartRateZone > 0 ? "Z" + currentHeartRateZone.toString() : "--",
                "heartRateAvg" => hrAvg,
                "heartRateMax" => hrMax,
                "distance" => distance,
                "elapsed" => elapsed,
                "calories" => calories,
                "cadence" => cadenceNow,
                "power" => powerNow,
                "trainingEffect" => trainingEffect,
                "altitude" => altitude,
                "ascent" => ascent,
                "descent" => descent,
                "gpsAccuracy" => gpsAccuracy
            };
            var customLayoutIndex = mCurrentPageId - 5;
            var customPageTitle = "MEINE DATEN " + (customLayoutIndex + 1).toString();
            drawCustomMetricPage(dc, cx, customMetricValues,
                getCustomMetricIds(customLayoutIndex), getCustomMetricSizes(customLayoutIndex),
                getCustomMetricPositions(customLayoutIndex), customPageTitle);
        } else {
            drawPageHeader(dc, "WEITERE DATEN");
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.245, "KADENZ", cadenceNow, "RPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.245, "LEISTUNG", powerNow, "W", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.49, "HOEHE", altitude, "M", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.49, "TRAINING EFFECT", trainingEffect, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawFit(dc, cx, mUnit * 0.72, gpsText + " · GPS " + gpsAccuracy, mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawFit(dc, cx, mUnit * 0.765, "Anstieg " + ascent + " m · Abstieg " + descent + " m", mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        drawFit(dc, cx, mUnit * 0.805, mStatus, mUnit * 0.70, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        mButtonTop = mUnit * 0.82;
        mButtonBottom = mUnit * 0.90;
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawButton(dc, cx, mButtonTop, mUnit * 0.58, "STARTEN");
        } else if (mStatus == "AUFZEICHNUNG") {
            drawButton(dc, mScreenWidth * 0.33, mButtonTop, mUnit * 0.25, "RUNDE");
            drawButton(dc, mScreenWidth * 0.67, mButtonTop, mUnit * 0.25, "ENDE");
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            drawButton(dc, cx, mButtonTop, mUnit * 0.72, "ERNEUT SPEICHERN");
        } else {
            drawButton(dc, cx, mButtonTop, mUnit * 0.58, "ZURUECK");
        }
    }
}
