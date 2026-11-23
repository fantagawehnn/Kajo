import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;

// Minimaler FIT-Aufzeichnungs-Wrapper für KAJO Connect.
// Die Aktivität wird zunächst als GENERIC aufgezeichnet, damit keine
// nicht verifizierte Garmin-Sportklassifizierung vorgetäuscht wird.
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
            :sport => Activity.SPORT_GENERIC,
            :subSport => Activity.SUB_SPORT_GENERIC
        });

        return mSession.start();
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
            mSession.stop();
        }

        var saved = mSession.save();
        mSession = null;
        return saved;
    }
}
