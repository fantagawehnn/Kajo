import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

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
    var mMenuRowStep as Lang.Number = 32;
    var mMenuRowCount as Lang.Number = 4;
    var mApi as KajoConnectApi;
    var mSyncStatus as Lang.String = "NICHT MIT KAJO VERBUNDEN";
    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mApi = new KajoConnectApi();
        var savedBoat = Storage.getValue("kajoSelectedBoat");
        if (savedBoat != null &&
            (savedBoat.toString() == "K1" || savedBoat.toString() == "C1" || savedBoat.toString() == "C2")) {
            mSelectedBoat = savedBoat.toString();
        }
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
        return mKajoLayout.fitFont(dc, text, maxWidth, preferredFont);
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
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }


    function drawHomeText(dc as Dc, x as Lang.Number, top as Lang.Number,
        width as Lang.Number, height as Lang.Number, text as Lang.String,
        preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextBox(dc, x, top, width, height, text, preferredFont, color);
    }

    function setPlannedSessions(sessions as Lang.Array<Lang.Dictionary>) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {
        // Alle vier Navigationspunkte bleiben gleichzeitig sichtbar.
        mMenuStartIndex = 0;
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
            showWorkoutDetails(todaysSessions[0] as Lang.Dictionary);
        } else {
            openActivityView(null);
        }
    }

    // Zeigt vor dem Aufzeichnen die Detailansicht der ausgewaehlten Einheit.
    function showWorkoutDetails(workout as Lang.Dictionary) as Void {
        var workoutView = new KajoConnectWorkoutView(workout, self);
        WatchUi.pushView(
            workoutView,
            new KajoConnectWorkoutDelegate(workoutView),
            WatchUi.SLIDE_UP
        );
    }

    // Startet die ausgewaehlte Einheit direkt aus ihrer Vorschau.
    function beginWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        openActivityView(workout);
    }

    // Wird von der Auswahlansicht aufgerufen, nachdem eine Einheit angetippt wurde.
    function startActivityWithWorkout(workout as Lang.Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        showWorkoutDetails(workout);
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
        // Sportart-Auswahl bleibt auf die Kopfzeile begrenzt.
        if (y >= 48 && y <= 64 && x >= 54 && x <= 336) {
            var relativeX = x - 54;
            var third = 282 / 3;
            if (relativeX < third) { mSelectedBoat = "K1"; }
            else if (relativeX < (third * 2)) { mSelectedBoat = "C1"; }
            else { mSelectedBoat = "C2"; }
            Storage.setValue("kajoSelectedBoat", mSelectedBoat);
            WatchUi.requestUpdate();
            return;
        }

        if (y >= mStartTop && y <= mStartBottom) {
            startActivity();
            return;
        }

        // Vier Menuepunkte als 2x2-Raster: Touch-Zonen entsprechen exakt den Karten.
        if (y >= mFreeTop && y <= mFreeBottom && x >= 48 && x <= 342) {
            var row = y < 278 ? 0 : 1;
            var column = x < (mWidth / 2) ? 0 : 1;
            var item = (row * 2) + column;
            if (item == 0) {
                openActivityView(null);
            } else if (item == 1) {
                var listView = new KajoConnectWorkoutListView(self);
                WatchUi.pushView(listView, new KajoConnectWorkoutListDelegate(listView), WatchUi.SLIDE_UP);
            } else if (item == 2) {
                WatchUi.showToast("Trainingshistorie ist noch nicht verfuegbar", null);
            } else if (item == 3) {
                var menuView = new KajoConnectMenuView(self);
                WatchUi.pushView(menuView, new KajoConnectMenuViewDelegate(menuView), WatchUi.SLIDE_UP);
            }
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth < mHeight ? mWidth : mHeight;
        mKajoLayout.configure(mWidth, mHeight);
        var cx = mWidth / 2;
        var todaySessions = getTodaysSessions();

        // Kopfbereich
        dc.setColor(0x00D8CC, Graphics.COLOR_BLACK);
        dc.drawArc(cx - 38, 53, mUnit * 0.035, Graphics.ARC_CLOCKWISE, 205, 325);
        dc.drawLine(cx - 50, 56, cx - 28, 47);
        drawHomeText(dc, cx + 12, 40, 112, 26, "KAJO",
            Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawHomeText(dc, cx, 70, 220, 15, "SPORTART: " + mSelectedBoat + " · WILDWASSER",
            Graphics.FONT_XTINY, 0xAAB7BD);
        drawHomeText(dc, cx, 87, 220, 14, compactSyncStatus(),
            Graphics.FONT_XTINY, mSyncStatus == "KAJO AKTUALISIERT" ? 0x00D8CC : 0x82939A);

        dc.setColor(0x42545A, Graphics.COLOR_BLACK);
        dc.drawLine(78, 108, 312, 108);
        drawHomeText(dc, cx, 113, 230, 18, "TRAINING FUER HEUTE",
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        // Eine kompakte Trainingskarte mit drei strikt getrennten Textzeilen.
        mStartTop = 135;
        mStartBottom = 204;
        var heroName = "KEIN TRAINING GEPLANT";
        var heroDetail = "Freies Training starten";
        var heroMeta = "TIPPE ZUM STARTEN";
        if (todaySessions.size() == 1) {
            var todayWorkout = todaySessions[0] as Lang.Dictionary;
            heroName = todayWorkout["name"] == null
                ? "GEPLANTES TRAINING" : todayWorkout["name"].toString();
            var duration = todayWorkout["duration"] == null ? "" : todayWorkout["duration"].toString();
            var type = todayWorkout["type"] == null ? "Training" : todayWorkout["type"].toString();
            heroDetail = duration == "" ? type : duration + " MIN · " + type;
            heroMeta = "GEPLANTE EINHEIT · STARTEN";
        } else if (todaySessions.size() > 1) {
            heroName = todaySessions.size().toString() + " EINHEITEN HEUTE";
            heroDetail = "Training auswaehlen";
            heroMeta = "TAGESPLAN";
        }

        var heroWidth = mKajoLayout.safeRectWidth(mStartTop, mStartBottom - mStartTop, mUnit * 0.76);
        var heroLeft = cx - (heroWidth / 2);
        dc.setColor(0x07191D, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(heroLeft.toNumber(), mStartTop, heroWidth.toNumber(), 69, 17);
        dc.setColor(0x00D8CC, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(heroLeft.toNumber(), mStartTop, heroWidth.toNumber(), 69, 17);
        drawHomeText(dc, cx, 145, (heroWidth * 0.82).toNumber(), 19,
            heroName, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawHomeText(dc, cx, 167, (heroWidth * 0.82).toNumber(), 15,
            heroDetail, Graphics.FONT_XTINY, 0xAAB7BD);
        drawHomeText(dc, cx, 185, (heroWidth * 0.82).toNumber(), 13,
            heroMeta, Graphics.FONT_XTINY, 0x00D8CC);

        drawHomeText(dc, cx, 211, 180, 18, "MENUE",
            Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        // 2x2 Raster statt vier untereinanderliegender Zeilen.
        // Alle Karten enden deutlich vor dem unteren Rand des runden Displays.
        var labels = ["FREIES TRAINING", "TRAININGSPLAN", "HISTORIE", "EINSTELLUNGEN"];
        var icons = ["F", "P", "H", "E"];
        var cardWidth = 136;
        var cardHeight = 44;
        var leftCenter = cx - 73;
        var rightCenter = cx + 73;
        var topRow = 232;
        var bottomRow = 282;
        mFreeTop = 228;
        mFreeBottom = 332;

        for (var item = 0; item < 4; item += 1) {
            var cardX = item % 2 == 0 ? leftCenter : rightCenter;
            var cardY = item < 2 ? topRow : bottomRow;
            var cardLeft = cardX - (cardWidth / 2);
            var safeWidth = mKajoLayout.safeRectWidthAt(cardX, cardY, cardHeight, cardWidth);
            cardLeft = cardX - (safeWidth / 2);

            dc.setColor(0x0A171B, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardLeft.toNumber(), cardY, safeWidth.toNumber(), cardHeight, 13);
            dc.setColor(0x294047, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardLeft.toNumber(), cardY, safeWidth.toNumber(), cardHeight, 13);
            dc.setColor(0x12383B, Graphics.COLOR_BLACK);
            dc.fillCircle((cardLeft + 17).toNumber(), cardY + 22, 9);
            drawHomeText(dc, cardLeft + 17, cardY + 14, 18, 16, icons[item],
                Graphics.FONT_XTINY, 0x00D8CC);
            drawHomeText(dc, cardX + 9, cardY + 14, safeWidth - 34, 16,
                labels[item], Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        }
    }

}
