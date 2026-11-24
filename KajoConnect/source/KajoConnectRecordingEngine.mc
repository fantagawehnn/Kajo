import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;

// FIT-Aufzeichnungs-Wrapper für KAJO Connect.
// Garmin führt Kayaking und Whitewater als eigene Sport-/Subsportwerte.
class KajoConnectRecordingEngine {

    var mSession as ActivityRecording.Session? = null;
    var mLastError as Lang.String = "";

    function initialize() {
    }

    function start(boatClass as Lang.String) as Lang.Boolean {
        mLastError = "";
        try {
            if (mSession != null && mSession.isRecording()) {
                return false;
            }

            mSession = ActivityRecording.createSession({
                :name => "KAJO " + boatClass,
                :sport => Activity.SPORT_KAYAKING,
                :subSport => Activity.SUB_SPORT_WHITEWATER
            });

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

    function getLastError() as Lang.String {
        return mLastError;
    }

    function isRecording() as Lang.Boolean {
        return mSession != null && mSession.isRecording();
    }

    function pause() as Lang.Boolean {
        if (mSession == null || !mSession.isRecording()) { return false; }
        return mSession.stop();
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
}
