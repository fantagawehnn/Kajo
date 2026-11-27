import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Timer;
import Toybox.WatchUi;

class KajoRecorderView extends WatchUi.View {

    var mSession as ActivityRecording.Session? = null;
    var mTimer as Timer.Timer;
    var mElapsedSeconds as Lang.Number = 0;
    var mStatus as Lang.String = "BEREIT";
    var mError as Lang.String = "";

    function initialize() {
        View.initialize();
        mTimer = new Timer.Timer();
    }

    function startActivity() as Lang.Boolean {
        if (mStatus == "AUFZEICHNUNG") {
            return true;
        }

        mError = "";
        try {
            mSession = ActivityRecording.createSession({
                :name => "KAJO",
                :sport => Activity.SPORT_KAYAKING
            });

            var started = mSession.start();
            if (!started) {
                mStatus = "START FEHLGESCHLAGEN";
                mError = "Garmin konnte die Aktivitaet nicht starten.";
                WatchUi.requestUpdate();
                return true;
            }

            mElapsedSeconds = 0;
            mStatus = "AUFZEICHNUNG";
            mTimer.start(method(:onTimer), 1000, true);
            WatchUi.requestUpdate();
        } catch (error) {
            mStatus = "START FEHLGESCHLAGEN";
            mError = error.toString();
            WatchUi.requestUpdate();
        }

        return true;
    }

    function onTimer() as Void {
        if (mStatus == "AUFZEICHNUNG") {
            mElapsedSeconds += 1;
            WatchUi.requestUpdate();
        }
    }

    function twoDigits(value as Lang.Number) as Lang.String {
        return value < 10 ? "0" + value.toString() : value.toString();
    }

    function getElapsedText() as Lang.String {
        var hours = Math.floor(mElapsedSeconds / 3600);
        var minutes = Math.floor((mElapsedSeconds % 3600) / 60);
        var seconds = mElapsedSeconds % 60;

        if (hours > 0) {
            return twoDigits(hours) + ":" + twoDigits(minutes) + ":" + twoDigits(seconds);
        }
        return twoDigits(minutes) + ":" + twoDigits(seconds);
    }

    function onUpdate(dc as Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var centerX = width / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.drawText(centerX, height * 0.20, Graphics.FONT_MEDIUM,
            "KAJO RECORDER", Graphics.TEXT_JUSTIFY_CENTER);

        if (mStatus == "BEREIT") {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.39, Graphics.FONT_LARGE,
                "BEREIT", Graphics.TEXT_JUSTIFY_CENTER);

            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(centerX - 105, height * 0.57, 210, 62, 18);
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.57 + 17, Graphics.FONT_MEDIUM,
                "STARTEN", Graphics.TEXT_JUSTIFY_CENTER);

            dc.setColor(0x98A5AB, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.82, Graphics.FONT_XTINY,
                "ANTIPPEN ODER START-TASTE", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (mStatus == "AUFZEICHNUNG") {
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.37, Graphics.FONT_SMALL,
                "AUFZEICHNUNG", Graphics.TEXT_JUSTIFY_CENTER);

            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.47, Graphics.FONT_NUMBER_HOT,
                getElapsedText(), Graphics.TEXT_JUSTIFY_CENTER);

            dc.setColor(0x98A5AB, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.68, Graphics.FONT_XTINY,
                "AKTIVITAET LAEUFT", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(0xFF9F1A, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.35, Graphics.FONT_SMALL,
                "START FEHLGESCHLAGEN", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.47, Graphics.FONT_XTINY,
                mError, Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.drawText(centerX, height * 0.70, Graphics.FONT_SMALL,
                "ERNEUT STARTEN", Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (mStatus != "AUFZEICHNUNG") {
            startActivity();
        }
    }
}
