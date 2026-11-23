import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
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

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
    }

    function startRecording() as Void {
        var started = mEngine.start(mBoatClass);

        if (started) {
            mStatus = "AUFZEICHNUNG";
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }

        WatchUi.requestUpdate();
    }

    function onTimer() as Void {
        WatchUi.requestUpdate();
    }

    function finishRecording() as Void {
        mTimer.stop();

        if (mEngine.finish()) {
            mStatus = "GESPEICHERT";
        } else {
            mStatus = "SPEICHERN FEHLGESCHLAGEN";
        }

        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y < mButtonTop || y > mButtonBottom) {
            return;
        }

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            startRecording();
            return;
        }

        if (mStatus == "AUFZEICHNUNG") {
            if (x < mScreenWidth / 2) {
                if (mEngine.addLap()) {
                    WatchUi.showToast("Runde gespeichert", null);
                }
            } else {
                finishRecording();
            }
            return;
        }

        if (mStatus == "GESPEICHERT" || mStatus == "SPEICHERN FEHLGESCHLAGEN") {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }

    function formatTime(milliseconds as Lang.Number) as Lang.String {
        var totalSeconds = Math.floor(milliseconds / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds - (minutes * 60);

        var minuteText = minutes.toString();
        var secondText = seconds.toString();

        if (minutes < 10) {
            minuteText = "0" + minuteText;
        }

        if (seconds < 10) {
            secondText = "0" + secondText;
        }

        return minuteText + ":" + secondText;
    }

    function onUpdate(dc as Dc) {
        dc.clear();

        mScreenWidth = dc.getWidth();
        mScreenHeight = dc.getHeight();

        var centerX = mScreenWidth / 2;
        var smallFont = Graphics.FONT_TINY;
        var labelFont = Graphics.FONT_SMALL;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.07,
            Graphics.FONT_SMALL,
            "KAJO",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.15,
            smallFont,
            mBoatClass + " · WILDWASSER",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        var speedText = "--";
        var heartRateText = "--";
        var elapsedText = "00:00";
        var gpsText = "GPS AUS";

        if (mStatus == "AUFZEICHNUNG") {
            var activityInfo = Activity.getActivityInfo();

            if (activityInfo != null) {
                if (activityInfo.currentSpeed != null) {
                    var speedKmh = Math.round(activityInfo.currentSpeed * 3.6);
                    speedText = speedKmh.toString();
                }

                if (activityInfo.currentHeartRate != null) {
                    heartRateText = activityInfo.currentHeartRate.toString();
                }

                if (activityInfo.timerTime != null) {
                    elapsedText = formatTime(activityInfo.timerTime);
                } else if (activityInfo.elapsedTime != null) {
                    elapsedText = formatTime(activityInfo.elapsedTime);
                }

                if (activityInfo.currentLocation != null) {
                    gpsText = "GPS AKTIV";
                } else {
                    gpsText = "GPS SUCHT";
                }
            }
        }

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.24,
            Graphics.FONT_NUMBER_HOT,
            speedText,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.43,
            labelFont,
            "KM/H",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.drawLine(
            mScreenWidth * 0.16,
            mScreenHeight * 0.52,
            mScreenWidth * 0.84,
            mScreenHeight * 0.52
        );

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(
            mScreenWidth * 0.30,
            mScreenHeight * 0.56,
            smallFont,
            "HERZFREQUENZ",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.drawText(
            mScreenWidth * 0.30,
            mScreenHeight * 0.63,
            Graphics.FONT_MEDIUM,
            heartRateText,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.drawText(
            mScreenWidth * 0.70,
            mScreenHeight * 0.56,
            smallFont,
            "ZEIT",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(
            mScreenWidth * 0.70,
            mScreenHeight * 0.63,
            Graphics.FONT_MEDIUM,
            elapsedText,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.72,
            smallFont,
            gpsText,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(
            centerX,
            mScreenHeight * 0.77,
            smallFont,
            mStatus,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        mButtonTop = mScreenHeight * 0.83;
        mButtonBottom = mScreenHeight * 0.93;

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawButton(dc, centerX, mButtonTop, mScreenWidth * 0.58, "STARTEN");
        } else if (mStatus == "AUFZEICHNUNG") {
            drawButton(dc, mScreenWidth * 0.30, mButtonTop, mScreenWidth * 0.34, "RUNDE");
            drawButton(dc, mScreenWidth * 0.70, mButtonTop, mScreenWidth * 0.34, "ENDE");
        } else {
            drawButton(dc, centerX, mButtonTop, mScreenWidth * 0.58, "ZURUECK");
        }
    }

    function drawButton(dc as Dc, centerX as Lang.Number, top as Lang.Number, width as Lang.Number, label as Lang.String) as Void {
        var left = centerX - (width / 2);
        var height = mButtonBottom - mButtonTop;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(left, top, width, height, 9);
        dc.drawText(
            centerX,
            top + (height - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            Graphics.FONT_SMALL,
            label,
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }
}
