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
    var mApi as KajoConnectApi;
    var mUploadInFlight as Lang.Boolean = false;
    var mUploadInFlightId as Lang.String = "";
    var mStartTimestamp as Lang.Number = 0;
    var mStartDateIso as Lang.String = "";
    var mStartDateDisplay as Lang.String = "";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    var mBoatClass as Lang.String;
    var mEngine;
    var mTimer;
    var mStatus = "BEREIT";
    var mStartError as Lang.String = "";
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
    var mTrainingFieldCount as Lang.Number = 4;
    var mTrainingShowStatus as Lang.Boolean = true;
    var mTrainingShowHR as Lang.Boolean = true;
    var mTrainingShowCadence as Lang.Boolean = true;
    var mTrainingShowDistance as Lang.Boolean = true;
    var mTrainingShowPace as Lang.Boolean = true;
    var mStepStartDistanceMeters = null;
    var mCurrentPageId as Lang.Number = 0;
    var mGpsQuality as Lang.Number = Position.QUALITY_NOT_AVAILABLE;
    // Lokaler Sekundenzaehler als verlaesslicher Fallback, falls Garmin timerTime nicht liefert.
    var mElapsedSeconds as Lang.Number = 0;
    var mDebugTimerTicks as Lang.Number = 0;
    var mShowPauseDebug as Lang.Boolean = false;
    var mFinalDistance as Lang.String = "--";
    var mFinalAverageHeartRate as Lang.String = "--";
    var mFinalDistanceMeters = null;
    var mFinalAverageHeartRateValue = null;
    var mFinalAverageSpeedKmh as Lang.String = "--";
    var mFinalMaxSpeedKmh as Lang.String = "--";
    var mFinalMaxHeartRate as Lang.String = "--";
    var mFinalCalories as Lang.String = "--";
    var mFinalAscent as Lang.String = "--";
    var mFinalLaps as Lang.Array<Lang.Dictionary> = [];
    var mSavedDetailPage as Lang.Number = 0;
    var mSavedLapOffset as Lang.Number = 0;
    var mHistoryEntrySaved as Lang.Boolean = false;
    var mDiscardConfirmationStage as Lang.Number = 0;
    // Rundenmetriken werden lokal aus den sekündlichen Activity.Info-Werten berechnet,
    // da TIMER_EVENT_LAP keinen durchschnittlichen Rundenpuls bereitstellt.
    var mLapStartTimerMs as Lang.Number = 0;
    var mLapStartDistanceMeters = null;
    var mLapHeartRateSum as Lang.Number = 0;
    var mLapHeartRateCount as Lang.Number = 0;
    var mNextAutoLapDistanceMeters as Lang.Number = 1000;
    var mLiveLapSummaries as Lang.Array<Lang.Dictionary> = [];
    var mLapSummaryVisible as Lang.Boolean = false;
    var mLapSummarySecondsRemaining as Lang.Number = 0;
    var mLapSummaryNumber as Lang.Number = 0;
    var mLapSummaryTime as Lang.String = "--:--";
    var mLapSummaryDistance as Lang.String = "--";
    var mLapSummaryHeartRate as Lang.String = "--";

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

    function loadTrainingFieldSettings() as Void {
        var count = Storage.getValue("kajoTrainingFieldCount");
        if (count == 2 || count == 4) {
            mTrainingFieldCount = count as Lang.Number;
        } else {
            mTrainingFieldCount = 4;
        }
        var showStatus = Storage.getValue("kajoTrainingShowStatus");
        var showHR = Storage.getValue("kajoTrainingShowHR");
        var showCadence = Storage.getValue("kajoTrainingShowCadence");
        var showDistance = Storage.getValue("kajoTrainingShowDistance");
        var showPace = Storage.getValue("kajoTrainingShowPace");
        mTrainingShowStatus = showStatus == null ? true : showStatus as Lang.Boolean;
        mTrainingShowHR = showHR == null ? true : showHR as Lang.Boolean;
        mTrainingShowCadence = showCadence == null ? true : showCadence as Lang.Boolean;
        mTrainingShowDistance = showDistance == null ? true : showDistance as Lang.Boolean;
        mTrainingShowPace = showPace == null ? true : showPace as Lang.Boolean;
    }

    function setStepDistanceBaseline() as Void {
        mStepStartDistanceMeters = null;
        var info = Activity.getActivityInfo();
        if (info != null && info.elapsedDistance != null) {
            mStepStartDistanceMeters = info.elapsedDistance;
        }
    }

    function intervalDistanceText(activityInfo) as Lang.String {
        if (activityInfo == null || activityInfo.elapsedDistance == null ||
            mStepStartDistanceMeters == null) { return "--"; }
        var travelled = activityInfo.elapsedDistance - (mStepStartDistanceMeters as Lang.Number);
        if (travelled < 0) { return "--"; }
        return numberText(travelled / 1000.0, 2);
    }

    function drawDataField(dc as Dc, centerX as Lang.Number, top as Lang.Number,
        width as Lang.Number, label as Lang.String, value as Lang.String,
        unit as Lang.String) as Void {
        drawActivityText(dc, centerX, top + 3, width, 14, label,
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, centerX, top + 19, width, 28, value,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        if (unit != "") {
            drawActivityText(dc, centerX, top + 48, width, 12, unit,
                Graphics.FONT_XTINY, 0x98A5AB);
        }
    }

    function drawHeartRateField(dc as Dc, centerX as Lang.Number, top as Lang.Number,
        width as Lang.Number, hrNow as Lang.String, zone as Lang.Number) as Void {
        drawActivityText(dc, centerX, top + 2, width, 14, "PULS",
            Graphics.FONT_XTINY, 0x98A5AB);
        drawActivityText(dc, centerX, top + 18, width, 28, hrNow,
            Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        drawActivityText(dc, centerX, top + 45, width, 12,
            zone > 0 ? "BPM · Z" + zone.toString() : "BPM · --",
            Graphics.FONT_XTINY, zone > 0 ? 0xFF453A : 0x98A5AB);
        var colors = [0x4CD964, 0x9BE15D, 0xFFD23F, 0xFF9F1A, 0xFF453A];
        var barWidth = width * 0.82;
        var segmentGap = 3;
        var segmentWidth = (barWidth - (segmentGap * 4)) / 5;
        var left = centerX - (barWidth / 2);
        for (var i = 0; i < 5; i += 1) {
            dc.setColor(zone == i + 1 ? colors[i] : 0x344047, Graphics.COLOR_BLACK);
            dc.fillRectangle(left + (i * (segmentWidth + segmentGap)),
                top + 60, segmentWidth, 5);
        }
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
        if (nextIndex >= mWorkoutSteps.size()) { return "GESPEICHERT"; }
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
                setStepDistanceBaseline();
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
                setStepDistanceBaseline();
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

    function onShow() as Void {
        syncPendingActivityUploads();
    }

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mApi = new KajoConnectApi();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
        loadIntervalSettings();
        loadTrainingFieldSettings();
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

    function drawHeartRateZoneBar(dc as Dc, centerX as Lang.Number,
        centerY as Lang.Number, radius as Lang.Number, zone as Lang.Number) as Void {
        // Fuenf farbige Segmente am rechten Displayrand; die aktuelle Zone
        // wird hell hervorgehoben, die uebrigen bleiben dezent sichtbar.
        var colors = [0x20D98A, 0x8BE34A, 0xE3E84A, 0xFFB52E, 0xF04455];
        var dimColors = [0x155A43, 0x426A2B, 0x777A28, 0x80551D, 0x762A35];
        var startAngle = -68.0;

        for (var segment = 0; segment < 5; segment += 1) {
            var segmentColor = zone == segment + 1 ? colors[segment] : dimColors[segment];
            dc.setColor(segmentColor, Graphics.COLOR_BLACK);
            for (var thickness = -1; thickness <= 1; thickness += 1) {
                var drawRadius = radius + thickness;
                var previousX = centerX + (Math.cos(startAngle * 0.0174533) * drawRadius);
                var previousY = centerY + (Math.sin(startAngle * 0.0174533) * drawRadius);
                for (var step = 1; step <= 8; step += 1) {
                    var angle = startAngle + (step * 2.75);
                    var nextX = centerX + (Math.cos(angle * 0.0174533) * drawRadius);
                    var nextY = centerY + (Math.sin(angle * 0.0174533) * drawRadius);
                    dc.drawLine(
                        Math.round(previousX).toNumber(), Math.round(previousY).toNumber(),
                        Math.round(nextX).toNumber(), Math.round(nextY).toNumber()
                    );
                    previousX = nextX;
                    previousY = nextY;
                }
            }
            startAngle += 28.0;
        }
    }

    function formatPace(speedKmh) as Lang.String {
        if (speedKmh == null || speedKmh <= 0.1) { return "--:--"; }
        var totalSeconds = Math.round(3600.0 / speedKmh).toNumber();
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds - (minutes * 60);
        return minutes.toString() + ":" + (seconds < 10 ? "0" : "") + seconds.toString();
    }

    function liveMetricLabel(metricId as Lang.String) as Lang.String {
        if (metricId == "cadence") { return "SCHLAGFREQUENZ"; }
        if (metricId == "heartRate") { return "HERZFREQUENZ"; }
        if (metricId == "heartRateZone") { return "HF-ZONE"; }
        if (metricId == "distance") { return "DISTANZ"; }
        if (metricId == "intervalDistance") { return "INT.-DISTANZ"; }
        if (metricId == "pace") { return "PACE"; }
        if (metricId == "speedNow") { return "GESCHWINDIGKEIT"; }
        if (metricId == "speedAvg") { return "Ø GESCHWINDIGKEIT"; }
        if (metricId == "speedMax") { return "MAX. GESCHWINDIGKEIT"; }
        if (metricId == "heartRateAvg") { return "Ø HERZFREQUENZ"; }
        if (metricId == "heartRateMax") { return "MAX. HERZFREQUENZ"; }
        if (metricId == "elapsed") { return "TRAININGSZEIT"; }
        if (metricId == "calories") { return "KALORIEN"; }
        if (metricId == "power") { return "LEISTUNG"; }
        if (metricId == "altitude") { return "HÖHE"; }
        if (metricId == "ascent") { return "ANSTIEG"; }
        if (metricId == "descent") { return "ABSTIEG"; }
        if (metricId == "trainingEffect") { return "TRAINING EFFECT"; }
        return "DATENFELD";
    }

    function liveMetricUnit(metricId as Lang.String) as Lang.String {
        if (metricId == "cadence") { return "SPM"; }
        if (metricId == "heartRate" || metricId == "heartRateAvg" || metricId == "heartRateMax") { return "BPM"; }
        if (metricId == "distance" || metricId == "intervalDistance") { return "KM"; }
        if (metricId == "pace") { return "MIN/KM"; }
        if (metricId == "speedNow" || metricId == "speedAvg" || metricId == "speedMax") { return "KM/H"; }
        if (metricId == "calories") { return "KCAL"; }
        if (metricId == "power") { return "W"; }
        if (metricId == "altitude" || metricId == "ascent" || metricId == "descent") { return "M"; }
        return "";
    }

    function liveMetricValue(metricId as Lang.String, values as Lang.Dictionary) as Lang.String {
        var value = values[metricId];
        return value == null ? "--" : value.toString();
    }

    function drawLiveMetricField(dc as Dc, centerX as Lang.Number, top as Lang.Number,
        width as Lang.Number, metricId as Lang.String, values as Lang.Dictionary,
        large as Lang.Boolean) as Void {
        var label = liveMetricLabel(metricId);
        var value = liveMetricValue(metricId, values);
        var unit = liveMetricUnit(metricId);
        var labelFont = Graphics.FONT_XTINY;
        var valueFont = large ? Graphics.FONT_NUMBER_HOT : Graphics.FONT_NUMBER_MEDIUM;
        drawActivityText(dc, centerX, top, width, 16, label, labelFont, 0x98A5AB);
        drawActivityText(dc, centerX, top + 17, width, large ? 40 : 32, value,
            valueFont, Graphics.COLOR_WHITE);
        if (unit != "") {
            drawActivityText(dc, centerX, top + (large ? 57 : 48), width, 14, unit,
                Graphics.FONT_XTINY, 0x98A5AB);
        }
    }

    function getLiveMetricIds(count as Lang.Number) as Lang.Array<Lang.String> {
        var defaults = count == 2
            ? ["cadence", "heartRate"]
            : ["cadence", "distance", "pace", "heartRate"];
        var selected = [];
        for (var i = 0; i < count; i += 1) {
            var saved = Storage.getValue("kajoLiveMetric" + count.toString() + "_" + i.toString());
            var metricId = saved == null ? defaults[i] : saved.toString();
            if (liveMetricLabel(metricId) == "DATENFELD") { metricId = defaults[i]; }
            selected.add(metricId);
        }
        return selected;
    }

    function drawActivityDashboard(dc as Dc, cx, hrNow as Lang.String, elapsed as Lang.String,
        distance as Lang.String, speedNow as Lang.String, cadenceNow as Lang.String,
        zone as Lang.Number, activityInfo) as Void {

        var stepCount = mWorkoutSteps.size();
        var timerText = elapsed;
        var statusText = "";
        var targetText = "";
        var phaseColor = 0x25D3CB;
        var nextText = "";

        if (stepCount > 0 && !mWorkoutSequenceComplete && !mIsTransitioning) {
            var step = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            statusText = "INTERVALL " + (mWorkoutStepIndex + 1).toString() + "/" + stepCount.toString();
            var remaining = (step["durationSeconds"] as Lang.Number) - mWorkoutStepElapsedSeconds;
            if (remaining < 0) { remaining = 0; }
            timerText = formatTime(remaining * 1000);
            if (mShowIntervalTarget && step["target"] != null && step["target"].toString() != "") {
                targetText = "ZIEL: " + step["target"].toString();
            }
            if (isRecoveryStep(step)) {
                phaseColor = 0xFFB52E;
                statusText += " · PAUSE";
            } else {
                statusText += " · PADDELN!";
            }
            if (mShowNextInterval) { nextText = nextStepSummary(); }
        } else if (mWorkoutSequenceComplete) {
            statusText = "TRAINING BEENDET";
        }

        // Programmierte Einheiten zeigen den Abschnitt; freies Training
        // nutzt denselben Bereich fuer Bootsklasse und Trainingsmodus.
        if (stepCount > 0) {
            if (mTrainingShowStatus) {
                dc.setColor(0x102C35, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle(55, 63, 280, 30, 15);
                dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
                dc.drawRoundedRectangle(55, 63, 280, 30, 15);
                drawActivityText(dc, cx, 67, 264, 22, statusText,
                    Graphics.FONT_SMALL, phaseColor);
            }
        } else {
            drawActivityText(dc, cx, 68, 220, 22, "KAJO · " + mBoatClass + " · FREI",
                Graphics.FONT_SMALL, 0x69D5D3);
        }

        // Bei programmiertem Training laeuft der Ring als Intervallfortschritt.
        if (stepCount > 0 && !mWorkoutSequenceComplete) {
            var activeStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            var activeDuration = activeStep["durationSeconds"] as Lang.Number;
            var progress = activeDuration > 0 ? mWorkoutStepElapsedSeconds / activeDuration : 0.0;
            if (progress < 0) { progress = 0; }
            if (progress > 1) { progress = 1; }
            var progressEnd = 225 + (270 * progress);
            dc.setColor(0x263238, Graphics.COLOR_BLACK);
            dc.drawArc(cx, 197, 105, Graphics.ARC_CLOCKWISE, 225, 360);
            dc.drawArc(cx, 197, 105, Graphics.ARC_CLOCKWISE, 0, 135);
            dc.setColor(phaseColor, Graphics.COLOR_BLACK);
            if (progressEnd <= 360) {
                dc.drawArc(cx, 197, 105, Graphics.ARC_CLOCKWISE, 225, progressEnd);
            } else {
                dc.drawArc(cx, 197, 105, Graphics.ARC_CLOCKWISE, 225, 360);
                dc.drawArc(cx, 197, 105, Graphics.ARC_CLOCKWISE, 0, progressEnd - 360);
            }
        }

        // Freies Training: Gesamtzeit. Programm: verbleibende Abschnittszeit.
        drawActivityText(dc, cx - 4, 105, 250, 64, timerText,
            Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
        drawActivityText(dc, cx + 116, 116, 40, 18, "min",
            Graphics.FONT_XTINY, Graphics.COLOR_WHITE);

        if (targetText != "") {
            drawActivityText(dc, cx, 168, 230, 18, targetText,
                Graphics.FONT_XTINY, 0x69D5D3);
        }
        if (nextText != "") {
            drawActivityText(dc, cx, 190, 260, 16, nextText,
                Graphics.FONT_XTINY, 0x98A5AB);
        }

        var paceValue = "--:--";
        if (activityInfo != null && activityInfo.currentSpeed != null) {
            paceValue = formatPace(activityInfo.currentSpeed * 3.6);
        }

        // Wertepool fuer die individuell belegbaren 2- bzw. 4-Felder-Ansichten.
        var liveValues = {
            "cadence" => cadenceNow,
            "heartRate" => hrNow,
            "heartRateZone" => zone > 0 ? "ZONE " + zone.toString() : "--",
            "distance" => distance,
            "intervalDistance" => stepCount > 0 ? intervalDistanceText(activityInfo) : "--",
            "pace" => paceValue,
            "speedNow" => speedNow,
            "speedAvg" => "--",
            "speedMax" => speedNow,
            "heartRateAvg" => "--",
            "heartRateMax" => "--",
            "elapsed" => elapsed,
            "calories" => "--",
            "power" => "--",
            "altitude" => "--",
            "ascent" => "--",
            "descent" => "--",
            "trainingEffect" => "--"
        };

        // Zusätzliche Messwerte aus der aktuellen Garmin-Aktivität übernehmen.
        if (activityInfo != null) {
            liveValues["speedAvg"] = activityInfo.averageSpeed == null ? "--" : numberText(activityInfo.averageSpeed * 3.6, 1);
            liveValues["speedMax"] = activityInfo.maxSpeed == null ? "--" : numberText(activityInfo.maxSpeed * 3.6, 1);
            liveValues["heartRateAvg"] = valueOrDash(activityInfo.averageHeartRate);
            liveValues["heartRateMax"] = valueOrDash(activityInfo.maxHeartRate);
            liveValues["calories"] = valueOrDash(activityInfo.calories);
            liveValues["power"] = valueOrDash(activityInfo.currentPower);
            liveValues["altitude"] = activityInfo.altitude == null ? "--" : numberText(activityInfo.altitude, 0);
            liveValues["ascent"] = valueOrDash(activityInfo.totalAscent);
            liveValues["descent"] = valueOrDash(activityInfo.totalDescent);
            liveValues["trainingEffect"] = activityInfo.trainingEffect == null ? "--" : numberText(activityInfo.trainingEffect, 1);
        }

        dc.setColor(0x465057, Graphics.COLOR_BLACK);
        dc.drawLine(72, 220, 318, 220);
        var liveMetricIds = getLiveMetricIds(mTrainingFieldCount);

        if (mTrainingFieldCount == 2) {
            dc.drawLine(cx, 231, cx, 321);
            drawLiveMetricField(dc, cx - 66, 237, 112, liveMetricIds[0], liveValues, true);
            drawLiveMetricField(dc, cx + 62, 237, 112, liveMetricIds[1], liveValues, true);
        } else {
            dc.drawLine(cx, 224, cx, 344);
            dc.drawLine(78, 283, 312, 283);
            drawLiveMetricField(dc, cx - 67, 226, 112, liveMetricIds[0], liveValues, false);
            drawLiveMetricField(dc, cx + 65, 226, 112, liveMetricIds[1], liveValues, false);
            drawLiveMetricField(dc, cx - 67, 289, 112, liveMetricIds[2], liveValues, false);
            drawLiveMetricField(dc, cx + 65, 289, 112, liveMetricIds[3], liveValues, false);
        }

        // Das HF-Barometer bleibt unabhängig von der Feldbelegung am rechten
        // Displayrand und zeigt die aktuelle Herzfrequenzzone.
        drawHeartRateZoneBar(dc, cx, cx, mUnit * 0.455, zone);

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

    function captureActivitySummary() as Void {
        var info = Activity.getActivityInfo();
        if (info.elapsedDistance != null) {
            mFinalDistanceMeters = info.elapsedDistance;
            mFinalDistance = numberText(info.elapsedDistance / 1000.0, 2);
        }
        if (info.averageHeartRate != null) {
            mFinalAverageHeartRateValue = info.averageHeartRate;
            mFinalAverageHeartRate = info.averageHeartRate.toString();
        }
        if (info.averageSpeed != null) {
            mFinalAverageSpeedKmh = numberText(info.averageSpeed * 3.6, 1);
        }
        if (info.maxSpeed != null) {
            mFinalMaxSpeedKmh = numberText(info.maxSpeed * 3.6, 1);
        }
        if (info.maxHeartRate != null) {
            mFinalMaxHeartRate = info.maxHeartRate.toString();
        }
        if (info.calories != null) {
            mFinalCalories = info.calories.toString();
        }
        if (info.totalAscent != null) {
            mFinalAscent = info.totalAscent.toString();
        }
        if (info.timerTime != null && info.timerTime > 0) {
            mElapsedSeconds = Math.floor(info.timerTime / 1000).toNumber();
        } else if (info.elapsedTime != null && info.elapsedTime > 0) {
            mElapsedSeconds = Math.floor(info.elapsedTime / 1000).toNumber();
        }
    }

    function startRecording() as Void {
        syncPendingActivityUploads();
        var started = mEngine.start(mBoatClass);
        if (started) {
            mStartError = "";
            mStartTimestamp = Time.now().value();
            var startInfo = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
            var startDay = (startInfo.day < 10 ? "0" : "") + startInfo.day.toString();
            var startMonth = (startInfo.month < 10 ? "0" : "") + startInfo.month.toString();
            mStartDateIso = startInfo.year.toString() + "-" + startMonth + "-" + startDay;
            mStartDateDisplay = startDay + "." + startMonth + ".";
            mStatus = "AUFZEICHNUNG";
            mElapsedSeconds = 0;
            mFinalDistance = "--";
            mFinalAverageHeartRate = "--";
            mFinalDistanceMeters = null;
            mFinalAverageHeartRateValue = null;
            mFinalAverageSpeedKmh = "--";
            mFinalMaxSpeedKmh = "--";
            mFinalMaxHeartRate = "--";
            mFinalCalories = "--";
            mFinalAscent = "--";
            mFinalLaps = [];
            mSavedLapOffset = 0;
            mLiveLapSummaries = [];
            mLapStartTimerMs = 0;
            // ActivityRecording startet die Distanz der neuen Session bei null.
            // So zählt auch der erste Kilometer vollständig.
            mLapStartDistanceMeters = 0;
            mLapHeartRateSum = 0;
            mLapHeartRateCount = 0;
            mNextAutoLapDistanceMeters = 1000;
            mLapSummaryVisible = false;
            mLapSummarySecondsRemaining = 0;
            mSavedDetailPage = 0;
            mHistoryEntrySaved = false;
            mWorkoutStepIndex = 0;
            mWorkoutStepElapsedSeconds = 0;
            mWorkoutSequenceComplete = false;
            mIsTransitioning = false;
            mTransitionCountdown = 0;
            setStepDistanceBaseline();
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
            mTimer.start(method(:onTimer), 1000, true);
            WatchUi.showToast("START OK / " + getDebugState(), null);
        } else {
            mStartError = mEngine.getLastError();
            mStatus = "START FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function pauseRecording() as Void {
        captureActivitySummary();
        if (mEngine.pause()) {
            mTimer.stop();
            mStatus = "PAUSIERT";
            mShowPauseDebug = false;
        } else {
            // Fehlerdiagnose dauerhaft in der Aktivitätsansicht anzeigen,
            // da Garmin-Toastmeldungen auf der Venu 3S abgeschnitten werden.
            mShowPauseDebug = true;
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
        mDebugTimerTicks += 1;
        if (mDebugTimerTicks == 1) { WatchUi.showToast("KAJO TIMER TICK", null); }
        if (mStatus == "AUFZEICHNUNG") {
            mElapsedSeconds += 1;
            sampleLapMetrics();
        }
        if (mStatus == "AUFZEICHNUNG") { updateWorkoutStepTimer(); }
        if (mStatus == "AUFZEICHNUNG" && mLapSummaryVisible) {
            mLapSummarySecondsRemaining -= 1;
            if (mLapSummarySecondsRemaining <= 0) {
                mLapSummaryVisible = false;
            }
        }
        WatchUi.requestUpdate();
    }

    function sampleLapMetrics() as Void {
        var info = Activity.getActivityInfo();

        if (mLapStartDistanceMeters == null && info.elapsedDistance != null) {
            mLapStartDistanceMeters = info.elapsedDistance;
        }
        if (info.currentHeartRate != null && info.currentHeartRate > 0) {
            mLapHeartRateSum += info.currentHeartRate;
            mLapHeartRateCount += 1;
        }

        // Nur beim freien Training automatisch jede volle 1.000-m-Marke setzen.
        if (mCurrentWorkoutState == "FREE" && info.elapsedDistance != null &&
            info.elapsedDistance >= mNextAutoLapDistanceMeters) {
            if (completeLap(true, info)) {
                mNextAutoLapDistanceMeters += 1000;
            }
        }
    }

    function isNextStepRecovery() as Lang.Boolean {
        var nextIndex = mWorkoutStepIndex + 1;
        if (nextIndex < mWorkoutSteps.size() &&
            isRecoveryStep(mWorkoutSteps[nextIndex] as Lang.Dictionary)) {
            return true;
        }

        // Falls der Timer den Wechsel bereits vollzogen hat, gilt ein
        // Tastendruck direkt zu Beginn der Erholung noch als Abschluss
        // des vorherigen Belastungsintervalls.
        if (mWorkoutStepIndex > 0 && mWorkoutStepElapsedSeconds <= 3) {
            var currentStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
            var previousStep = mWorkoutSteps[mWorkoutStepIndex - 1] as Lang.Dictionary;
            if (isRecoveryStep(currentStep) && !isRecoveryStep(previousStep)) {
                return true;
            }
        }
        return false;
    }

    function completeLap(showSummary as Lang.Boolean, activityInfo) as Lang.Boolean {
        if (activityInfo == null || !mEngine.addLap()) { return false; }

        var lap = {};
        var timerValue = activityInfo.timerTime == null
            ? mLapStartTimerMs : activityInfo.timerTime;
        var distanceValue = activityInfo.elapsedDistance == null ||
            mLapStartDistanceMeters == null
            ? null : activityInfo.elapsedDistance - (mLapStartDistanceMeters as Lang.Number);
        var lapDuration = timerValue - mLapStartTimerMs;

        lap["lapNumber"] = mLiveLapSummaries.size() + 1;
        lap["elapsedTimeMs"] = lapDuration > 0 ? lapDuration : 0;
        if (distanceValue != null && distanceValue >= 0) {
            lap["distanceMeters"] = distanceValue;
            if (lapDuration > 0) {
                lap["averageSpeedKmh"] = (distanceValue / (lapDuration / 1000.0)) * 3.6;
            }
        }
        if (mLapHeartRateCount > 0) {
            lap["averageHeartRateBpm"] = Math.round(
                mLapHeartRateSum / mLapHeartRateCount).toNumber();
        } else {
            lap["averageHeartRateBpm"] = null;
        }
        mLiveLapSummaries.add(lap);

        if (showSummary) {
            mLapSummaryNumber = lap["lapNumber"] as Lang.Number;
            mLapSummaryTime = formatTime(lap["elapsedTimeMs"] as Lang.Number);
            mLapSummaryDistance = distanceValue == null
                ? "--" : numberText(distanceValue / 1000.0, 2);
            mLapSummaryHeartRate = lap["averageHeartRateBpm"] == null
                ? "--" : lap["averageHeartRateBpm"].toString();
            mLapSummaryVisible = true;
            mLapSummarySecondsRemaining = 7;
        }

        mLapStartTimerMs = timerValue;
        if (activityInfo.elapsedDistance != null) {
            mLapStartDistanceMeters = activityInfo.elapsedDistance;
        }
        mLapHeartRateSum = 0;
        mLapHeartRateCount = 0;
        return true;
    }
    function onPosition(positionInfo as Position.Info) as Void {
        if (positionInfo != null) {
            mGpsQuality = positionInfo.accuracy;
        } else {
            mGpsQuality = Position.QUALITY_NOT_AVAILABLE;
        }
        WatchUi.requestUpdate();
    }

    function saveHistoryEntry() as Lang.Boolean {
        if (mHistoryEntrySaved) { return true; }
        try {
            var stored = Storage.getValue("kajoActivityHistory");
            var previous = stored == null ? [] : stored as Lang.Array<Lang.Dictionary>;
            var nextHistory = [];
            var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
            var dayText = (info.day < 10 ? "0" : "") + info.day.toString();
            var monthText = (info.month < 10 ? "0" : "") + info.month.toString();
            var dateIso = mStartDateIso == "" ? info.year.toString() + "-" + monthText + "-" + dayText : mStartDateIso;
            var dateDisplay = mStartDateDisplay == "" ? dayText + "." + monthText + "." : mStartDateDisplay;
            var clientActivityId = "watch-" + mStartTimestamp.toString();

            var entry = {};
            entry["date"] = dateDisplay;
            entry["dateIso"] = dateIso;
            entry["clientActivityId"] = clientActivityId;
            entry["startTimestamp"] = mStartTimestamp;
            entry["durationSeconds"] = mElapsedSeconds;
            entry["source"] = "garmin-connect-iq";
            if (mFinalDistanceMeters != null) {
                entry["distanceMeters"] = mFinalDistanceMeters;
            }
            if (mFinalAverageHeartRateValue != null) {
                entry["averageHeartRateBpm"] = mFinalAverageHeartRateValue;
            }
            entry["boatClass"] = mBoatClass;
            entry["name"] = mCurrentWorkoutName;
            entry["duration"] = formatTime(mElapsedSeconds * 1000);
            entry["distance"] = mFinalDistance;
            entry["averageHeartRate"] = mFinalAverageHeartRate;
            entry["averageSpeedKmh"] = mFinalAverageSpeedKmh;
            entry["maxSpeedKmh"] = mFinalMaxSpeedKmh;
            entry["maxHeartRateBpm"] = mFinalMaxHeartRate;
            entry["calories"] = mFinalCalories;
            entry["ascentMeters"] = mFinalAscent;
            entry["laps"] = mFinalLaps;

            nextHistory.add(entry);
            for (var i = 0; i < previous.size() && i < 19; i += 1) {
                nextHistory.add(previous[i]);
            }
            Storage.setValue("kajoActivityHistory", nextHistory);
            queueActivityUpload(entry);
            mHistoryEntrySaved = true;
            return true;
        } catch (error) {
            WatchUi.showToast("Historie konnte nicht gespeichert werden", null);
            return false;
        }
    }

    function queueActivityUpload(entry as Lang.Dictionary) as Void {
        try {
            var stored = Storage.getValue("kajoPendingActivityUploads");
            var pending = stored == null ? [] : stored as Lang.Array<Lang.Dictionary>;
            var activityId = entry["clientActivityId"];
            if (activityId == null) { return; }
            for (var i = 0; i < pending.size(); i += 1) {
                var existing = pending[i] as Lang.Dictionary;
                if (existing["clientActivityId"] != null &&
                    existing["clientActivityId"].toString() == activityId.toString()) {
                    syncPendingActivityUploads();
                    return;
                }
            }
            if (pending.size() >= 20) {
                WatchUi.showToast("Upload-Warteschlange voll – bitte KAJO verbinden", null);
                return;
            }
            var next = [];
            next.add(entry);
            for (var i = 0; i < pending.size(); i += 1) {
                next.add(pending[i]);
            }
            Storage.setValue("kajoPendingActivityUploads", next);
            syncPendingActivityUploads();
        } catch (error) {
            WatchUi.showToast("Upload lokal vorgemerkt fehlgeschlagen", null);
        }
    }

    function syncPendingActivityUploads() as Void {
        if (mUploadInFlight) { return; }
        var token = Storage.getValue("kajoDeviceToken");
        if (token == null || token.toString().length() != 64) { return; }
        var stored = Storage.getValue("kajoPendingActivityUploads");
        if (stored == null) { return; }
        var pending = stored as Lang.Array<Lang.Dictionary>;
        if (pending.size() == 0) { return; }
        var entry = pending[0] as Lang.Dictionary;
        var activityId = entry["clientActivityId"];
        var dateValue = entry["dateIso"];
        var durationValue = entry["durationSeconds"];
        var boatValue = entry["boatClass"];
        if (activityId == null || dateValue == null || durationValue == null || boatValue == null) {
            WatchUi.showToast("Upload-Datensatz unvollstaendig", null);
            return;
        }
        var activity = {
            "clientActivityId" => activityId,
            "date" => dateValue,
            "durationSeconds" => durationValue,
            "boatClass" => boatValue,
            "name" => entry["name"] == null ? "KAJO Training" : entry["name"]
        };
        if (entry["startTimestamp"] != null) {
            activity["startTimestamp"] = entry["startTimestamp"];
        }
        if (entry["distanceMeters"] != null) {
            activity["distanceMeters"] = entry["distanceMeters"];
        }
        if (entry["averageHeartRateBpm"] != null) {
            activity["averageHeartRateBpm"] = entry["averageHeartRateBpm"];
        }
        mUploadInFlight = true;
        mUploadInFlightId = activityId.toString();
        try {
            mApi.postJson(
                mEndpoint,
                { "action" => "upload-activity", "activity" => activity },
                token.toString(),
                method(:onActivityUploadResponse)
            );
        } catch (error) {
            mUploadInFlight = false;
            mUploadInFlightId = "";
        }
    }

    function onActivityUploadResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        mUploadInFlight = false;
        if (responseCode != 200 || data == null || data["ok"] != true) {
            mUploadInFlightId = "";
            return;
        }
        try {
            var stored = Storage.getValue("kajoPendingActivityUploads");
            var pending = stored == null ? [] : stored as Lang.Array<Lang.Dictionary>;
            var next = [];
            for (var i = 0; i < pending.size(); i += 1) {
                var entry = pending[i] as Lang.Dictionary;
                var activityId = entry["clientActivityId"];
                if (activityId == null || activityId.toString() != mUploadInFlightId) {
                    next.add(entry);
                }
            }
            Storage.setValue("kajoPendingActivityUploads", next);
        } catch (error) {
            // Ein lokaler Löschfehler führt zu einem sicheren erneuten Upload.
            // Der Server behandelt dieselbe Aktivitäts-ID idempotent.
        }
        mUploadInFlightId = "";
        syncPendingActivityUploads();
        WatchUi.requestUpdate();
    }

    function captureFinalPartialLap(activityInfo) as Void {
        if (activityInfo == null) { return; }

        var timerValue = activityInfo.timerTime == null
            ? mElapsedSeconds * 1000 : activityInfo.timerTime;
        var lapDuration = timerValue - mLapStartTimerMs;
        var distanceValue = activityInfo.elapsedDistance == null ||
            mLapStartDistanceMeters == null
            ? null : activityInfo.elapsedDistance - (mLapStartDistanceMeters as Lang.Number);

        // Nur einen tatsächlich absolvierten Restabschnitt übernehmen.
        // Das verhindert eine leere/duplizierte Runde, wenn direkt nach
        // einer manuellen Markierung gespeichert wird.
        var hasTime = lapDuration > 1000;
        var hasDistance = distanceValue != null && distanceValue > 1;
        if (!hasTime && !hasDistance) { return; }

        var lap = {};
        lap["lapNumber"] = mLiveLapSummaries.size() + 1;
        lap["elapsedTimeMs"] = lapDuration > 0 ? lapDuration : 0;
        if (distanceValue != null && distanceValue >= 0) {
            lap["distanceMeters"] = distanceValue;
            if (lapDuration > 0) {
                lap["averageSpeedKmh"] = (distanceValue / (lapDuration / 1000.0)) * 3.6;
            }
        }
        if (mLapHeartRateCount > 0) {
            lap["averageHeartRateBpm"] = Math.round(
                mLapHeartRateSum / mLapHeartRateCount).toNumber();
        } else {
            lap["averageHeartRateBpm"] = null;
        }

        // Beim Speichern aus der Pause kann Garmin keine neue FIT-Runde mehr
        // annehmen (die Session wurde zum Pausieren gestoppt). Der Restabschnitt
        // bleibt deshalb als lokale KAJO-Historienrunde erhalten.
        if (mEngine.isRecording()) {
            mEngine.addLap();
        }
        mLiveLapSummaries.add(lap);
        mLapStartTimerMs = timerValue;
        if (activityInfo.elapsedDistance != null) {
            mLapStartDistanceMeters = activityInfo.elapsedDistance;
        }
        mLapHeartRateSum = 0;
        mLapHeartRateCount = 0;
    }

    function finishRecording() as Void {
        // Vor dem Beenden letzte verfuegbare Werte sichern.
        captureActivitySummary();
        captureFinalPartialLap(Activity.getActivityInfo());
        if (mEngine.finish()) {
            var finalLaps = mEngine.getLapSummaries() as Lang.Array<Lang.Dictionary>;
            mFinalLaps = finalLaps;
            // Die FIT-Lap-Events liefern keine Ø-HF; die lokal erfassten Werte
            // werden anhand der Rundennummer ergänzt. Ein letzter Restabschnitt
            // aus der Pause wird zusätzlich lokal in der KAJO-Historie geführt.
            for (var lapIndex = 0; lapIndex < mLiveLapSummaries.size(); lapIndex += 1) {
                var liveLap = mLiveLapSummaries[lapIndex] as Lang.Dictionary;
                if (lapIndex < finalLaps.size()) {
                    var savedLap = finalLaps[lapIndex];
                    if (liveLap["averageHeartRateBpm"] != null) {
                        savedLap["averageHeartRateBpm"] = liveLap["averageHeartRateBpm"];
                    }
                } else {
                    finalLaps.add(liveLap);
                }
            }
            saveHistoryEntry();
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

    function nextSavedDetailPage(direction as Lang.Number) as Void {
        if (mStatus != "GESPEICHERT") { return; }
        mSavedDetailPage += direction;
        if (mSavedDetailPage < 0) { mSavedDetailPage = 2; }
        if (mSavedDetailPage > 2) { mSavedDetailPage = 0; }
        WatchUi.requestUpdate();
    }

    function scrollSavedLaps(direction as Lang.Number) as Lang.Boolean {
        if (mStatus != "GESPEICHERT" || mSavedDetailPage != 2 ||
            mFinalLaps.size() <= 5) {
            return false;
        }

        var maxOffset = mFinalLaps.size() - 5;
        mSavedLapOffset += direction;
        if (mSavedLapOffset < 0) { mSavedLapOffset = 0; }
        if (mSavedLapOffset > maxOffset) { mSavedLapOffset = maxOffset; }
        WatchUi.requestUpdate();
        return true;
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

    // Kurzer Druck oben setzt eine pausierte Einheit fort.
    function isPausedForSave() as Lang.Boolean {
        return mStatus == "PAUSIERT";
    }

    function isSavedForDetails() as Lang.Boolean {
        return mStatus == "GESPEICHERT";
    }

    function handlePausedShortPrimary() as Void {
        if (mStatus == "PAUSIERT") {
            mDiscardConfirmationStage = 0;
            resumeRecording();
        }
    }

    // Langer Druck oben speichert die pausierte Aktivität.
    function handlePausedLongPrimary() as Void {
        if (mStatus == "PAUSIERT") {
            mDiscardConfirmationStage = 0;
            finishRecording();
        }
    }

    // Kurzer Druck unten bricht eine laufende Verwerf-Abfrage ab.
    function handlePausedShortSecondary() as Void {
        if (mStatus == "PAUSIERT" && mDiscardConfirmationStage > 0) {
            mDiscardConfirmationStage = 0;
            WatchUi.showToast("Verwerfen abgebrochen", null);
            WatchUi.requestUpdate();
        }
    }

    // Zweistufiges Verwerfen: zweimal lange unten drücken.
    function handlePausedLongSecondary() as Void {
        if (mStatus != "PAUSIERT") { return; }
        if (mDiscardConfirmationStage == 0) {
            mDiscardConfirmationStage = 1;
            WatchUi.showToast("Erneut unten lange drücken zum Verwerfen", null);
            WatchUi.requestUpdate();
            return;
        }

        if (mEngine.discard()) {
            mTimer.stop();
            Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
            mDiscardConfirmationStage = 0;
            WatchUi.showToast("Aktivität verworfen", null);
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } else {
            mDiscardConfirmationStage = 0;
            WatchUi.showToast("Verwerfen fehlgeschlagen", null);
            WatchUi.requestUpdate();
        }
    }

    // Aktion der oberen physischen Taste.
    function getDebugState() as Lang.String {
        return mStatus + " / FIT " + (mEngine.isRecording() ? "ON" : "OFF") +
            " / TICKS " + mDebugTimerTicks.toString() +
            " / PAUSE " + mEngine.getLastPauseDebug();
    }

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
            if (saveHistoryEntry()) { WatchUi.popView(WatchUi.SLIDE_DOWN); }
        }
    }

    // Kurzer Druck unten: im Bereitschaftszustand Aktivitätsansicht verlassen,
    // während der Aufzeichnung weiterhin eine Runde markieren.
    function handleBackOrLapButton() as Void {
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        handleLapButton();
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
        var info = Activity.getActivityInfo();
        var showSummary = mWorkoutSteps.size() > 0 && isNextStepRecovery();
        if (completeLap(showSummary, info)) {
            if (showSummary) {
                WatchUi.requestUpdate();
            } else {
                WatchUi.showToast("Runde gespeichert", null);
            }
        } else {
            WatchUi.showToast("Runde konnte nicht gespeichert werden", null);
        }
        return true;
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        // Speichern, Verwerfen und Fortsetzen sind in der Speicheransicht
        // ausschließlich über physische Tasten möglich.
        if (mStatus == "PAUSIERT" || mStatus == "GESPEICHERT" ||
            mStatus == "SPEICHERN FEHLGESCHLAGEN") { return; }

        // Während der Aufzeichnung wechselt ein Tap auf die linke/rechte
        // Bildschirmhälfte direkt die Datenseite. Die alte globale
        // Button-Hitbox am unteren Rand hat diese Taps zuvor blockiert.
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

        if (y < mButtonTop || y > mButtonBottom) { return; }
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            startRecording();
            return;
        }
        if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            finishRecording();
            return;
        }
        if (mStatus == "GESPEICHERT") {
            if (saveHistoryEntry()) { WatchUi.popView(WatchUi.SLIDE_DOWN); }
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
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        mScreenWidth = dc.getWidth();
        mScreenHeight = dc.getHeight();
        mUnit = mScreenWidth < mScreenHeight ? mScreenWidth : mScreenHeight;
        mKajoLayout.configure(mScreenWidth, mScreenHeight);

        var cx = mScreenWidth / 2;
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
            drawActivityText(dc, cx, 76, 280, 24, compactWorkoutText(mCurrentWorkoutName, 34),
                Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

            var durationText = mCurrentWorkoutDuration == ""
                ? "–"
                : mCurrentWorkoutDuration + " MIN";
            drawActivityText(dc, cx, 112, 280, 48, durationText,
                Graphics.FONT_NUMBER_HOT, 0x25D3CB);

            var planSummary = "";
            if (mCurrentWorkoutWarmup != "") {
                planSummary = "EINWÄRMEN " + mCurrentWorkoutWarmup;
            }
            if (mCurrentWorkoutMainSet != "") {
                planSummary = planSummary == "" ? mCurrentWorkoutMainSet :
                    planSummary + " · " + mCurrentWorkoutMainSet;
            }
            if (mCurrentWorkoutCooldown != "") {
                planSummary = planSummary == "" ? "AUSFAHREN " + mCurrentWorkoutCooldown :
                    planSummary + " · AUSFAHREN " + mCurrentWorkoutCooldown;
            }
            if (planSummary == "" && mWorkoutSteps.size() > 0) {
                planSummary = mWorkoutSteps.size().toString() + " TRAININGSABSCHNITTE";
            }
            if (planSummary == "") { planSummary = "OHNE PLAN"; }
            drawActivityText(dc, cx, 170, 280, 30,
                compactWorkoutText(planSummary, 58),
                Graphics.FONT_XTINY, 0x98A5AB);
            drawActivityText(dc, cx, 210, 240, 18, "BOOTSKLASSE · " + mBoatClass,
                Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
            drawActivityText(dc, cx, 239, 280, 18, "GPS · " + gpsText + "   PULS · " + hrNow,
                Graphics.FONT_XTINY, 0x98A5AB);
            if (mStatus == "START FEHLGESCHLAGEN") {
                var startErrorText = mStartError == "" ? "START NICHT MÖGLICH" : compactWorkoutText(mStartError, 38);
                drawActivityText(dc, cx, 270, 280, 18, startErrorText,
                    Graphics.FONT_XTINY, 0xFF9F1A);
            }
            var startWidth = mKajoLayout.safeRectWidth(310, 58, mUnit * 0.78);
            var startLeft = cx - (startWidth / 2);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(startLeft.toNumber(), 310, startWidth.toNumber(), 48);
            drawActivityText(dc, cx, 325, startWidth - 18, 20, "TRAINING STARTEN",
                Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
            mButtonTop = 306;
            mButtonBottom = 374;
        } else if (mStatus == "PAUSIERT") {
            drawPageHeader(dc, "PAUSIERT");
            drawActivityText(dc, cx, 94, 280, 66, elapsed,
                Graphics.FONT_NUMBER_HOT, 0xFFB020);
            dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
            dc.drawLine(82, 169, 308, 169);
            dc.drawLine(cx, 180, cx, 242);
            drawActivityText(dc, 137, 181, 104, 14, "DISTANZ",
                Graphics.FONT_XTINY, 0x98A5AB);
            drawActivityText(dc, 137, 201, 104, 30, distance,
                Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
            drawActivityText(dc, 253, 181, 104, 14, "PULS",
                Graphics.FONT_XTINY, 0x98A5AB);
            drawActivityText(dc, 253, 201, 104, 30, hrNow,
                Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
            drawHeartRateZoneBar(dc, cx, cx, mUnit * 0.455, currentHeartRateZone);
            if (mWorkoutSteps.size() > 0 && !mWorkoutSequenceComplete) {
                var pausedStep = mWorkoutSteps[mWorkoutStepIndex] as Lang.Dictionary;
                drawActivityText(dc, cx, 244, 250, 14,
                    "INTERVALL " + (mWorkoutStepIndex + 1).toString() + "/" + mWorkoutSteps.size().toString() +
                    " · " + compactWorkoutText(pausedStep["label"].toString(), 24),
                    Graphics.FONT_XTINY, 0x98A5AB);
            }
            // Speicheransicht bleibt optisch nah an der Aktivitätsansicht.
            // Aktionen sind ausschließlich über physische Tasten erreichbar.
            dc.setColor(0x22C55E, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(82, 286, 226, 36, 10);
            drawActivityText(dc, cx, 295, 210, 18, "SPEICHERN",
                Graphics.FONT_XTINY, 0x22C55E);
            dc.setColor(0xEF4444, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(82, 332, 226, 36, 10);
            drawActivityText(dc, cx, 341, 210, 18,
                mDiscardConfirmationStage == 0 ? "VERWERFEN" : "VERWERFEN BESTÄTIGEN",
                Graphics.FONT_XTINY, 0xEF4444);
            var keyHint = mDiscardConfirmationStage == 0
                ? "OBEN KURZ · FORTSETZEN  |  LANG · SPEICHERN"
                : "UNTEN KURZ · ZURÜCK  |  LANG · BESTÄTIGEN";
            drawActivityText(dc, cx, 260, 300, 16, keyHint,
                Graphics.FONT_XTINY, mDiscardConfirmationStage == 0 ? 0x98A5AB : 0xFF9F1A);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mStatus == "GESPEICHERT") {
            if (mSavedDetailPage == 0) {
                drawPageHeader(dc, "TRAINING GESPEICHERT");
                drawActivityText(dc, cx, 83, 280, 20,
                    "KAJO · " + mBoatClass + " · " + compactWorkoutText(mCurrentWorkoutName, 22),
                    Graphics.FONT_XTINY, 0x25D3CB);
                drawActivityText(dc, cx, 111, 280, 58, elapsed,
                    Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
                drawActivityText(dc, cx, 169, 280, 14, "TRAININGSDAUER",
                    Graphics.FONT_XTINY, 0x98A5AB);
                dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                dc.drawLine(72, 197, 318, 197);
                dc.drawLine(cx, 208, cx, 278);
                drawActivityText(dc, 132, 210, 112, 15, "DISTANZ",
                    Graphics.FONT_XTINY, 0x98A5AB);
                drawActivityText(dc, 132, 232, 112, 30, mFinalDistance,
                    Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
                drawActivityText(dc, 132, 261, 112, 14, "KM",
                    Graphics.FONT_XTINY, 0x98A5AB);
                drawActivityText(dc, 258, 210, 112, 15, "Ø PULS",
                    Graphics.FONT_XTINY, 0x98A5AB);
                drawActivityText(dc, 258, 232, 112, 30, mFinalAverageHeartRate,
                    Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
                drawActivityText(dc, 258, 261, 112, 14, "BPM",
                    Graphics.FONT_XTINY, 0x98A5AB);
                drawActivityText(dc, cx, 302, 280, 18, "FIT-AKTIVITÄT GESPEICHERT",
                    Graphics.FONT_XTINY, 0x25D3CB);
                drawActivityText(dc, cx, 344, 280, 18, "UNTEN · WEITERE DATEN",
                    Graphics.FONT_XTINY, 0x98A5AB);
            } else if (mSavedDetailPage == 1) {
                drawPageHeader(dc, "WEITERE ERGEBNISSE");
                drawMetric(dc, 112, 105, "Ø GESCHWINDIGKEIT",
                    mFinalAverageSpeedKmh, "KM/H", 145, Graphics.FONT_MEDIUM);
                drawMetric(dc, 278, 105, "MAX. GESCHWINDIGKEIT",
                    mFinalMaxSpeedKmh, "KM/H", 145, Graphics.FONT_MEDIUM);
                drawMetric(dc, 112, 220, "MAX. HERZFREQUENZ",
                    mFinalMaxHeartRate, "BPM", 145, Graphics.FONT_MEDIUM);
                drawMetric(dc, 278, 220, "KALORIEN",
                    mFinalCalories, "KCAL", 145, Graphics.FONT_MEDIUM);
                drawMetric(dc, cx, 315, "HÖHENMETER",
                    mFinalAscent, "M", 220, Graphics.FONT_SMALL);
                drawActivityText(dc, cx, 365, 280, 14,
                    "OBEN · ZURÜCK  |  UNTEN · RUNDEN",
                    Graphics.FONT_XTINY, 0x98A5AB);
            } else {
                drawPageHeader(dc, "RUNDE / INTERVALLE");
                if (mFinalLaps.size() == 0) {
                    drawActivityText(dc, cx, 160, 280, 28,
                        "KEINE RUNDEN MARKIERT",
                        Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
                    drawActivityText(dc, cx, 202, 280, 30,
                        "WÄHREND DES TRAININGS UNTEN DRÜCKEN",
                        Graphics.FONT_XTINY, 0x98A5AB);
                } else {
                    drawActivityText(dc, 67, 76, 42, 16, "NR.",
                        Graphics.FONT_XTINY, 0x98A5AB);
                    drawActivityText(dc, 137, 76, 88, 16, "ZEIT",
                        Graphics.FONT_XTINY, 0x98A5AB);
                    drawActivityText(dc, 226, 76, 82, 16, "DISTANZ",
                        Graphics.FONT_XTINY, 0x98A5AB);
                    drawActivityText(dc, 315, 76, 70, 16, "Ø BPM",
                        Graphics.FONT_XTINY, 0x98A5AB);
                    var remainingLaps = mFinalLaps.size() - mSavedLapOffset;
                    var shownLaps = remainingLaps > 5 ? 5 : remainingLaps;
                    for (var lapIndex = 0; lapIndex < shownLaps; lapIndex += 1) {
                        var lap = mFinalLaps[mSavedLapOffset + lapIndex] as Lang.Dictionary;
                        var rowY = 112 + (lapIndex * 48);
                        var lapNumber = lap["lapNumber"] == null
                            ? (lapIndex + 1).toString() : lap["lapNumber"].toString();
                        var lapTime = lap["elapsedTimeMs"] == null
                            ? "--" : formatTime(lap["elapsedTimeMs"]);
                        var lapDistance = lap["distanceMeters"] == null
                            ? "--" : numberText(lap["distanceMeters"] / 1000.0, 2);
                        var lapHeartRate = lap["averageHeartRateBpm"] == null
                            ? "--" : lap["averageHeartRateBpm"].toString();
                        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
                        dc.drawLine(42, rowY - 8, 348, rowY - 8);
                        drawActivityText(dc, 67, rowY, 42, 24, lapNumber,
                            Graphics.FONT_SMALL, 0x25D3CB);
                        drawActivityText(dc, 137, rowY, 88, 24, lapTime,
                            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
                        drawActivityText(dc, 226, rowY, 82, 24, lapDistance,
                            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
                        drawActivityText(dc, 315, rowY, 70, 24, lapHeartRate,
                            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
                    }
                    if (mFinalLaps.size() > 5) {
                        var firstShown = mSavedLapOffset + 1;
                        var lastShown = mSavedLapOffset + shownLaps;
                        drawActivityText(dc, cx, 354, 280, 14,
                            "RUNDEN " + firstShown.toString() + "-" + lastShown.toString() +
                            " / " + mFinalLaps.size().toString() + " · WISCHEN",
                            Graphics.FONT_XTINY, 0x98A5AB);
                    }
                }
                if (mFinalLaps.size() <= 5) {
                    drawActivityText(dc, cx, 365, 280, 14,
                        "OBEN · ZURÜCK  |  UNTEN · ÜBERSICHT",
                        Graphics.FONT_XTINY, 0x98A5AB);
                }
            }
            dc.setColor(mSavedDetailPage == 0 ? 0x25D3CB : 0x3B454B, Graphics.COLOR_BLACK);
            dc.fillCircle(cx - 18, 382, 3);
            dc.setColor(mSavedDetailPage == 1 ? 0x25D3CB : 0x3B454B, Graphics.COLOR_BLACK);
            dc.fillCircle(cx, 382, 3);
            dc.setColor(mSavedDetailPage == 2 ? 0x25D3CB : 0x3B454B, Graphics.COLOR_BLACK);
            dc.fillCircle(cx + 18, 382, 3);
            mButtonTop = 0;
            mButtonBottom = 0;
        } else if (mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            drawPageHeader(dc, "SPEICHERFEHLER");
            drawActivityText(dc, cx, 180, 280, 22, "BITTE ERNEUT SPEICHERN",
                Graphics.FONT_SMALL, 0xFF9F1A);
            drawActivityText(dc, cx, 335, 280, 18, "ERNEUT SPEICHERN",
                Graphics.FONT_XTINY, 0x25D3CB);
            // Die sichtbare Wiederholungsaktion muss auch per Touch erreichbar sein.
            mButtonTop = 306;
            mButtonBottom = 374;
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
                    var isCurrent = stepIndex == mWorkoutStepIndex && !mWorkoutSequenceComplete;
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
                    drawActivityText(dc, (cx - rowWidth * 0.32).toNumber(), rowY + 3,
                        (rowWidth * 0.14).toNumber(), 30,
                        marker, Graphics.FONT_SMALL, stepColor);
                    drawActivityText(dc, (cx + rowWidth * 0.05).toNumber(),
                        (rowY + 3).toNumber(), (rowWidth * 0.60).toNumber(), 16,
                        compactWorkoutText(stepName, 30), Graphics.FONT_XTINY,
                        isCurrent ? Graphics.COLOR_WHITE : stepColor);
                    var detail = durationText + " · " + typeText;
                    if (target != "") { detail += " · " + compactWorkoutText(target, 18); }
                    drawActivityText(dc, (cx + rowWidth * 0.05).toNumber(), (rowY + 20).toNumber(),
                        (rowWidth * 0.60).toNumber(), 14,
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

        // Kurz eingeblendete Rundenzusammenfassung über der laufenden Ansicht.
        if (mStatus == "AUFZEICHNUNG" && mLapSummaryVisible) {
            dc.setColor(0x071014, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(42, 105, 306, 180, 18);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(42, 105, 306, 180, 18);
            drawActivityText(dc, cx, 121, 270, 20,
                "RUNDE " + mLapSummaryNumber.toString(),
                Graphics.FONT_SMALL, 0x25D3CB);
            drawActivityText(dc, cx, 151, 270, 48,
                mLapSummaryTime, Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
            dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
            dc.drawLine(70, 207, 320, 207);
            dc.drawLine(cx, 216, cx, 263);
            drawActivityText(dc, 128, 216, 110, 14, "DISTANZ",
                Graphics.FONT_XTINY, 0x98A5AB);
            drawActivityText(dc, 128, 235, 110, 24,
                mLapSummaryDistance, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawActivityText(dc, 260, 216, 110, 14, "Ø PULS",
                Graphics.FONT_XTINY, 0x98A5AB);
            drawActivityText(dc, 260, 235, 110, 24,
                mLapSummaryHeartRate, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawActivityText(dc, cx, 264, 250, 14, "BPM · 7 SEKUNDEN",
                Graphics.FONT_XTINY, 0x98A5AB);
        }

        // Kurze, dauerhaft lesbare Diagnose bei fehlgeschlagenem Pausieren.
        if (mShowPauseDebug && mStatus == "AUFZEICHNUNG") {
            var pauseDiagnostic = "PAUSE: " +
                compactWorkoutText(mEngine.getLastPauseDebug(), 30);
            dc.setColor(0x301515, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(38, 360, 314, 25, 8);
            drawActivityText(dc, cx, 365, 296, 16, pauseDiagnostic,
                Graphics.FONT_XTINY, 0xFF9F1A);
        }
    }
}
