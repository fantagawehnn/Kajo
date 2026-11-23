import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mSelectedBoat = "K1";
    var mPlannedSessions as Lang.Array<Lang.Dictionary> = [];
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;
    var mBoatTop = 0;
    var mBoatBottom = 0;
    var mBoatLeft = 0;
    var mBoatRight = 0;
    var mStartTop = 0;
    var mStartBottom = 0;
    var mFreeTop = 0;
    var mFreeBottom = 0;
    var mMenuTop = 0;
    var mMenuBottom = 0;
    var mPlanStartY = 0;
    var mPlanRowHeight = 0;
    var mPlanStartIndex = 0;
    var mMenuStartIndex = 0;
    var mApi as KajoConnectApi;
    var mSyncStatus as Lang.String = "NICHT MIT KAJO VERBUNDEN";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    function initialize() {
        View.initialize();
        mApi = new KajoConnectApi();
        var cachedSessions = Storage.getValue("kajoPlannedSessions");
        if (cachedSessions != null) {
            mPlannedSessions = cachedSessions as Lang.Array<Lang.Dictionary>;
            if (mPlannedSessions.size() > 0) {
                mSyncStatus = "GESPEICHERTER TRAININGSPLAN";
            }
        }
    }

    function onShow() as Void {
        syncFromKajo();
    }

    function padDatePart(value as Lang.Number) as Lang.String {
        return value < 10 ? "0" + value.toString() : value.toString();
    }

    function getLocalDate() as Lang.String {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return info.year.toString() + "-" + padDatePart(info.month) + "-" + padDatePart(info.day);
    }

    function syncFromKajo() as Void {
        var token = Storage.getValue("kajoDeviceToken");
        if (token == null || token.toString().length() == 0) {
            mSyncStatus = mPlannedSessions.size() > 0
                ? "GESPEICHERTER TRAININGSPLAN"
                : "NICHT MIT KAJO VERBUNDEN";
            WatchUi.requestUpdate();
            return;
        }

        mSyncStatus = "KAJO SYNCHRONISIERT …";
        WatchUi.requestUpdate();
        mApi.postJson(
            mEndpoint,
            { "action" => "sync", "localDate" => getLocalDate() },
            token.toString(),
            method(:onSyncResponse)
        );
    }

    function onSyncResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        if (responseCode != 200 || data == null) {
            if (responseCode == 401) {
                Storage.setValue("kajoDeviceToken", "");
                mSyncStatus = "ZUGRIFF WIDERRUFEN – NEU KOPPELN";
            } else {
                mSyncStatus = mPlannedSessions.size() > 0
                    ? "OFFLINE · GESPEICHERTER PLAN"
                    : "KAJO NICHT ERREICHBAR";
            }
            WatchUi.requestUpdate();
            return;
        }

        var sessions = data["plannedSessions"];
        if (sessions != null) {
            mPlannedSessions = sessions as Lang.Array<Lang.Dictionary>;
            mPlanStartIndex = 0;
        } else {
            mPlannedSessions = [];
        }
        var cacheSaved = true;
        try {
            Storage.setValue("kajoPlannedSessions", mPlannedSessions);
        } catch (error) {
            cacheSaved = false;
        }

        var displayLayouts = data["displayLayouts"];
        if (displayLayouts != null) {
            var layouts = displayLayouts as Lang.Array<Lang.Dictionary>;
            // Immer alle drei Slots aktualisieren. So werden entfernte Datenseiten
            // auch auf der Uhr gelöscht und bleiben nicht als veralteter Cache bestehen.
            for (var layoutIndex = 0; layoutIndex < 3; layoutIndex += 1) {
                var metricIds = [];
                var metricSizes = {};
                var metricPositions = {};
                var largeMetricId = "";

                if (layoutIndex < layouts.size()) {
                    var layout = layouts[layoutIndex] as Lang.Dictionary;
                    var receivedMetrics = layout["metrics"];
                    if (receivedMetrics != null) {
                        var metrics = receivedMetrics as Lang.Array<Lang.Dictionary>;
                        for (var metricIndex = 0; metricIndex < metrics.size() && metricIndex < 4; metricIndex += 1) {
                            var metric = metrics[metricIndex] as Lang.Dictionary;
                            var metricIdValue = metric["id"];
                            if (metricIdValue == null) { continue; }
                            var metricId = metricIdValue.toString();
                            if (metricIds.indexOf(metricId) >= 0) { continue; }
                            var sizeValue = metric["size"];
                            var sizeText = sizeValue == null ? "medium" : sizeValue.toString();
                            var numericSize = sizeText == "small" ? 0 : sizeText == "large" ? 2 : 1;
                            var positionValue = metric["position"];
                            var positionNumber = positionValue == null ? metricIndex : positionValue as Lang.Number;
                            if (positionNumber < 0 || positionNumber > 4) { positionNumber = metricIndex; }
                            metricIds.add(metricId);
                            metricSizes[metricId] = numericSize;
                            metricPositions[metricId] = positionNumber;
                            if (numericSize == 2) { largeMetricId = metricId; }
                        }
                    }
                }

                try {
                    Storage.setValue("kajoCustomMetrics" + layoutIndex.toString(), metricIds);
                    Storage.setValue("kajoMetricSizes" + layoutIndex.toString(), metricSizes);
                    Storage.setValue("kajoMetricPositions" + layoutIndex.toString(), metricPositions);
                    Storage.setValue("kajoLargeMetricId" + layoutIndex.toString(), largeMetricId);
                    if (layoutIndex == 0) {
                        Storage.setValue("kajoCustomMetrics", metricIds);
                        Storage.setValue("kajoMetricSizes", metricSizes);
                        Storage.setValue("kajoLargeMetricId", largeMetricId);
                    }
                } catch (error) {
                    cacheSaved = false;
                }
            }
        }

        var zoneInfo = data["heartRateZones"];
        var zoneValues = [];
        if (zoneInfo != null) {
            var zoneDictionary = zoneInfo as Lang.Dictionary;
            var receivedZones = zoneDictionary["zones"];
            if (receivedZones != null) {
                zoneValues = receivedZones as Lang.Array<Lang.Number>;
            }
        }
        try {
            if (zoneValues.size() == 4) {
                for (var i = 0; i < 4; i += 1) {
                    Storage.setValue("kajoHeartRateZone" + i.toString(), zoneValues[i]);
                }
                Storage.setValue("kajoHeartRateZoneDate", getLocalDate());
            } else {
                for (var i = 0; i < 4; i += 1) {
                    Storage.setValue("kajoHeartRateZone" + i.toString(), 0);
                }
                Storage.setValue("kajoHeartRateZoneDate", "");
            }
        } catch (error) {
            cacheSaved = false;
        }

        mSyncStatus = cacheSaved ? "KAJO AKTUALISIERT" : "KAJO AKTUALISIERT · CACHE FEHLER";
        WatchUi.requestUpdate();
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function compactSyncStatus() as Lang.String {
        if (mSyncStatus == "KAJO SYNCHRONISIERT …") { return "SYNC …"; }
        if (mSyncStatus == "KAJO AKTUALISIERT") { return "SYNC OK"; }
        if (mSyncStatus == "KAJO AKTUALISIERT · CACHE FEHLER") { return "SYNC-FEHLER"; }
        if (mSyncStatus == "ZUGRIFF WIDERRUFEN – NEU KOPPELN") { return "NEU KOPPELN"; }
        if (mSyncStatus == "KAJO NICHT ERREICHBAR" ||
            mSyncStatus == "OFFLINE · GESPEICHERTER PLAN") { return "OFFLINE"; }
        if (mSyncStatus == "GESPEICHERTER TRAININGSPLAN") { return "OFFLINE"; }
        if (mSyncStatus == "NICHT MIT KAJO VERBUNDEN") { return "NICHT VERBUNDEN"; }
        return "KAJO";
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        var displayText = text;
        while (displayText.length() > 0 && dc.getTextWidthInPixels(displayText, font) > maxWidth) {
            if (displayText.length() <= 4) {
                displayText = "";
            } else {
                displayText = displayText.substring(0, displayText.length() - 4) + "...";
            }
        }
        if (displayText == "") { return; }
        var safeY = y;
        var textHeight = dc.getFontHeight(font);
        if (safeY < 2) { safeY = 2; }
        if (safeY + textHeight > mHeight - 2) { safeY = mHeight - textHeight - 2; }
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(x.toNumber(), safeY.toNumber(), font, displayText, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function setPlannedSessions(sessions as Lang.Array<Lang.Dictionary>) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {
        // Auf dem Startbildschirm wird die Trainingsliste vertikal weitergeschoben.
        mMenuStartIndex += direction;
        if (mMenuStartIndex < 0) { mMenuStartIndex = 0; }
        if (mMenuStartIndex > 1) { mMenuStartIndex = 1; }
        WatchUi.requestUpdate();
    }

    function openActivityView(workout as Lang.Dictionary or Null) as Void {
        var activityView = new KajoConnectActivityView(mSelectedBoat);
        if (workout != null) {
            activityView.setSelectedWorkout(workout as Lang.Dictionary);
        } else {
            activityView.setFreeActivity();
        }

        var storedZoneDate = Storage.getValue("kajoHeartRateZoneDate");
        if (storedZoneDate != null && storedZoneDate.toString() == getLocalDate()) {
            var zoneValues = [];
            var zonesValid = true;
            for (var zoneIndex = 0; zoneIndex < 4; zoneIndex += 1) {
                var zoneValue = Storage.getValue("kajoHeartRateZone" + zoneIndex.toString());
                if (zoneValue == null || (zoneValue as Lang.Number) <= 0) {
                    zonesValid = false;
                    break;
                }
                zoneValues.add(zoneValue as Lang.Number);
            }
            if (zonesValid) { activityView.setHeartRateZones(zoneValues); }
        }

        WatchUi.pushView(
            activityView,
            new KajoConnectActivityDelegate(activityView),
            WatchUi.SLIDE_UP
        );
    }

    function startActivity() as Void {
        var todaysSessions = getTodaysSessions();

        if (todaysSessions.size() > 1) {
            var selector = new KajoConnectWorkoutSelectView(todaysSessions, self);
            WatchUi.pushView(selector, new KajoConnectWorkoutSelectDelegate(selector), WatchUi.SLIDE_UP);
        } else if (todaysSessions.size() == 1) {
            openActivityView(todaysSessions[0] as Lang.Dictionary);
        } else {
            openActivityView(null);
        }
    }

    // Wird von der Auswahlansicht aufgerufen, nachdem eine Einheit angetippt wurde.
    function startActivityWithWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        openActivityView(workout);
    }

    function getTodaysSessions() as Lang.Array<Lang.Dictionary> {
        var today = getLocalDate();
        var todaysSessions = [];
        for (var i = 0; i < mPlannedSessions.size(); i += 1) {
            var session = mPlannedSessions[i] as Lang.Dictionary;
            var sessionDate = session["date"];
            if (sessionDate != null && sessionDate.toString() == today) {
                var sessionType = session["type"];
                if (sessionType == null || sessionType.toString() != "RestDay") {
                    todaysSessions.add(session);
                }
            }
        }
        return todaysSessions;
    }

    function handleTap(x as Lang.Number, y as Lang.Number) {
        // Die Sportart-/Bootsklasse bleibt direkt im Header waehlbar.
        if (y >= mBoatTop && y <= mBoatBottom &&
            x >= mBoatLeft && x <= mBoatRight) {
            var relativeX = x - mBoatLeft;
            var third = (mBoatRight - mBoatLeft) / 3;
            if (relativeX < third) {
                mSelectedBoat = "K1";
            } else if (relativeX < (third * 2)) {
                mSelectedBoat = "C1";
            } else {
                mSelectedBoat = "C2";
            }
            WatchUi.requestUpdate();
            return;
        }

        // Die gesamte Trainingskachel oeffnet den heutigen Trainingseinstieg.
        if (y >= mStartTop && y <= mStartBottom) {
            startActivity();
            return;
        }

        // Scrollbare Trainingsliste: Freies Training, Plan, Historie, Einstellungen.
        if (y >= mFreeTop && y <= mFreeBottom) {
            var row = Math.floor((y - mFreeTop) / (mUnit * 0.105)).toNumber();
            var index = mMenuStartIndex + row;
            if (index == 0) {
                openActivityView(null);
            } else if (index == 1) {
                var listView = new KajoConnectWorkoutListView();
                WatchUi.pushView(listView, new KajoConnectWorkoutListDelegate(listView), WatchUi.SLIDE_UP);
            } else if (index == 2) {
                WatchUi.showToast("Trainingshistorie ist noch nicht verfuegbar", null);
            } else if (index == 3) {
                WatchUi.pushView(
                    new Rez.Menus.MainMenu(),
                    new KajoConnectMenuDelegate(),
                    WatchUi.SLIDE_UP
                );
            }
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }

        var cx = mWidth / 2;
        var todaySessions = getTodaysSessions();
        var hasTrainingToday = todaySessions.size() > 0;

        // Feiner cyanfarbener Randbogen oben links als AMOLED-Detail.
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.105).toNumber(), (mUnit * 0.105).toNumber(),
            (mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber());
        dc.drawLine((mUnit * 0.12).toNumber(), (mUnit * 0.075).toNumber(),
            (mUnit * 0.15).toNumber(), (mUnit * 0.052).toNumber());
        dc.drawLine((mUnit * 0.15).toNumber(), (mUnit * 0.052).toNumber(),
            (mUnit * 0.185).toNumber(), (mUnit * 0.04).toNumber());

        // Header: Marke und aktuell ausgewaehlte Bootsklasse.
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawLine((cx - mUnit * 0.105).toNumber(), (mUnit * 0.085).toNumber(),
            (cx - mUnit * 0.065).toNumber(), (mUnit * 0.075).toNumber());
        dc.drawLine((cx - mUnit * 0.065).toNumber(), (mUnit * 0.075).toNumber(),
            (cx - mUnit * 0.025).toNumber(), (mUnit * 0.09).toNumber());
        dc.drawLine((cx - mUnit * 0.09).toNumber(), (mUnit * 0.105).toNumber(),
            (cx - mUnit * 0.055).toNumber(), (mUnit * 0.095).toNumber());
        drawCentered(dc, cx + (mUnit * 0.045), mUnit * 0.055, "KAJO",
            mUnit * 0.45, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, mUnit * 0.145, "SPORTART:",
            mUnit * 0.55, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var sportLabel = mSelectedBoat + "  •  WILDWASSER";
        mBoatTop = mUnit * 0.17;
        mBoatBottom = mUnit * 0.235;
        mBoatLeft = cx - (mUnit * 0.36);
        mBoatRight = cx + (mUnit * 0.36);
        drawCentered(dc, cx, mUnit * 0.18, sportLabel,
            mUnit * 0.70, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawCircle((cx + mUnit * 0.275).toNumber(), (mUnit * 0.207).toNumber(),
            (mUnit * 0.014).toNumber());
        dc.drawLine((cx + mUnit * 0.272).toNumber(), (mUnit * 0.199).toNumber(),
            (cx + mUnit * 0.272).toNumber(), (mUnit * 0.215).toNumber());
        dc.drawLine((cx + mUnit * 0.272).toNumber(), (mUnit * 0.199).toNumber(),
            (cx + mUnit * 0.282).toNumber(), (mUnit * 0.207).toNumber());
        dc.drawLine((cx + mUnit * 0.282).toNumber(), (mUnit * 0.207).toNumber(),
            (cx + mUnit * 0.272).toNumber(), (mUnit * 0.215).toNumber());
        drawCentered(dc, cx + (mUnit * 0.275), mUnit * 0.222, "AKTIV",
            mUnit * 0.25, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Hero-Kachel: Inhalte stammen aus dem synchronisierten Tagesplan.
        var cardX = cx - (mUnit * 0.405);
        var cardY = mUnit * 0.275;
        var cardWidth = mUnit * 0.81;
        var cardHeight = mUnit * 0.225;
        dc.setColor(0x05181C, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(cardX.toNumber(), cardY.toNumber(),
            cardWidth.toNumber(), cardHeight.toNumber(), (mUnit * 0.055).toNumber());
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(cardX.toNumber(), cardY.toNumber(),
            cardWidth.toNumber(), cardHeight.toNumber(), (mUnit * 0.055).toNumber());

        // Unterbrechung der oberen Kontur fuer das Label.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.fillRectangle((cx - mUnit * 0.205).toNumber(), (cardY - 2).toNumber(),
            (mUnit * 0.41).toNumber(), (mUnit * 0.035).toNumber());
        drawCentered(dc, cx, cardY - (mUnit * 0.006), "TRAINING FUER HEUTE",
            mUnit * 0.43, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var heroName = "KEIN TRAINING GEPLANT";
        var heroDetails = "Freies Training jederzeit moeglich";
        if (todaySessions.size() == 1) {
            var todayWorkout = todaySessions[0] as Lang.Dictionary;
            heroName = todayWorkout["name"] == null
                ? "GEPLANTES TRAINING" : todayWorkout["name"].toString();
            var durationText = todayWorkout["duration"] == null
                ? "" : todayWorkout["duration"].toString() + " MIN";
            var typeText = todayWorkout["type"] == null
                ? "Training" : todayWorkout["type"].toString();
            heroDetails = durationText == "" ? typeText : durationText + "  •  " + typeText;
        } else if (todaySessions.size() > 1) {
            heroName = todaySessions.size().toString() + " TRAININGSEINHEITEN";
            heroDetails = "Antippen und Einheit auswaehlen";
        }
        drawCentered(dc, cx - (mUnit * 0.015), cardY + (mUnit * 0.075),
            heroName, cardWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, cx - (mUnit * 0.015), cardY + (mUnit * 0.145),
            heroDetails, cardWidth * 0.82, Graphics.FONT_XTINY, 0x00E5CC);
        drawCentered(dc, cx + (mUnit * 0.34), cardY + (mUnit * 0.095),
            ">", mUnit * 0.08, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);

        mStartTop = cardY;
        mStartBottom = cardY + cardHeight;

        // Trenner und Scroll-Hinweis.
        var dividerY = mUnit * 0.55;
        dc.setColor(0x2A3236, Graphics.COLOR_BLACK);
        dc.drawLine((mUnit * 0.12).toNumber(), dividerY.toNumber(),
            (mUnit * 0.88).toNumber(), dividerY.toNumber());
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.fillRectangle((mUnit * 0.12).toNumber(), (dividerY - mUnit * 0.018).toNumber(),
            (mUnit * 0.76).toNumber(), (mUnit * 0.04).toNumber());
        drawCentered(dc, mUnit * 0.32, dividerY - (mUnit * 0.017),
            "TRAININGS", mUnit * 0.28, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, mUnit * 0.70, dividerY - (mUnit * 0.017),
            "SCROLLEN  v", mUnit * 0.32, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);

        // Liste: ein sichtbarer Ausschnitt; per Wischgeste wird weitergescrollt.
        mFreeTop = mUnit * 0.59;
        mFreeBottom = mUnit * 0.94;
        var rowHeight = mUnit * 0.105;
        var labels = ["FREIES TRAINING", "GEPLANTE TRAININGS",
            "VERGANGENE TRAININGS", "EINSTELLUNGEN"];
        for (var visibleRow = 0; visibleRow < 4; visibleRow += 1) {
            var itemIndex = mMenuStartIndex + visibleRow;
            if (itemIndex >= labels.size()) { continue; }
            var rowY = mFreeTop + (visibleRow * rowHeight);
            var rowX = mUnit * 0.145;
            var rowWidth = mUnit * 0.71;
            var rowH = mUnit * 0.082;
            dc.setColor(0x091417, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(rowX.toNumber(), rowY.toNumber(),
                rowWidth.toNumber(), rowH.toNumber(), (mUnit * 0.045).toNumber());
            dc.setColor(0x1A4A52, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(rowX.toNumber(), rowY.toNumber(),
                rowWidth.toNumber(), rowH.toNumber(), (mUnit * 0.045).toNumber());

            // Kleine, cyanfarbene Funktionssymbole links.
            var iconX = mUnit * 0.205;
            var iconY = rowY + (rowH / 2);
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            if (itemIndex == 0) {
                dc.drawLine((iconX - 7).toNumber(), (iconY + 2).toNumber(),
                    (iconX - 1).toNumber(), (iconY - 2).toNumber());
                dc.drawLine((iconX - 1).toNumber(), (iconY - 2).toNumber(),
                    (iconX + 5).toNumber(), (iconY + 2).toNumber());
                dc.drawLine((iconX - 5).toNumber(), (iconY + 7).toNumber(),
                    (iconX + 5).toNumber(), (iconY + 7).toNumber());
            } else if (itemIndex == 1) {
                dc.drawRoundedRectangle((iconX - 7).toNumber(), (iconY - 7).toNumber(),
                    14, 14, 2);
                dc.drawLine((iconX - 7).toNumber(), (iconY - 2).toNumber(),
                    (iconX + 7).toNumber(), (iconY - 2).toNumber());
                dc.drawLine((iconX - 3).toNumber(), (iconY - 10).toNumber(),
                    (iconX - 3).toNumber(), (iconY - 5).toNumber());
                dc.drawLine((iconX + 3).toNumber(), (iconY - 10).toNumber(),
                    (iconX + 3).toNumber(), (iconY - 5).toNumber());
            } else if (itemIndex == 2) {
                dc.drawCircle(iconX.toNumber(), iconY.toNumber(), 7);
                dc.drawLine(iconX.toNumber(), iconY.toNumber(),
                    iconX.toNumber(), (iconY - 4).toNumber());
                dc.drawLine(iconX.toNumber(), iconY.toNumber(),
                    (iconX + 4).toNumber(), (iconY + 2).toNumber());
            } else {
                dc.drawCircle(iconX.toNumber(), iconY.toNumber(), 6);
                dc.drawCircle(iconX.toNumber(), iconY.toNumber(), 2);
            }

            drawCentered(dc, mUnit * 0.49, rowY + (rowH * 0.27),
                labels[itemIndex], mUnit * 0.49, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, mUnit * 0.80, rowY + (rowH * 0.23),
                ">", mUnit * 0.07, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        }
    }

}
