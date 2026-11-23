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
    var mUnit = 0;
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
        if (mEnabledPageIds.size() == 0) { mEnabledPageIds = [0]; }
        mPageCount = mEnabledPageIds.size();
        mPage = 0;
    }

    function startRecording() as Void {
        var started = mEngine.start(mBoatClass);
        if (started) {
            mStatus = "AUFZEICHNUNG";
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
            mTimer.start(method(:onTimer), 1000, true);
        } else {
            mStatus = "START FEHLGESCHLAGEN";
        }
        WatchUi.requestUpdate();
    }

    function onTimer() as Void { WatchUi.requestUpdate(); }
    function onPosition(positionInfo as Position.Info) as Void { WatchUi.requestUpdate(); }

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
        if (mStatus != "AUFZEICHNUNG") { return; }
        mPage += direction;
        if (mPage < 0) {
            mPage = mPageCount - 1;
        } else if (mPage >= mPageCount) {
            mPage = 0;
        }
        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y < mButtonTop || y > mButtonBottom) { return; }
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            startRecording();
            return;
        }
        if (mStatus == "AUFZEICHNUNG") {
            if (x < mScreenWidth / 2) {
                if (mEngine.addLap()) { WatchUi.showToast("Runde gespeichert", null); }
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
        if (value == null) { return "--"; }
        var multiplier = 1;
        if (decimals == 1) { multiplier = 10; }
        if (decimals == 2) { multiplier = 100; }
        var rounded = Math.round(value * multiplier);
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

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth, preferredFont);
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x), Math.round(y), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function drawPageHeader(dc as Dc, title as Lang.String) as Void {
        var cx = mScreenWidth / 2;
        drawFit(dc, cx, mUnit * 0.105, title, mUnit * 0.58, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, mUnit * 0.17,
            (mPage + 1).toString() + " / " + mPageCount.toString() + "  ·  ↑ ↓",
            mUnit * 0.65, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function drawMetric(dc as Dc, x, y, label as Lang.String, value as Lang.String, unit as Lang.String, maxWidth, valueFont) as Void {
        drawFit(dc, x, y, label, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        var valueY = y + (mUnit * 0.065);
        var font = fitFont(dc, value, maxWidth, valueFont);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x), Math.round(valueY), font, value, Graphics.TEXT_JUSTIFY_CENTER);
        if (unit != "") {
            drawFit(dc, x, valueY + (mUnit * 0.065), unit, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }
    }

    function drawButton(dc as Dc, centerX, top, width, label as Lang.String) as Void {
        var height = mButtonBottom - mButtonTop;
        var left = centerX - (width / 2);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(Math.round(left), Math.round(top), Math.round(width), Math.round(height), Math.round(mUnit * 0.025));
        drawFit(dc, centerX, top + (height - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            label, width * 0.86, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mScreenWidth = dc.getWidth();
        mScreenHeight = dc.getHeight();
        mUnit = mScreenWidth;
        if (mScreenHeight < mUnit) { mUnit = mScreenHeight; }

        var cx = mScreenWidth / 2;
        mCurrentPageId = mEnabledPageIds[mPage] as Lang.Number;
        var activityInfo = null;
        if (mStatus == "AUFZEICHNUNG") { activityInfo = Activity.getActivityInfo(); }

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
            hrNow = valueOrDash(activityInfo.currentHeartRate);
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
            gpsAccuracy = valueOrDash(activityInfo.currentLocationAccuracy);
        }

        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawPageHeader(dc, "AKTIVITAET");
            drawFit(dc, cx, mUnit * 0.34, "BEREIT", mUnit * 0.72, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
            drawFit(dc, cx, mUnit * 0.47, "Aufzeichnung starten", mUnit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
            drawFit(dc, cx, mUnit * 0.57, "Bootsklasse im Startmenue gewaehlt", mUnit * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else if (mCurrentPageId == 0) {
            drawPageHeader(dc, "UEBERSICHT");
            drawFit(dc, cx, mUnit * 0.245, speedNow, mUnit * 0.70, Graphics.FONT_NUMBER_HOT, Graphics.COLOR_WHITE);
            drawFit(dc, cx, mUnit * 0.405, "KM/H  ·  GESCHWINDIGKEIT", mUnit * 0.76, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.55, "HERZFREQUENZ", hrNow, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.55, "ZEIT", elapsed, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 1) {
            drawPageHeader(dc, "GESCHWINDIGKEIT");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", speedNow, "KM/H", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "DURCHSCHNITT", speedAvg, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "MAXIMUM", speedMax, "KM/H", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 2) {
            drawPageHeader(dc, "HERZFREQUENZ");
            drawMetric(dc, cx, mUnit * 0.25, "AKTUELL", hrNow, "BPM", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "DURCHSCHNITT", hrAvg, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "MAXIMUM", hrMax, "BPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else if (mCurrentPageId == 3) {
            drawPageHeader(dc, "DISTANZ & ZEIT");
            drawMetric(dc, cx, mUnit * 0.25, "DISTANZ", distance, "KM", mUnit * 0.68, Graphics.FONT_LARGE);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.57, "ZEIT", elapsed, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.57, "KALORIEN", calories, "KCAL", mUnit * 0.39, Graphics.FONT_MEDIUM);
        } else {
            drawPageHeader(dc, "WEITERE DATEN");
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.245, "KADENZ", cadenceNow, "RPM", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.245, "LEISTUNG", powerNow, "W", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.30, mUnit * 0.49, "HOEHE", altitude, "M", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawMetric(dc, mScreenWidth * 0.70, mUnit * 0.49, "TRAINING EFFECT", trainingEffect, "", mUnit * 0.39, Graphics.FONT_MEDIUM);
            drawFit(dc, cx, mUnit * 0.72, gpsText + " · GPS " + gpsAccuracy, mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawFit(dc, cx, mUnit * 0.765, "Anstieg " + ascent + " m · Abstieg " + descent + " m", mUnit * 0.76, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        drawFit(dc, cx, mUnit * 0.805, mStatus, mUnit * 0.70, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        mButtonTop = mUnit * 0.82;
        mButtonBottom = mUnit * 0.90;
        if (mStatus == "BEREIT" || mStatus == "START FEHLGESCHLAGEN") {
            drawButton(dc, cx, mButtonTop, mUnit * 0.58, "STARTEN");
        } else if (mStatus == "AUFZEICHNUNG") {
            drawButton(dc, mScreenWidth * 0.33, mButtonTop, mUnit * 0.25, "RUNDE");
            drawButton(dc, mScreenWidth * 0.67, mButtonTop, mUnit * 0.25, "ENDE");
        } else {
            drawButton(dc, cx, mButtonTop, mUnit * 0.58, "ZURUECK");
        }
    }
}
