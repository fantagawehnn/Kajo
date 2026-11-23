import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
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
    var mPage = 0;
    var mPageCount = 5;
    var mEnabledPageIds as Lang.Array<Lang.Number> = [0, 1, 2, 3, 4];
    var mCurrentPageId = 0;

    function initialize(boatClass as Lang.String) {
        View.initialize();
        mBoatClass = boatClass;
        mEngine = new KajoConnectRecordingEngine();
        mTimer = new Timer.Timer();
        loadDisplayPages();
    }

    function loadDisplayPages() as Void {
        mEnabledPageIds = [];
        for (var i = 0; i < 5; i += 1) {
            var savedValue = getApp().getProperty("kajoDisplayPage" + i.toString());
            if (savedValue == null || (savedValue as Lang.Boolean)) {
                mEnabledPageIds.add(i);
            }
        }
        if (mEnabledPageIds.size() == 0) {
            mEnabledPageIds = [0];
        }
        mPageCount = mEnabledPageIds.size();
        mPage = 0;
    }

    function startRecording() as Void {
        var started = mEngine.start(mBoatClass);

        if (started) {
            mStatus = "AUFZEICHNUNG";
            Position.enableLocationEvents(
                Position.LOCATION_CONTINUOUS,
                method(:onPosition)
            );
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }

        WatchUi.requestUpdate();
    }

    function onTimer() as Void {
        WatchUi.requestUpdate();
    }

    function onPosition(positionInfo as Position.Info) as Void {
        WatchUi.requestUpdate();
    }

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
        if (mStatus != "AUFZEICHNUNG") {
            return;
        }

        mPage += direction;

        if (mPage < 0) {
            mPage = mPageCount - 1;
        } else if (mPage >= mPageCount) {
            mPage = 0;
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
        if (value == null) {
            return "--";
        }

        var multiplier = 1;
        if (decimals == 1) { multiplier = 10; }
        if (decimals == 2) { multiplier = 100; }

        var rounded = Math.round(value * multiplier);
        if (decimals == 0) {
            return rounded.toString();
        }

        var whole = Math.floor(rounded / multiplier);
        var fraction = rounded - (whole * multiplier);
        var fractionText = fraction.toString();

        if (decimals == 2 && fraction < 10) {
            fractionText = "0" + fractionText;
        }

        return whole.toString() + "." + fractionText;
    }

    function valueOrDash(value) as Lang.String {
        if (value == null) {
            return "--";
        }
        return value.toString();
    }

    function drawMetric(dc as Dc, x as Lang.Number, y as Lang.Number, label as Lang.String, value as Lang.String, unit as Lang.String) as Void {
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(x, y, Graphics.FONT_TINY, label, Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(x, y + 22, Graphics.FONT_MEDIUM, value, Graphics.TEXT_JUSTIFY_CENTER);

        if (unit != "") {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(x, y + 48, Graphics.FONT_XTINY, unit, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    function drawPageHeader(dc as Dc, title as Lang.String) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(
            mScreenWidth / 2,
            mScreenHeight * 0.09,
            Graphics.FONT_SMALL,
            title,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(
            mScreenWidth / 2,
            mScreenHeight * 0.16,
            Graphics.FONT_XTINY,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  ↑ ↓",
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }

    function onUpdate(dc as Dc) {
        dc.clear();

        mScreenWidth = dc.getWidth();
        mScreenHeight = dc.getHeight();

        var centerX = mScreenWidth / 2;
        mCurrentPageId = mEnabledPageIds[mPage] as Lang.Number;
        var activityInfo = null;

        if (mStatus == "AUFZEICHNUNG") {
            activityInfo = Activity.getActivityInfo();
        }

        var speedNow = "--";
        var speedAvg = "--";
        var speedMax = "--";
        var hrNow = "--";
        var hrAvg = "--";
        var hrMax = "--";
        var distance = "--";
        var elapsed = "00:00";
        var calories = "--";
        var cadenceNow = "--";
        var cadenceAvg = "--";
        var powerNow = "--";
        var powerAvg = "--";
        var trainingEffect = "--";
        var altitude = "--";
        var ascent = "--";
        var descent = "--";
        var gpsText = "GPS AUS";
        var gpsAccuracy = "--";

        if (activityInfo != null) {
            if (activityInfo.currentSpeed != null) {
                speedNow = numberText(activityInfo.currentSpeed * 3.6, 1);
            }
            if (activityInfo.averageSpeed != null) {
                speedAvg = numberText(activityInfo.averageSpeed * 3.6, 1);
            }
            if (activityInfo.maxSpeed != null) {
                speedMax = numberText(activityInfo.maxSpeed * 3.6, 1);
            }
            hrNow = valueOrDash(activityInfo.currentHeartRate);
            hrAvg = valueOrDash(activityInfo.averageHeartRate);
            hrMax = valueOrDash(activityInfo.maxHeartRate);

            if (activityInfo.elapsedDistance != null) {
                distance = numberText(activityInfo.elapsedDistance / 1000.0, 2);
            }
            if (activityInfo.timerTime != null) {
                elapsed = formatTime(activityInfo.timerTime);
            } else if (activityInfo.elapsedTime != null) {
                elapsed = formatTime(activityInfo.elapsedTime);
            }

            calories = valueOrDash(activityInfo.calories);
            cadenceNow = valueOrDash(activityInfo.currentCadence);
            cadenceAvg = valueOrDash(activityInfo.averageCadence);
            powerNow = valueOrDash(activityInfo.currentPower);
            powerAvg = valueOrDash(activityInfo.averagePower);
            trainingEffect = numberText(activityInfo.trainingEffect, 1);
            altitude = numberText(activityInfo.altitude, 0);
            ascent = valueOrDash(activityInfo.totalAscent);
            descent = valueOrDash(activityInfo.totalDescent);

            if (activityInfo.currentLocation != null) {
                gpsText = "GPS AKTIV";
            } else {
                gpsText = "GPS SUCHT";
            }
            gpsAccuracy = valueOrDash(activityInfo.currentLocationAccuracy);
        }

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawPageHeader(dc, "AKTIVITAET");
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(centerX, mScreenHeight * 0.34, Graphics.FONT_LARGE, "BEREIT", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(centerX, mScreenHeight * 0.47, Graphics.FONT_SMALL, "Aufzeichnung starten", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(centerX, mScreenHeight * 0.58, Graphics.FONT_TINY, "Bootsklasse im Startmenue gewaehlt", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (mCurrentPageId == 0) {
            drawPageHeader(dc, "ÜBERSICHT");
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(centerX, mScreenHeight * 0.23, Graphics.FONT_NUMBER_HOT, speedNow, Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(centerX, mScreenHeight * 0.41, Graphics.FONT_SMALL, "KM/H  ·  GESCHWINDIGKEIT", Graphics.TEXT_JUSTIFY_CENTER);
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.55, "HERZFREQUENZ", hrNow, "BPM");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.55, "ZEIT", elapsed, "");
        } else if (mCurrentPageId == 1) {
            drawPageHeader(dc, "GESCHWINDIGKEIT");
            drawMetric(dc, centerX, mScreenHeight * 0.25, "AKTUELL", speedNow, "KM/H");
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.57, "DURCHSCHNITT", speedAvg, "KM/H");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.57, "MAXIMUM", speedMax, "KM/H");
        } else if (mCurrentPageId == 2) {
            drawPageHeader(dc, "HERZFREQUENZ");
            drawMetric(dc, centerX, mScreenHeight * 0.25, "AKTUELL", hrNow, "BPM");
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.57, "DURCHSCHNITT", hrAvg, "BPM");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.57, "MAXIMUM", hrMax, "BPM");
        } else if (mCurrentPageId == 3) {
            drawPageHeader(dc, "DISTANZ & ZEIT");
            drawMetric(dc, centerX, mScreenHeight * 0.25, "DISTANZ", distance, "KM");
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.57, "ZEIT", elapsed, "");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.57, "KALORIEN", calories, "KCAL");
        } else {
            drawPageHeader(dc, "WEITERE DATEN");
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.23, "KADENZ", cadenceNow, "RPM");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.23, "LEISTUNG", powerNow, "W");
            drawMetric(dc, mScreenWidth * 0.29, mScreenHeight * 0.48, "HOEHE", altitude, "M");
            drawMetric(dc, mScreenWidth * 0.71, mScreenHeight * 0.48, "TRAINING EFFECT", trainingEffect, "");
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(centerX, mScreenHeight * 0.72, Graphics.FONT_TINY, gpsText + "  ·  GPS-QUALITAET " + gpsAccuracy, Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(centerX, mScreenHeight * 0.77, Graphics.FONT_XTINY, "Anstieg " + ascent + " m  ·  Abstieg " + descent + " m", Graphics.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(centerX, mScreenHeight * 0.81, Graphics.FONT_XTINY, mStatus, Graphics.TEXT_JUSTIFY_CENTER);

        mButtonTop = mScreenHeight * 0.85;
        mButtonBottom = mScreenHeight * 0.94;

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