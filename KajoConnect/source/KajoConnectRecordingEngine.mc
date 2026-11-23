import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;

// FIT-Aufzeichnungs-Wrapper für KAJO Connect.
// Garmin führt Kayaking und Whitewater als eigene Sport-/Subsportwerte.
class KajoConnectRecordingEngine {

    var mSession as ActivityRecording.Session? = null;

    function initialize() {
    }

    function start(boatClass as Lang.String) as Lang.Boolean {
        if (mSession != null && mSession.isRecording()) {
            return false;
        }

        mSession = ActivityRecording.createSession({
            :name => "KAJO " + boatClass,
            :sport => Activity.SPORT_KAYAKING,
            :subSport => Activity.SUB_SPORT_WHITEWATER
        });

        var started = mSession.start();
        if (!started) {
            // Einen fehlgeschlagenen Start sauber verwerfen, damit kein
            // zweites Session-Objekt neben dem ersten angelegt wird.
            mSession.discard();
            mSession = null;
        }
        return started;
    }

    function isRecording() as Lang.Boolean {
        return mSession != null && mSession.isRecording();
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
