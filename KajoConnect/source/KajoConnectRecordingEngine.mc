import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;

// FIT-Aufzeichnungs-Wrapper für KAJO Connect.
// Garmin führt Kayaking und Whitewater als eigene Sport-/Subsportwerte.
class KajoConnectRecordingEngine {

    var mSession as ActivityRecording.Session? = null;
    var mLastError as Lang.String = "";
    var mLastPauseDebug as Lang.String = "NOT_TESTED";
    var mLapSummaries as Lang.Array<Lang.Dictionary> = [];

    function initialize() {
    }

    function start(boatClass as Lang.String) as Lang.Boolean {
        mLastError = "";
        mLapSummaries = [];
        try {
            if (mSession != null && mSession.isRecording()) {
                return false;
            }

            // Kayaking bleibt als FIT-Sportart erhalten. Der optionale
            // Whitewater-SubSport wird weggelassen, da er im Simulator bzw.
            // auf einzelnen Geräte-Firmwares die Sitzungsanlage verhindern kann.
            mSession = ActivityRecording.createSession({
                :name => "KAJO " + boatClass,
                :sport => Activity.SPORT_KAYAKING
            });

            mSession.setTimerEventListener(method(:onTimerEvent));

            if (mSession.isRecording()) {
                return true;
            }

            var started = mSession.start();
            if (!started) {
                mLastError = "SESSION_START_FALSE";
                return false;
            }
            return true;
        } catch (error) {
            mLastError = error.toString();
            return false;
        }
    }

    function onTimerEvent(eventType as ActivityRecording.TimerEventType,
        eventData as Lang.Dictionary) as Void {
        if (eventType != ActivityRecording.TIMER_EVENT_LAP) {
            return;
        }

        var lap = {};
        var elapsedTime = eventData[:elapsedTime];
        var timerTime = eventData[:timerTime];
        var elapsedDistance = eventData[:elapsedDistance];
        var averageSpeed = eventData[:averageSpeed];
        var maxSpeed = eventData[:maxSpeed];

        if (elapsedTime != null) { lap["elapsedTimeMs"] = elapsedTime; }
        if (timerTime != null) { lap["timerTimeMs"] = timerTime; }
        if (elapsedDistance != null) { lap["distanceMeters"] = elapsedDistance; }
        if (averageSpeed != null) { lap["averageSpeedKmh"] = averageSpeed * 3.6; }
        if (maxSpeed != null) { lap["maxSpeedKmh"] = maxSpeed * 3.6; }
        lap["lapNumber"] = mLapSummaries.size() + 1;
        mLapSummaries.add(lap);
    }

    function getLapSummaries() as Lang.Array<Lang.Dictionary> {
        return mLapSummaries;
    }

    function getLastError() as Lang.String {
        return mLastError;
    }

    function isRecording() as Lang.Boolean {
        return mSession != null && mSession.isRecording();
    }

    function pause() as Lang.Boolean {
        if (mSession == null) {
            mLastPauseDebug = "NO_SESSION";
            return false;
        }
        if (!mSession.isRecording()) {
            mLastPauseDebug = "NOT_RECORDING";
            return false;
        }
        try {
            var stopped = mSession.stop();
            mLastPauseDebug = (stopped ? "STOP_TRUE" : "STOP_FALSE") +
                " / FIT " + (mSession.isRecording() ? "ON" : "OFF");
            return stopped;
        } catch (error) {
            mLastPauseDebug = "ERROR " + error.toString();
            return false;
        }
    }

    function getLastPauseDebug() as Lang.String {
        return mLastPauseDebug;
    }

    function resume() as Lang.Boolean {
        if (mSession == null || mSession.isRecording()) { return false; }
        return mSession.start();
    }

    function addLap() as Lang.Boolean {
        if (!isRecording()) {
            return false;
        }

        return mSession.addLap();
    }

    function finish() as Lang.Boolean {
        if (mSession == null) {
            return false;
        }

        if (mSession.isRecording()) {
            if (!mSession.stop()) {
                return false;
            }
        }

        var saved = mSession.save();
        if (saved) {
            mSession = null;
        }
        return saved;
    }

    function discard() as Lang.Boolean {
        if (mSession == null) { return false; }
        if (mSession.isRecording() && !mSession.stop()) { return false; }
        var discarded = mSession.discard();
        if (discarded) { mSession = null; }
        return discarded;
    }
}
