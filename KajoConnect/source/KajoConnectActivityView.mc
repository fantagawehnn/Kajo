import Toybox.Activity;
import Toybox.Attention;
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

    var mKajoLayout as KajoLayout;

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
    var mIsTransitioning as Lang.Boolean = false;
    var mTransitionCountdown as Lang.Number = 0;
    var mShowIntervalTarget as Lang.Boolean = true;
    var mShowNextInterval as Lang.Boolean = true;
    var mIntervalVibrationEnabled as Lang.Boolean = true;
    var mIntervalToneEnabled as Lang.Boolean = false;
    var mCurrentPageId as Lang.Number = 0;
    var mGpsQuality as Lang.Number = Position.QUALITY_NOT_AVAILABLE;
    // Lokaler Sekundenzaehler als verlaesslicher Fallback, falls Garmin timerTime nicht liefert.
    var mElapsedSeconds as Lang.Number = 0;

    function loadWorkoutSteps(value) as Void {
        mWorkoutSteps = [];
        mWorkoutStepIndex = 0;
        mWorkoutStepElapsedSeconds = 0;
        mWorkoutSequenceComplete = false;
        mIsTransitioning = false;
        mTransitionCountdown = 0;
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

    function loadIntervalSettings() as Void {
        var showTarget = Storage.getValue("kajoIntervalShowTarget");
        var showNext = Storage.getValue("kajoIntervalShowNext");
        var vibration = Storage.getValue("kajoIntervalVibration");
        var tone = Storage.getValue("kajoIntervalTone");
        mShowIntervalTarget = showTarget == null ? true : showTarget as Lang.Boolean;
        mShowNextInterval = showNext == null ? true : showNext as Lang.Boolean;
        mIntervalVibrationEnabled = vibration == null ? true : vibration as Lang.Boolean;
        mIntervalToneEnabled = tone == null ? false : tone as Lang.Boolean;
    }

    function notifyIntervalTransition() as Void {
        if (mIntervalVibrationEnabled && (Attention has :vibrate) && (Attention has :VibeProfile)) {
            var pattern = [new Attention.VibeProfile(75, 260)];
            Attention.vibrate(pattern);
        }
        if (mIntervalToneEnabled && (Attention has :playTone)) {
            Attention.playTone(Attention.TONE_INTERVAL_ALERT);
        }
    }

    function isRecoveryStep(step as Lang.Dictionary) as Lang.Boolean {
        var stepType = step["type"];
        return stepType != null &&
            (stepType.toString() == "recovery" ||
             stepType.toString() == "rest" ||
             stepType.toString() == "pause");
    }

    function nextStepDescription() as Lang.String {
        var nextIndex = mWorkoutStepIndex + 1;
        if (nextIndex >= mWorkoutSteps.size()) { return "TRAINING BEENDET"; }
        var nextStep = mWorkoutSteps[nextIndex] as Lang.Dictionary;
        var label = nextStep["label"] == null ? "NÄCHSTER ABSCHNITT" : nextStep["label"].toString();
        return compactWorkoutText(label, 42);
    }

    function nextStepSummary() as Lang.String {
        var nextIndex = mWorkoutStepIndex + 1;
        if (nextIndex >= mWorkoutSteps.size()) { return ""; }
        var nextStep = mWorkoutSteps[nextIndex] as Lang.Dictionary;
        var duration = nextStep["durationSeconds"] as Lang.Number;
        var label = nextStep["label"] == null ? "NÄCHSTER ABSCHNITT" : nextStep["label"].toString();
        return "NÄCHSTES: " + formatTime(duration * 1000) + " " + compactWorkoutText(label, 28);
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
        mIsTransitioning = false;
        mTransitionCountdown = 0;
    }

    function updateWorkoutStepTimer() as Void {
        if (mWorkoutSteps.size() == 0 || mWorkoutSequenceComplete) { return; }
        var step = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
        var duration = step["durationSeconds"] as Lang.Number;
        var hasNextStep = mWorkoutStepIndex + 1 < mWorkoutSteps.size();

        if (mIsTransitioning) {
            // Countdown läuft innerhalb der letzten drei Sekunden des aktuellen Abschnitts.
            mWorkoutStepElapsedSeconds += 1;
            if (mTransitionCountdown > 1) {
                mTransitionCountdown -= 1;
            } else {
                mIsTransitioning = false;
                mTransitionCountdown = 0;
                mWorkoutStepIndex += 1;
                mWorkoutStepElapsedSeconds = 0;
                // Vibrationssignal genau beim Start der neuen Belastungs- oder Erholungsphase.
                notifyIntervalTransition();
                WatchUi.showToast("Neuer Trainingsabschnitt", null);
            }
            return;
        }

        mWorkoutStepElapsedSeconds += 1;
        var remaining = duration - mWorkoutStepElapsedSeconds;
        if (hasNextStep && remaining > 0 && remaining <= 3) {
            mIsTransitioning = true;
            mTransitionCountdown = remaining;
            return;
        }

        if (remaining <= 0) {
            if (hasNextStep) {
                mWorkoutStepIndex += 1;
                mWorkoutStepElapsedSeconds = 0;
                notifyIntervalTransition();
                WatchUi.showToast("Neuer Trainingsabschnitt", null);
            } else {
                mWorkoutSequenceComplete = true;
                mWorkoutStepElapsedSeconds = duration;
                WatchUi.showToast("Trainingsablauf abgeschlossen", null);
                if (mIntervalVibrationEnabled && (Attention has :vibrate) && (Attention has :VibeProfile)) {
                    var finishedPattern = [new Attention.VibeProfile(85, 500)];
                    Attention.vibrate(finishedPattern);
                }
            }
        }
    }

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
        loadIntervalSettings();
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
            tileWidth = mKajoLayout.safeRectWidthAt(x, tileTop, tileHeight, tileWidth);
            drawDashboardPanel(dc, x - (tileWidth / 2), tileTop, tileWidth, tileHeight);

            var label = getCustomMetricLabel(metricId);
            var value = getCustomMetricValue(metricId, values);
            var unit = getCustomMetricUnit(metricId);
            drawActivityText(dc, x, tileTop + 4, (tileWidth * 0.88).toNumber(), 14,
                label, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawActivityText(dc, x, tileTop + 22, (tileWidth * 0.88).toNumber(), 25,
                value, valueFont, Graphics.COLOR_WHITE);
            if (unit != "") {
                drawActivityText(dc, x, tileTop + 50, (tileWidth * 0.88).toNumber(), 14,
                    unit, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
        }
    }

    function drawDashboardPanel(dc as Dc, x, y, width, height) as Void {
        // Einheitliche horizontale Flaeche statt abgerundeter Datenkarte.
        dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
        dc.fillRectangle(x.toNumber(), y.toNumber(), width.toNumber(), height.toNumber());
        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.fillRectangle(x.toNumber(), y.toNumber(), 4, height.toNumber());
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(x.toNumber(), (y + height).toNumber(),
            (x + width).toNumber(), (y + height).toNumber());
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
        distance as Lang.String, speedNow as Lang.String, cadenceNow as Lang.String,
        zone as Lang.Number, activityInfo) as Void {

        var stepCount = mWorkoutSteps.size();
        var timerText = elapsed;
        var statusText = mBoatClass + " · FREI";
        var targetText = "";
        var phaseColor = 0x25D3CB;

        if (stepCount > 0 && !mWorkoutSequenceComplete && !mIsTransitioning) {
            var step = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            statusText = "INTERVALL " + (mWorkoutStepIndex + 1).toString() + "/" + stepCount.toString();
            var remaining = (step["durationSeconds"] as Lang.Number) - mWorkoutStepElapsedSeconds;
            if (remaining < 0) { remaining = 0; }
            timerText = formatTime(remaining * 1000);
            if (mShowIntervalTarget && step["target"] != null && step["target"].toString() != "") {
                targetText = "ZIEL: " + step["target"].toString();
            }
            var stepType = step["type"];
            if (stepType != null &&
                (stepType.toString() == "recovery" || stepType.toString() == "rest" ||
                 stepType.toString() == "pause")) {
                phaseColor = 0xFFB020;
                statusText += " · ERHOLEN";
            } else {
                statusText += " · PADDELN!";
            }
        } else if (mWorkoutSequenceComplete) {
            statusText = "TRAINING ABGESCHLOSSEN";
        }

        drawActivityText(dc, cx, 35, 280, 20, statusText,
            Graphics.FONT_SMALL, phaseColor);

        // Fortschritt des aktuellen Abschnitts als schmaler Aussenbogen.
        if (stepCount > 0 && !mWorkoutSequenceComplete) {
            var activeStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            var activeDuration = activeStep["durationSeconds"] as Lang.Number;
            var progress = activeDuration > 0 ? mWorkoutStepElapsedSeconds / activeDuration : 0.0;
            if (progress < 0) { progress = 0; }
            if (progress > 1) { progress = 1; }
            var progressEnd = 215 + (110 * progress);
            dc.setColor(0x263238, Graphics.COLOR_BLACK);
            dc.drawArc(cx, 195, 178, Graphics.ARC_CLOCKWISE, 215, 325);
            dc.setColor(phaseColor, Graphics.COLOR_BLACK);
            if (progressEnd > 215) {
                dc.drawArc(cx, 195, 178, Graphics.ARC_CLOCKWISE, 215, progressEnd);
            }
        }
        drawActivityText(dc, cx, 86, 270, 58, timerText,
            Graphics.FONT_NUMBER_HOT, phaseColor);
        drawActivityText(dc, cx, 143, 120, 16, "MIN : SEK",
            Graphics.FONT_XTINY, 0x98A5AB);
        if (targetText != "") {
            drawActivityText(dc, cx, 163, 280, 18, targetText,
                Graphics.FONT_XTINY, phaseColor);
        }
        if (mShowNextInterval && stepCount > 0 && !mWorkoutSequenceComplete) {
            var nextText = nextStepSummary();
            if (nextText != "") {
                drawActivityText(dc, cx, 182, 280, 16, nextText,
                    Graphics.FONT_XTINY, 0x98A5AB);
            }
        }

        var pace = "--:--";
        if (activityInfo != null && activityInfo.currentSpeed != null) {
            pace = formatPace(activityInfo.currentSpeed * 3.6);
        }

        // Vier Datenfelder ohne Karten: zwei Spalten, getrennt durch feine Linien.
        var left = 72;
        var right = 268;
        var top = 205;
        var rowHeight = 64;
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(195, top, 195, top + (rowHeight * 2));
        dc.drawLine(72, top + rowHeight, 318, top + rowHeight);

        drawActivityText(dc, left, top + 5, 118, 14, "SCHLÄGE",
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, left, top + 22, 118, 30, cadenceNow,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawActivityText(dc, left, top + 49, 118, 12, "SPM",
            Graphics.FONT_XTINY, 0x98A5AB);

        drawActivityText(dc, right, top + 5, 118, 14, "HERZFREQUENZ",
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, right, top + 17, 118, 27, hrNow,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawActivityText(dc, right, top + 44, 118, 11,
            zone > 0 ? "BPM · ZONE " + zone.toString() : "BPM · ZONE –",
            Graphics.FONT_XTINY, zone > 0 ? 0xFF453A : 0x98A5AB);
        var zoneColors = [0x4CD964, 0x9BE15D, 0xFFD23F, 0xFF9F1A, 0xFF453A];
        var zoneBarLeft = right - 48;
        var zoneBarWidth = 18;
        for (var zoneIndex = 0; zoneIndex < 5; zoneIndex += 1) {
            dc.setColor(zone == zoneIndex + 1 ? zoneColors[zoneIndex] : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(zoneBarLeft + (zoneIndex * 20), top + 57, zoneBarWidth, 5);
        }

        drawActivityText(dc, left, top + rowHeight + 5, 118, 14, "DISTANZ",
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, left, top + rowHeight + 22, 118, 30, distance,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawActivityText(dc, left, top + rowHeight + 49, 118, 12, "KM",
            Graphics.FONT_XTINY, 0x98A5AB);

        drawActivityText(dc, right, top + rowHeight + 5, 118, 14, "PACE",
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, right, top + rowHeight + 22, 118, 30, pace,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawActivityText(dc, right, top + rowHeight + 49, 118, 12, "MIN/KM",
            Graphics.FONT_XTINY, 0x98A5AB);

        // Die Seitennavigation erfolgt per Wischgeste; es gibt keine Bildschirm-Pfeile.
        mButtonTop = 0;
        mButtonBottom = 0;
    }

    function drawHeartRateZone(dc as Dc, centerX, top, width, zone as Lang.Number) as Void {
        var colors = [0x4CD964, 0x9BE15D, 0xFFD23F, 0xFF9F1A, 0xFF453A];
        drawFit(dc, centerX, top, zone > 0 ? "ZONE " + zone.toString() : "ZONE –",
            width, Graphics.FONT_XTINY, zone > 0 ? colors[zone - 1] : 0x98A5AB);
        var segmentGap = 4;
        var segmentWidth = (width - (segmentGap * 4)) / 5;
        var barTop = top + 18;
        var barHeight = 7;
        var left = centerX - (width / 2);
        for (var i = 0; i < 5; i += 1) {
            var x = left + (i * (segmentWidth + segmentGap));
            dc.setColor(zone == i + 1 ? colors[i] : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(x.toNumber(), barTop.toNumber(),
                segmentWidth.toNumber(), barHeight);
        }
    }

    function startRecording() as Void {
        var started = mEngine.start(mBoatClass);
        if (started) {
            mStatus = "AUFZEICHNUNG";
            mElapsedSeconds = 0;
            mWorkoutStepIndex = 0;
            mWorkoutStepElapsedSeconds = 0;
            mWorkoutSequenceComplete = false;
            mIsTransitioning = false;
            mTransitionCountdown = 0;
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function pauseRecording() as Void {
        if (mEngine.pause()) {
            mTimer.stop();
            mStatus = "PAUSIERT";
        } else {
            WatchUi.showToast("Pause konnte nicht aktiviert werden", null);
        }
        WatchUi.requestUpdate();
    }

    function resumeRecording() as Void {
        if (mEngine.resume()) {
            mStatus = "AUFZEICHNUNG";
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            WatchUi.showToast("Training konnte nicht fortgesetzt werden", null);
        }
        WatchUi.requestUpdate();
    }

    function onTimer() as Void {
        if (mStatus == "AUFZEICHNUNG") { mElapsedSeconds += 1; }
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
            pauseRecording();
        } else if (mStatus == "PAUSIERT") {
            resumeRecording();
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            finishRecording();
        } else if (mStatus == "GESPEICHERT") {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }

    function handleLapButton() as Lang.Boolean {
        if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            WatchUi.showToast("Bitte zuerst erneut speichern", null);
            return true;
        }
        if (mStatus == "PAUSIERT") {
            finishRecording();
            return true;
        }
        if (mStatus != "AUFZEICHNUNG") { return false; }
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
        return mKajoLayout.fitFont(dc, text, maxWidth, preferredFont);
    }
    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }


    function drawActivityText(dc as Dc, x as Lang.Number, top as Lang.Number,
        width as Lang.Number, height as Lang.Number, text as Lang.String,
        preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextBox(dc, x, top, width, height, text, preferredFont, color);
    }

    function drawPageHeader(dc as Dc, title as Lang.String) as Void {
        // Fester Kopfbereich fuer das 390 x 390 Pixel grosse Venu-3S-Display.
        drawActivityText(dc, 195, 30, 260, 24, title, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
    }

    function drawMetric(dc as Dc, x, y, label as Lang.String, value as Lang.String,
        unit as Lang.String, maxWidth, valueFont) as Void {
        var panelTop = y - (mUnit * 0.025);
        var panelHeight = mUnit * 0.19;
        var panelWidth = mKajoLayout.safeRectWidthAt(x, panelTop, panelHeight, maxWidth);
        drawDashboardPanel(dc, x - (panelWidth / 2), panelTop, panelWidth, panelHeight);
        // Drei feste Textzeilen innerhalb der Kachel; keine Zeile darf die naechste beruehren.
        drawActivityText(dc, x, panelTop + 5, (panelWidth * 0.86).toNumber(), 14,
            label, Graphics.FONT_XTINY, 0xA0AAB2);
        drawActivityText(dc, x, panelTop + 23, (panelWidth * 0.86).toNumber(), 25,
            value, valueFont, Graphics.COLOR_WHITE);
        if (unit != "") {
            drawActivityText(dc, x, panelTop + 51, (panelWidth * 0.86).toNumber(), 14,
                unit, Graphics.FONT_XTINY, 0xA0AAB2);
        }
    }

    function drawButton(dc as Dc, centerX, top, width, label as Lang.String) as Void {
        var height = mButtonBottom - mButtonTop;
        var safeWidth = mKajoLayout.safeRectWidth(top, height, width);
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
            Math.round(top + (height - dc.getFontHeight(mKajoLayout.fontForPercent(dc, 0.055))) / 2).toNumber(),
            label,
            safeWidth * 0.86,
            Graphics.FONT_SMALL,
            Graphics.COLOR_WHITE
        );
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mScreenWidth = 390;
        mScreenHeight = 390;
        mUnit = 390;
        mKajoLayout.configure(390, 390);

        var cx = 195;
        mButtonTop = 340;
        mButtonBottom = 375;
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
        var elapsed = (mStatus == "AUFZEICHNUNG" || mStatus == "PAUSIERT" || mStatus == "GESPEICHERT" || mStatus == "SPEICHERN FEHLGESCHLAGEN") ? formatTime(mElapsedSeconds * 1000) : "00:00";
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
            if (activityInfo.timerTime != null && activityInfo.timerTime > 0) {
                elapsed = formatTime(activityInfo.timerTime);
            } else if (activityInfo.elapsedTime != null && activityInfo.elapsedTime > 0) {
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
            drawActivityText(dc, cx, 125, 280, 24, compactWorkoutText(mCurrentWorkoutName, 32),
                Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawActivityText(dc, cx, 166, 220, 38, mBoatClass,
                Graphics.FONT_NUMBER_MEDIUM, 0x25D3CB);
            drawActivityText(dc, cx, 216, 260, 18, "GPS · " + gpsText + "   PULS · " + hrNow,
                Graphics.FONT_XTINY, 0x98A5AB);
            if (mStatus == "START FEHLGESCHLAGEN") {
                drawActivityText(dc, cx, 260, 280, 18, "START NICHT MÖGLICH",
                    Graphics.FONT_XTINY, 0xFF9F1A);
            }
            drawActivityText(dc, cx, 326, 280, 18, "OBERE TASTE · STARTEN",
                Graphics.FONT_XTINY, 0x25D3CB);
            drawActivityText(dc, cx, 354, 280, 18, "UNTERE TASTE · ZURÜCK",
                Graphics.FONT_XTINY, 0x98A5AB);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mStatus == "PAUSIERT") {
            drawPageHeader(dc, "PAUSIERT");
            drawActivityText(dc, cx, 115, 280, 66, elapsed,
                Graphics.FONT_NUMBER_HOT, 0xFFB020);
            if (mWorkoutSteps.size() > 0 && !mWorkoutSequenceComplete) {
                var pausedStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
                drawActivityText(dc, cx, 202, 280, 22,
                    "INTERVALL " + (mWorkoutStepIndex + 1).toString() + "/" + mWorkoutSteps.size().toString(),
                    Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
                drawActivityText(dc, cx, 231, 280, 20,
                    compactWorkoutText(pausedStep["label"].toString(), 38),
                    Graphics.FONT_XTINY, 0x98A5AB);
            } else {
                drawActivityText(dc, cx, 210, 280, 20, mCurrentWorkoutName,
                    Graphics.FONT_XTINY, 0x98A5AB);
            }
            drawActivityText(dc, cx, 316, 280, 18, "OBERE TASTE · WEITER",
                Graphics.FONT_XTINY, 0x25D3CB);
            drawActivityText(dc, cx, 345, 280, 18, "UNTERE TASTE · BEENDEN",
                Graphics.FONT_XTINY, 0xFFB020);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mStatus == "GESPEICHERT") {
            drawPageHeader(dc, "TRAINING BEENDET");
            drawActivityText(dc, cx, 132, 280, 55, elapsed,
                Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
            drawActivityText(dc, cx, 207, 280, 18, "FIT-DATEI GESPEICHERT",
                Graphics.FONT_XTINY, 0x25D3CB);
            drawActivityText(dc, cx, 335, 280, 18, "OBERE TASTE · ZURÜCK",
                Graphics.FONT_XTINY, 0x98A5AB);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            drawPageHeader(dc, "SPEICHERFEHLER");
            drawActivityText(dc, cx, 180, 280, 22, "BITTE ERNEUT SPEICHERN",
                Graphics.FONT_SMALL, 0xFF9F1A);
            drawActivityText(dc, cx, 335, 280, 18, "ERNEUT SPEICHERN",
                Graphics.FONT_XTINY, 0x25D3CB);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mIsTransitioning && mStatus == "AUFZEICHNUNG") {
            drawPageHeader(dc, "GLEICH");
            drawActivityText(dc, cx, 88, 260, 112, mTransitionCountdown.toString(),
                Graphics.FONT_NUMBER_HOT, 0x25D3CB);
            var nextLabel = nextStepDescription();
            var nextPhase = "PADDELN!";
            var nextColor = 0x25D3CB;
            if (mWorkoutStepIndex + 1 < mWorkoutSteps.size()) {
                var nextStep = mWorkoutSteps[mWorkoutStepIndex + 1] as Lang.Dictionary;
                if (isRecoveryStep(nextStep)) {
                    nextPhase = "ERHOLEN";
                    nextColor = 0xFFB020;
                }
            } else {
                nextPhase = "ABSCHLUSS";
            }
            drawActivityText(dc, cx, 220, 260, 24, nextPhase,
                Graphics.FONT_SMALL, nextColor);
            if (mShowNextInterval) {
                drawActivityText(dc, cx, 252, 280, 22, nextLabel,
                    Graphics.FONT_XTINY, 0x98A5AB);
            }
            dc.setColor(0x263238, Graphics.COLOR_BLACK);
            dc.drawArc(cx, 195, 178, Graphics.ARC_CLOCKWISE, 205, 335);
            var countdownProgress = mTransitionCountdown / 3.0;
            var countdownEnd = 205 + (130 * countdownProgress);
            dc.setColor(0xFFB020, Graphics.COLOR_BLACK);
            if (countdownEnd > 205) {
                dc.drawArc(cx, 195, 178, Graphics.ARC_CLOCKWISE, 205, countdownEnd);
            }
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mCurrentPageId == 0) {
            drawActivityDashboard(dc, cx, hrNow, elapsed, distance, speedNow, cadenceNow, currentHeartRateZone, activityInfo);
        } else if (mCurrentPageId == 1) {
            drawPageHeader(dc, "GESCHWINDIGKEIT");
            drawMetric(dc, cx, 115, "AKTUELL", speedNow, "KM/H", 260, Graphics.FONT_LARGE);
            drawMetric(dc, 112, 245, "DURCHSCHNITT", speedAvg, "KM/H", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 278, 245, "MAXIMUM", speedMax, "KM/H", 145, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 2) {
            drawPageHeader(dc, "HERZFREQUENZ");
            drawMetric(dc, cx, 115, "AKTUELL", hrNow, "BPM", 260, Graphics.FONT_LARGE);
            drawMetric(dc, 112, 235, "DURCHSCHNITT", hrAvg, "BPM", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 278, 235, "MAXIMUM", hrMax, "BPM", 145, Graphics.FONT_MEDIUM);
            drawHeartRateZone(dc, cx, 310, 220, currentHeartRateZone);
        } else if (mCurrentPageId == 3) {
            drawPageHeader(dc, "DISTANZ & ZEIT");
            drawMetric(dc, cx, 115, "DISTANZ", distance, "KM", 260, Graphics.FONT_LARGE);
            drawMetric(dc, 112, 245, "ZEIT", elapsed, "", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 278, 245, "KALORIEN", calories, "KCAL", 145, Graphics.FONT_MEDIUM);
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
            mButtonTop = 340;
            mButtonBottom = 375;
        } else if (mCurrentPageId == 8) {
            drawPageHeader(dc, "INTERVALLPLAN");
            if (mWorkoutSteps.size() > 0) {
                var firstStep = Math.floor(mWorkoutStepIndex / 5) * 5;
                var visibleSteps = 5;
                var rowTop = 78;
                var rowHeight = 49;
                var rowWidth = mKajoLayout.safeRectWidth(rowTop, 39, 300);
                var rowLeft = cx - (rowWidth / 2);
                for (var stepRow = 0; stepRow < visibleSteps; stepRow += 1) {
                    var stepIndex = firstStep + stepRow;
                    if (stepIndex >= mWorkoutSteps.size()) { continue; }
                    var planStep = mWorkoutSteps[stepIndex] as Lang.Dictionary;
                    var rowY = rowTop + (stepRow * rowHeight);
                    var isCurrent = stepIndex == mWorkoutStepIndex && !mWorkoutSequenceComplete && !mIsTransitioning;
                    var isDone = stepIndex < mWorkoutStepIndex || mWorkoutSequenceComplete;
                    var stepColor = isCurrent ? 0x25D3CB : (isDone ? 0x56636A : 0x98A5AB);
                    var marker = isDone ? "✓" : (isCurrent ? "▶" : (stepIndex + 1).toString());
                    var duration = planStep["durationSeconds"] as Lang.Number;
                    var durationText = formatTime(duration * 1000);
                    var stepName = planStep["label"] == null ? "ABSCHNITT" : planStep["label"].toString();
                    var target = planStep["target"] == null ? "" : planStep["target"].toString();
                    var typeText = isRecoveryStep(planStep) ? "ERHOLEN" : "BELASTUNG";
                    dc.setColor(isCurrent ? 0x0A2A2C : 0x0B1114, Graphics.COLOR_BLACK);
                    dc.fillRectangle(rowLeft.toNumber(), rowY.toNumber(), rowWidth.toNumber(), 39);
                    dc.setColor(stepColor, Graphics.COLOR_BLACK);
                    dc.fillRectangle(rowLeft.toNumber(), rowY.toNumber(), 4, 39);
                    drawActivityText(dc, cx - rowWidth * 0.32, rowY + 3, rowWidth * 0.14, 30,
                        marker, Graphics.FONT_SMALL, stepColor);
                    drawActivityText(dc, cx + rowWidth * 0.05, rowY + 3, rowWidth * 0.60, 16,
                        compactWorkoutText(stepName, 30), Graphics.FONT_XTINY,
                        isCurrent ? Graphics.COLOR_WHITE : stepColor);
                    var detail = durationText + " · " + typeText;
                    if (target != "") { detail += " · " + compactWorkoutText(target, 18); }
                    drawActivityText(dc, cx + rowWidth * 0.05, rowY + 20, rowWidth * 0.60, 14,
                        detail, Graphics.FONT_XTINY, isCurrent ? 0x25D3CB : 0x98A5AB);
                    if (stepRow < visibleSteps - 1) {
                        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                        dc.drawLine(rowLeft.toNumber(), rowY + 42,
                            (rowLeft + rowWidth).toNumber(), rowY + 42);
                    }
                }
                var pageCount = Math.floor(mWorkoutSteps.size() / 5);
                if ((mWorkoutSteps.size() % 5) > 0) { pageCount += 1; }
                drawActivityText(dc, cx, 330, 260, 16,
                    "ABSCHNITTE " + (firstStep + 1).toString() + "–" +
                    ((firstStep + 5) < mWorkoutSteps.size() ? (firstStep + 5).toString() : mWorkoutSteps.size().toString()) +
                    " / " + mWorkoutSteps.size().toString(),
                    Graphics.FONT_XTINY, 0x98A5AB);
            } else {
                drawActivityText(dc, cx, 180, 260, 22, "KEIN INTERVALLPLAN",
                    Graphics.FONT_SMALL, 0x98A5AB);
            }
            mButtonTop = 0;
            mButtonBottom = 0;
        } else {
            drawPageHeader(dc, "WEITERE DATEN");
            drawMetric(dc, 112, 135, "KADENZ", cadenceNow, "RPM", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 278, 135, "LEISTUNG", powerNow, "W", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 112, 245, "HOEHE", altitude, "M", 145, Graphics.FONT_MEDIUM);
            drawMetric(dc, 278, 245, "TRAINING EFFECT", trainingEffect, "", 145, Graphics.FONT_MEDIUM);
            drawFit(dc, 195, 325, gpsText + " · GPS " + gpsAccuracy, 260, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            mButtonTop = 340;
            mButtonBottom = 375;
        }

        if (mStatus == "AUFZEICHNUNG" && !mIsTransitioning) {
            // Nur dezente Seitenpunkte; die Navigation erfolgt per Wischgeste.
            var visibleDots = mPageCount < 5 ? mPageCount : 5;
            var firstDotX = 195 - ((visibleDots - 1) * 9);
            for (var dot = 0; dot < visibleDots; dot += 1) {
                dc.setColor(dot == (mPage < 5 ? mPage : 4) ? 0x00E5CC : 0x555555, Graphics.COLOR_BLACK);
                dc.fillCircle(firstDotX + (dot * 18), 354, 3);
            }
        }
    }
}
