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

    var mLayout;

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
    var mCurrentWorkoutObjective as Lang.String = "";
    var mCurrentWorkoutWarmup as Lang.String = "";
    var mCurrentWorkoutMainSet as Lang.String = "";
    var mCurrentWorkoutCooldown as Lang.String = "";
    var mHasWorkoutInstructions as Lang.Boolean = false;
    var mWorkoutSteps as Lang.Array<Lang.Dictionary> = [];
    var mWorkoutStepIndex as Lang.Number = 0;
    var mWorkoutStepElapsedSeconds as Lang.Number = 0;
    var mWorkoutSequenceComplete as Lang.Boolean = false;
    var mCurrentPageId as Lang.Number = 0;
    var mGpsQuality as Lang.Number = Position.QUALITY_NOT_AVAILABLE;

    function loadWorkoutSteps(value) as Void {
        mWorkoutSteps = [];
        mWorkoutStepIndex = 0;
        mWorkoutStepElapsedSeconds = 0;
        mWorkoutSequenceComplete = false;
        if (value == null) { return; }
        var source = value as Lang.Array<Lang.Dictionary>;
        for (var i = 0; i < source.size() && i < 40; i += 1) {
            var rawStep = source[i] as Lang.Dictionary;
            var label = rawStep["label"];
            var durationValue = rawStep["durationSeconds"];
            if (label == null || durationValue == null) { continue; }
            var duration = durationValue as Lang.Number;
            if (duration < 1 || duration > 21600) { continue; }
            var safeStep = {};
            safeStep["label"] = compactWorkoutText(label.toString(), 80);
            safeStep["durationSeconds"] = duration.toNumber();
            safeStep["type"] = rawStep["type"] == null ? "other" : rawStep["type"].toString();
            safeStep["target"] = rawStep["target"] == null ? "" : compactWorkoutText(rawStep["target"].toString(), 120);
            mWorkoutSteps.add(safeStep);
        }
    }

    function moveWorkoutStep(direction as Lang.Number) as Void {
        if (mWorkoutSteps.size() == 0) { return; }
        var nextIndex = mWorkoutStepIndex + direction;
        if (nextIndex < 0) { return; }
        if (nextIndex >= mWorkoutSteps.size()) {
            mWorkoutSequenceComplete = true;
            mWorkoutStepElapsedSeconds = 0;
            return;
        }
        mWorkoutStepIndex = nextIndex;
        mWorkoutStepElapsedSeconds = 0;
        mWorkoutSequenceComplete = false;
    }

    function updateWorkoutStepTimer() as Void {
        if (mWorkoutSteps.size() == 0 || mWorkoutSequenceComplete) { return; }
        var step = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
        var duration = step["durationSeconds"] as Lang.Number;
        mWorkoutStepElapsedSeconds += 1;
        if (mWorkoutStepElapsedSeconds >= duration) {
            if (mWorkoutStepIndex + 1 < mWorkoutSteps.size()) {
                mWorkoutStepIndex += 1;
                mWorkoutStepElapsedSeconds = 0;
                WatchUi.showToast("Naechster Trainingsschritt", null);
            } else {
                mWorkoutSequenceComplete = true;
                WatchUi.showToast("Trainingsablauf abgeschlossen", null);
            }
        }
    }

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mLayout = new KajoLayout();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
        loadCurrentWorkout();
        loadDisplayPages();
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
        mCurrentWorkoutObjective = workout["objective"] == null ? "" : workout["objective"].toString();
        mCurrentWorkoutWarmup = workout["warmup"] == null ? "" : workout["warmup"].toString();
        mCurrentWorkoutMainSet = workout["mainSet"] == null ? "" : workout["mainSet"].toString();
        mCurrentWorkoutCooldown = workout["cooldown"] == null ? "" : workout["cooldown"].toString();
        loadWorkoutSteps(workout["steps"]);
        loadDisplayPages();
    }

    function setFreeActivity() as Void {
        mCurrentWorkoutState = "FREE";
        mCurrentWorkoutName = "FREIE AKTIVITAET";
        mCurrentWorkoutType = "";
        mCurrentWorkoutDuration = "";
        mCurrentWorkoutDescription = "";
        mCurrentWorkoutIntensity = "";
        mCurrentWorkoutObjective = "";
        mCurrentWorkoutWarmup = "";
        mCurrentWorkoutMainSet = "";
        mCurrentWorkoutCooldown = "";
        loadWorkoutSteps(null);
        loadDisplayPages();
    }

    function loadCurrentWorkout() as Void {
        var sessions = Storage.getValue("kajoPlannedSessions");
        mCurrentWorkoutState = "FREE";
        mCurrentWorkoutName = "FREIES TRAINING";
        mCurrentWorkoutType = "";
        mCurrentWorkoutDuration = "";
        mCurrentWorkoutDescription = "";
        mCurrentWorkoutIntensity = "";
        mCurrentWorkoutObjective = "";
        mCurrentWorkoutWarmup = "";
        mCurrentWorkoutMainSet = "";
        mCurrentWorkoutCooldown = "";
        loadWorkoutSteps(null);
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
            var sessionType = session["type"];
            if (sessionDate != null && sessionDate.toString() == today &&
                (sessionType == null || sessionType.toString() != "RestDay")) {
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
        if (selected["objective"] != null) { mCurrentWorkoutObjective = selected["objective"].toString(); }
        if (selected["warmup"] != null) { mCurrentWorkoutWarmup = selected["warmup"].toString(); }
        if (selected["mainSet"] != null) { mCurrentWorkoutMainSet = selected["mainSet"].toString(); }
        if (selected["cooldown"] != null) { mCurrentWorkoutCooldown = selected["cooldown"].toString(); }
        loadWorkoutSteps(selected["steps"]);
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
        mHasWorkoutInstructions = mCurrentWorkoutState == "PLANNED" &&
            mCurrentWorkoutType != "RestDay" &&
            (mCurrentWorkoutObjective != "" || mCurrentWorkoutIntensity != "" ||
             mCurrentWorkoutWarmup != "" || mCurrentWorkoutMainSet != "" ||
             mCurrentWorkoutCooldown != "" || mWorkoutSteps.size() > 0);
        mPageCount = mEnabledPageIds.size() + mCustomPageCount;
        if (mHasWorkoutInstructions) { mPageCount += 1; }
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

        // Das breite zentrierte Feld (Position 4) darf nie mit einem unteren
        // Seitenfeld (Position 2 oder 3) kollidieren.
        var centerMetric = "";
        var hasLowerSideMetric = false;
        for (var i = 0; i < metrics.size() && i < 4; i += 1) {
            var currentId = metrics[i];
            var currentPosition = positions[currentId] as Lang.Number;
            if (currentPosition == 4) { centerMetric = currentId; }
            if (currentPosition == 2 || currentPosition == 3) { hasLowerSideMetric = true; }
        }
        if (centerMetric != "" && hasLowerSideMetric) {
            for (var candidate = 0; candidate <= 3; candidate += 1) {
                if (used.indexOf(candidate) < 0) {
                    positions[centerMetric] = candidate;
                    break;
                }
            }
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
        dc.setColor(0x040D12, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(x.toNumber(), y.toNumber(), width.toNumber(), height.toNumber(), (mUnit * 0.045).toNumber());
        dc.setColor(0x0A3A4A, Graphics.COLOR_BLACK);
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

    function formatPace(speedKmh) as Lang.String {
        if (speedKmh == null || speedKmh <= 0.1) { return "--:--"; }
        var totalSeconds = Math.round(3600.0 / speedKmh).toNumber();
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds - (minutes * 60);
        return minutes.toString() + ":" + (seconds < 10 ? "0" : "") + seconds.toString();
    }

    function drawActivityDashboard(dc as Dc, cx, hrNow as Lang.String, elapsed as Lang.String,
        distance as Lang.String, speedNow as Lang.String, zone as Lang.Number,
        activityInfo) as Void {
        var cyan = 0x00E5CC;
        var muted = 0xA0AAB2;
        var metricSafeWidth = mLayout.safeWidthAt(cx, mUnit * 0.715, mUnit * 0.79);
        var left = cx - (metricSafeWidth / 2);
        var right = cx + (metricSafeWidth / 2);

        // Feiner Fortschrittsakzent am oberen linken Rand.
        dc.setColor(cyan, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.105).toNumber(), (mUnit * 0.12).toNumber(),
            (mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber());
        dc.drawLine((mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber(),
            (mUnit * 0.155).toNumber(), (mUnit * 0.045).toNumber());

        // Intervallstatus: nur echte Trainingsschritte als Intervallzaehler darstellen.
        var stepCount = mWorkoutSteps.size();
        var stepNumber = mWorkoutStepIndex + 1;
        var stepLabel = mCurrentWorkoutState == "PLANNED" ? "TRAINING" : "FREIES TRAINING";
        var target = "";
        var nextLabel = "";
        var remainingText = "";
        if (stepCount > 0 && !mWorkoutSequenceComplete) {
            var step = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            stepLabel = step["label"] == null ? "PADDELN" : step["label"].toString();
            target = step["target"] == null ? "" : step["target"].toString();
            var remaining = (step["durationSeconds"] as Lang.Number) - mWorkoutStepElapsedSeconds;
            if (remaining < 0) { remaining = 0; }
            remainingText = formatTime(remaining * 1000);
            if (mWorkoutStepIndex + 1 < stepCount) {
                var nextStep = mWorkoutSteps[mWorkoutStepIndex + 1] as Lang.Dictionary;
                var nextDuration = nextStep["durationSeconds"] as Lang.Number;
                nextLabel = "NAECHSTES: " + formatTime(nextDuration * 1000) + " " +
                    (nextStep["label"] == null ? "" : nextStep["label"].toString());
            }
        } else if (mWorkoutSequenceComplete) {
            stepLabel = "ABGESCHLOSSEN";
        }

        var statusText = stepCount > 0
            ? "INTERVALL " + stepNumber.toString() + "/" + stepCount.toString() + "  •  " + compactWorkoutText(stepLabel, 18)
            : compactWorkoutText(stepLabel, 34);
        var statusY = mUnit * 0.145;
        var statusH = mUnit * 0.075;
        var statusW = mLayout.safeRectWidth(statusY, statusH, mUnit * 0.79);
        var statusX = cx - (statusW / 2);
        dc.setColor(0x041216, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(statusX.toNumber(), statusY.toNumber(), statusW.toNumber(),
            statusH.toNumber(), (mUnit * 0.035).toNumber());
        dc.setColor(cyan, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(statusX.toNumber(), statusY.toNumber(), statusW.toNumber(),
            statusH.toNumber(), (mUnit * 0.035).toNumber());
        drawFit(dc, cx, statusY + (mUnit * 0.027), statusText,
            statusW * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        // GPS-Empfang: drei Balken, nur bei nutzbarem Fix gruen.
        var gpsActive = mGpsQuality >= Position.QUALITY_USABLE;
        var gpsColor = gpsActive ? 0x39FF14 : 0x555555;
        for (var bar = 0; bar < 3; bar += 1) {
            var bh = mUnit * (0.012 + (bar * 0.008));
            dc.setColor(gpsColor, Graphics.COLOR_BLACK);
            dc.fillRectangle((statusX + statusW - (mUnit * 0.055) + (bar * mUnit * 0.014)).toNumber(),
                (statusY + (statusH / 2) - (bh / 2)).toNumber(), (mUnit * 0.009).toNumber(), bh.toNumber());
        }

        // Grosser Timer mit offenem, tuerkisem Kreisbogen.
        var timerText = remainingText != "" ? remainingText :
            (activityInfo != null && activityInfo.timerTime != null
                ? formatTime(activityInfo.timerTime) : elapsed);
        var ringCx = cx;
        var ringCy = mUnit * 0.39;
        var ringRadius = mUnit * 0.17;
        dc.setColor(cyan, Graphics.COLOR_BLACK);
        dc.drawArc(ringCx.toNumber(), ringCy.toNumber(), ringRadius.toNumber(),
            Graphics.ARC_CLOCKWISE, 205, 335);
        dc.drawArc(ringCx.toNumber(), ringCy.toNumber(), ringRadius.toNumber(),
            Graphics.ARC_CLOCKWISE, 25, 155);
        drawFit(dc, cx, mUnit * 0.30, timerText, mUnit * 0.66,
            Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
        drawFit(dc, cx + (mUnit * 0.235), mUnit * 0.315, "min",
            mUnit * 0.10, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.455,
            target == "" ? "INTERVALL" : compactWorkoutText(target, 30),
            mUnit * 0.62, Graphics.FONT_SMALL, cyan);

        if (nextLabel != "") {
            drawFit(dc, cx, mUnit * 0.535, compactWorkoutText(nextLabel, 42),
                mUnit * 0.78, Graphics.FONT_XTINY, muted);
        } else {
            drawFit(dc, cx, mUnit * 0.535, "TRAINING LAEUFT",
                mUnit * 0.78, Graphics.FONT_XTINY, muted);
        }

        // Pace wird aus der aktuellen Geschwindigkeit abgeleitet. Keine erfundene
        // Intervall-Distanz: die Anzeige verwendet die verfuegbare Gesamtdistanz.
        var pace = "--:--";
        if (activityInfo != null && activityInfo.currentSpeed != null) {
            pace = formatPace(activityInfo.currentSpeed * 3.6);
        }
        var distanceMeters = "--";
        if (activityInfo != null && activityInfo.elapsedDistance != null) {
            distanceMeters = numberText(activityInfo.elapsedDistance, 0);
        }

        var metricTop = mUnit * 0.575;
        dc.setColor(0x2A3236, Graphics.COLOR_BLACK);
        dc.drawLine(cx.toNumber(), (metricTop - mUnit * 0.005).toNumber(),
            cx.toNumber(), (mUnit * 0.715).toNumber());
        drawFit(dc, cx - (mUnit * 0.205), metricTop,
            "min/km", mUnit * 0.34, Graphics.FONT_XTINY, muted);
        drawFit(dc, cx - (mUnit * 0.205), mUnit * 0.62,
            pace, mUnit * 0.36, Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawFit(dc, cx - (mUnit * 0.205), mUnit * 0.67,
            "PACE", mUnit * 0.34, Graphics.FONT_XTINY, muted);

        drawFit(dc, cx + (mUnit * 0.205), metricTop,
            "m", mUnit * 0.34, Graphics.FONT_XTINY, muted);
        drawFit(dc, cx + (mUnit * 0.205), mUnit * 0.62,
            distanceMeters, mUnit * 0.36, Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawFit(dc, cx + (mUnit * 0.205), mUnit * 0.67,
            "DISTANZ", mUnit * 0.34, Graphics.FONT_XTINY, muted);
        dc.setColor(0x2A3236, Graphics.COLOR_BLACK);
        dc.drawLine(left.toNumber(), (mUnit * 0.715).toNumber(),
            right.toNumber(), (mUnit * 0.715).toNumber());

        // Herzfrequenz, fuenf farbige Zonen und Pause-Vorschau.
        dc.setColor(0xFF2A2A, Graphics.COLOR_BLACK);
        var heartFont = mLayout.fontForPercent(dc, 0.055);
        var heartY = mLayout.safeTextY(mUnit * 0.715, dc.getFontHeight(heartFont));
        dc.drawText((mUnit * 0.16).toNumber(), heartY.toNumber(),
            heartFont, "♥", Graphics.TEXT_JUSTIFY_CENTER);
        drawFit(dc, mUnit * 0.34, mUnit * 0.71, hrNow,
            mUnit * 0.25, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawFit(dc, mUnit * 0.43, mUnit * 0.725, "bpm",
            mUnit * 0.16, Graphics.FONT_XTINY, muted);

        var zoneColors = [0x39FF14, 0x00E676, 0xFFD700, 0xFF9100, 0xFF2A2A];
        var barLeft = mUnit * 0.16;
        var barWidth = mUnit * 0.44;
        var gap = mUnit * 0.012;
        var segmentWidth = (barWidth - (gap * 4)) / 5;
        for (var z = 0; z < 5; z += 1) {
            var zx = barLeft + (z * (segmentWidth + gap));
            dc.setColor(zoneColors[z], Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(zx.toNumber(), (mUnit * 0.765).toNumber(),
                segmentWidth.toNumber(), (mUnit * 0.018).toNumber(),
                (mUnit * 0.009).toNumber());
        }
        if (zone > 0 && zone <= 5) {
            drawFit(dc, mUnit * 0.36, mUnit * 0.795, "ZONE " + zone.toString(),
                mUnit * 0.35, Graphics.FONT_XTINY, zoneColors[zone - 1]);
        } else {
            drawFit(dc, mUnit * 0.36, mUnit * 0.795, "ZONE --",
                mUnit * 0.35, Graphics.FONT_XTINY, muted);
        }

        dc.setColor(0x2A3236, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.64).toNumber(), (mUnit * 0.715).toNumber(),
            (mUnit * 0.64).toNumber(), (mUnit * 0.82).toNumber());
        drawFit(dc, mUnit * 0.77, mUnit * 0.725, "› PAUSE",
            mUnit * 0.27, Graphics.FONT_XTINY, muted);
        drawFit(dc, mUnit * 0.77, mUnit * 0.765,
            nextLabel == "" ? "--:--" : compactWorkoutText(nextLabel, 15),
            mUnit * 0.27, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
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
            mWorkoutStepIndex = 0;
            mWorkoutStepElapsedSeconds = 0;
            mWorkoutSequenceComplete = false;
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function onTimer() as Void {
        if (mStatus == "AUFZEICHNUNG") { updateWorkoutStepTimer(); }
        WatchUi.requestUpdate();
    }
    function onPosition(positionInfo as Position.Info) as Void {
        if (positionInfo != null) {
            mGpsQuality = positionInfo.accuracy;
        } else {
            mGpsQuality = Position.QUALITY_NOT_AVAILABLE;
        }
        WatchUi.requestUpdate();
    }

    function finishRecording() as Void {
        if (mEngine.finish()) {
            mTimer.stop();
            Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
            mStatus = "GESPEICHERT";
        } else if (mEngine.isRecording()) {
            // Wenn Garmin das Stoppen ablehnt, läuft die Aufzeichnung weiter.
            // Timer, GPS und Rundenmarkierungen bleiben deshalb aktiv.
            mStatus = "AUFZEICHNUNG";
            WatchUi.showToast("Stoppen fehlgeschlagen – bitte erneut versuchen", null);
        } else {
            // Die Session wurde bereits gestoppt, aber FIT konnte nicht
            // gespeichert werden. Timer und GPS werden beendet; ein erneuter
            // Tastendruck versucht ausschließlich das Speichern erneut.
            mTimer.stop();
            Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
            mStatus = "SPEICHERN FEHLGESCHLAGEN";
            WatchUi.showToast("Speichern fehlgeschlagen – erneut versuchen", null);
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
        // Eine gestoppte, aber noch nicht gespeicherte FIT-Session darf
        // nicht versehentlich über die Zurück-Taste verlassen werden.
        if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            WatchUi.showToast("Bitte zuerst erneut speichern", null);
            return true;
        }

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
            if (mCurrentPageId == 8 && mWorkoutSteps.size() > 0) {
                if (mWorkoutSequenceComplete) {
                    if (x < mScreenWidth / 2) {
                        if (mWorkoutStepIndex > 0) { mWorkoutStepIndex -= 1; }
                    } else {
                        mWorkoutStepIndex = 0;
                    }
                    mWorkoutSequenceComplete = false;
                    mWorkoutStepElapsedSeconds = 0;
                } else if (x < mScreenWidth / 2) {
                    moveWorkoutStep(-1);
                } else {
                    moveWorkoutStep(1);
                }
            } else if (x < mScreenWidth / 2) {
                mPage -= 1;
                if (mPage < 0) { mPage = mPageCount - 1; }
            } else {
                mPage += 1;
                if (mPage >= mPageCount) { mPage = 0; }
            }
            WatchUi.requestUpdate();
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
        return mLayout.fitFont(dc, text, maxWidth, preferredFont);
    }
    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = mLayout.fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        var safeWidth = mLayout.safeTextWidth(dc, x.toNumber(), y.toNumber(), font, maxWidth.toNumber());
        var displayText = text;
        while (displayText.length() > 0 && dc.getTextWidthInPixels(displayText, font) > safeWidth) {
            if (displayText.length() <= 4) { displayText = ""; }
            else { displayText = displayText.substring(0, displayText.length() - 4) + "..."; }
        }
        if (displayText == "" || safeWidth <= 0) { return; }
        var safeY = mLayout.safeTextY(y.toNumber(), dc.getFontHeight(font));
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(safeY).toNumber(), font, displayText, Graphics.TEXT_JUSTIFY_CENTER);
    }
    function drawPageHeader(dc as Dc, title as Lang.String) as Void {
        var cx = mScreenWidth / 2;
        drawFit(dc, cx, mUnit * 0.16, title, mUnit * 0.58, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.215,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  ↑ ↓",
            mUnit * 0.65, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function drawMetric(dc as Dc, x, y, label as Lang.String, value as Lang.String, unit as Lang.String, maxWidth, valueFont) as Void {
        drawFit(dc, x, y, label, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        var valueY = y + (mUnit * 0.065);
        drawFit(dc, x, valueY, value, maxWidth, valueFont, Graphics.COLOR_WHITE);
        if (unit != "") {
            drawFit(dc, x, valueY + (mUnit * 0.065), unit, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }
    }

    function drawButton(dc as Dc, centerX, top, width, label as Lang.String) as Void {
        var height = mButtonBottom - mButtonTop;
        var safeWidth = mLayout.safeRectWidth(top, height, width);
        var left = centerX - (safeWidth / 2);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(
            Math.round(left).toNumber(),
            Math.round(top).toNumber(),
            Math.round(safeWidth).toNumber(),
            Math.round(height).toNumber(),
            Math.round(mUnit * 0.025).toNumber()
        );
        drawFit(
            dc,
            centerX,
            top + (height - dc.getFontHeight(mLayout.fontForPercent(dc, 0.055))) / 2,
            label,
            safeWidth * 0.86,
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
        mLayout.configure(mScreenWidth, mScreenHeight);

        var cx = mScreenWidth / 2;
        if (mPage < mEnabledPageIds.size()) {
            mCurrentPageId = mEnabledPageIds[mPage] as Lang.Number;
        } else {
            var customIndex = mPage - mEnabledPageIds.size();
            mCurrentPageId = 8;
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
            if (activityInfo.currentLocationAccuracy == null) {
                gpsAccuracy = gpsQualityText(mGpsQuality);
            }
        }

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawPageHeader(dc, "BEREIT");
            var readyPanelX = mUnit * 0.14;
            var readyPanelWidth = mUnit * 0.72;
            drawDashboardPanel(dc, readyPanelX, mUnit * 0.29, readyPanelWidth, mUnit * 0.24);
            drawFit(dc, cx, mUnit * 0.335, compactWorkoutText(mCurrentWorkoutName, 30),
                readyPanelWidth * 0.86, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawFit(dc, cx, mUnit * 0.405, mBoatClass,
                readyPanelWidth * 0.82, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
            if (mCurrentWorkoutDuration != "") {
                drawFit(dc, cx, mUnit * 0.465, mCurrentWorkoutDuration + " MIN",
                    readyPanelWidth * 0.82, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
            if (mStatus == "START FEHLGESCHLAGEN") {
                drawFit(dc, cx, mUnit * 0.62, "START NICHT MOEGLICH",
                    mUnit * 0.76, Graphics.FONT_XTINY, 0xFFFF7043);
            }
        } else if (mCurrentPageId == 0) {
            drawActivityDashboard(dc, cx, hrNow, elapsed, distance, speedNow, currentHeartRateZone, activityInfo);
        } else if (mCurrentPageId == 1) {
            drawPageHeader(dc, "GESCHWINDIGKEIT");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", speedNow, "KM/H", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "DURCHSCHNITT", speedAvg, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "MAXIMUM", speedMax, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 2) {
            drawPageHeader(dc, "HERZFREQUENZ");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", hrNow, "BPM", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.54, "DURCHSCHNITT", hrAvg, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.54, "MAXIMUM", hrMax, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawHeartRateZone(dc, cx, mUnit * 0.735, mUnit * 0.62, currentHeartRateZone);
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
        } else if (mCurrentPageId == 8) {
            if (mWorkoutSteps.size() > 0) {
                drawPageHeader(dc, "TRAININGSABLAUF");
                if (mWorkoutSequenceComplete) {
                    drawFit(dc, cx, mUnit * 0.34, "ABGESCHLOSSEN", mUnit * 0.78, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
                    drawFit(dc, cx, mUnit * 0.47, mWorkoutSteps.size().toString() + " SCHRITTE ERLEDIGT", mUnit * 0.76, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
                } else {
                    var currentStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
                    var stepType = currentStep["type"].toString();
                    var stepTypeLabel = "TRAINING";
                    if (stepType == "warmup") { stepTypeLabel = "AUFWAERMEN"; }
                    else if (stepType == "work") { stepTypeLabel = "BELASTUNG"; }
                    else if (stepType == "recovery") { stepTypeLabel = "ERHOLUNG"; }
                    else if (stepType == "cooldown") { stepTypeLabel = "ABWAERMEN"; }
                    drawFit(dc, cx, mUnit * 0.235, "SCHRITT " + (mWorkoutStepIndex + 1).toString() + " / " + mWorkoutSteps.size().toString() + " · " + stepTypeLabel, mUnit * 0.82, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                    drawFit(dc, cx, mUnit * 0.34, compactWorkoutText(currentStep["label"].toString(), 42), mUnit * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
                    var stepDuration = currentStep["durationSeconds"] as Lang.Number;
                    var remaining = stepDuration - mWorkoutStepElapsedSeconds;
                    if (remaining < 0) { remaining = 0; }
                    drawFit(dc, cx, mUnit * 0.47, formatTime(remaining * 1000), mUnit * 0.82, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
                    if (currentStep["target"] != null && currentStep["target"].toString() != "") {
                        drawFit(dc, cx, mUnit * 0.60, compactWorkoutText(currentStep["target"].toString(), 58), mUnit * 0.82, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
                    }
                    if (mWorkoutStepIndex + 1 < mWorkoutSteps.size()) {
                        var nextStep = mWorkoutSteps[mWorkoutStepIndex + 1] as Lang.Dictionary;
                        drawFit(dc, cx, mUnit * 0.705, "ALS NAECHSTES: " + compactWorkoutText(nextStep["label"].toString(), 32),
                            mUnit * 0.82, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                    } else {
                        drawFit(dc, cx, mUnit * 0.705, "LETZTER SCHRITT", mUnit * 0.82,
                            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                    }
                }
            } else {
                drawPageHeader(dc, "TRAININGSANWEISUNG");
            if (mCurrentWorkoutIntensity != "") {
                drawFit(dc, cx, mUnit * 0.215,
                    "INTENSITAET - " + compactWorkoutText(mCurrentWorkoutIntensity, 34),
                    mUnit * 0.78, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
            if (mCurrentWorkoutObjective != "") {
                drawFit(dc, cx, mUnit * 0.285, "ZIEL", mUnit * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                drawFit(dc, cx, mUnit * 0.325, compactWorkoutText(mCurrentWorkoutObjective, 58),
                    mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }
            if (mCurrentWorkoutWarmup != "") {
                drawFit(dc, cx, mUnit * 0.415, "AUFWAERMEN", mUnit * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                drawFit(dc, cx, mUnit * 0.455, compactWorkoutText(mCurrentWorkoutWarmup, 58),
                    mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }
            if (mCurrentWorkoutMainSet != "") {
                drawFit(dc, cx, mUnit * 0.545, "HAUPTTEIL", mUnit * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                drawFit(dc, cx, mUnit * 0.585, compactWorkoutText(mCurrentWorkoutMainSet, 72),
                    mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }
            if (mCurrentWorkoutCooldown != "") {
                drawFit(dc, cx, mUnit * 0.695, "ABWAERMEN", mUnit * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
                drawFit(dc, cx, mUnit * 0.735, compactWorkoutText(mCurrentWorkoutCooldown, 58),
                    mUnit * 0.78, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }
            }
        } else {
            drawPageHeader(dc, "WEITERE DATEN");
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.245, "KADENZ", cadenceNow, "RPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.245, "LEISTUNG", powerNow, "W", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.49, "HOEHE", altitude, "M", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.49, "TRAINING EFFECT", trainingEffect, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawFit(dc, cx, mUnit * 0.72, gpsText + " · GPS " + gpsAccuracy, mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawFit(dc, cx, mUnit * 0.765, "Anstieg " + ascent + " m · Abstieg " + descent + " m", mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        mButtonTop = mUnit * 0.82;
        mButtonBottom = mUnit * 0.90;
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawButton(dc, cx, mUnit * 0.81, mUnit * 0.54, "STARTEN");
        } else if (mStatus == "AUFZEICHNUNG") {
            // Page navigation replaces the old lap/end pair. Activity is never ended here.
            drawFit(dc, mScreenWidth * 0.23, mUnit * 0.835, "<", mUnit * 0.12,
                Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            for (var dot = 0; dot < mPageCount && dot < 5; dot += 1) {
                dc.setColor(dot == mPage ? 0x00E5CC : 0x555555, Graphics.COLOR_BLACK);
                dc.fillCircle((cx + ((dot - ((mPageCount < 5 ? mPageCount : 5) - 1) / 2) * mUnit * 0.055)).toNumber(),
                    (mUnit * 0.855).toNumber(), (mUnit * 0.009).toNumber());
            }
            drawFit(dc, mScreenWidth * 0.77, mUnit * 0.835, ">", mUnit * 0.12,
                Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            drawButton(dc, cx, mUnit * 0.81, mUnit * 0.54, "ERNEUT SPEICHERN");
        } else {
            drawButton(dc, cx, mUnit * 0.81, mUnit * 0.54, "ZURUECK");
        }
    }
}
