import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mSelectedBoat = "K1";
    var mPlannedSessions as Lang.Array<Lang.String> = [];
    var mWidth = 0;
    var mHeight = 0;
    var mUnit = 0;
    var mBoatTop = 0;
    var mBoatBottom = 0;
    var mBoatLeft = 0;
    var mBoatRight = 0;
    var mStartTop = 0;
    var mStartBottom = 0;
    var mMenuTop = 0;
    var mMenuBottom = 0;
    var mPlanStartY = 0;
    var mPlanRowHeight = 0;
    var mPlanStartIndex = 0;

    function initialize() {
        View.initialize();
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_SMALL;
        }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_TINY;
        }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) {
            font = Graphics.FONT_XTINY;
        }
        return font;
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth, preferredFont);
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(y).toNumber(), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function setPlannedSessions(sessions) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {
        var count = mPlannedSessions.size();
        if (count <= 2) { return; }
        mPlanStartIndex += direction;
        if (mPlanStartIndex < 0) { mPlanStartIndex = 0; }
        if (mPlanStartIndex > count - 2) { mPlanStartIndex = count - 2; }
        WatchUi.requestUpdate();
    }

    function handleTap(x as Lang.Number, y as Lang.Number) {
        // Die sichtbare MENUE-Beschriftung ist direkt antippbar.
        if (y >= mMenuTop && y <= mMenuBottom) {
            WatchUi.pushView(
                new Rez.Menus.MainMenu(),
                new KajoConnectMenuDelegate(),
                WatchUi.SLIDE_UP
            );
            return;
        }

        if (mPlannedSessions.size() > 0 &&
            y >= mPlanStartY &&
            y < mPlanStartY + (mPlanRowHeight * 2)) {
            var row = 0;
            if (y >= mPlanStartY + mPlanRowHeight) { row = 1; }
            var index = mPlanStartIndex + row;
            if (index < mPlannedSessions.size()) {
                var selectedSession = mPlannedSessions[index] as String;
                WatchUi.pushView(
                    new KajoConnectWorkoutView(selectedSession),
                    new KajoConnectWorkoutDelegate(),
                    WatchUi.SLIDE_UP
                );
                return;
            }
        }

        if (y >= mStartTop && y <= mStartBottom) {
            var activityView = new KajoConnectActivityView(mSelectedBoat);
            WatchUi.pushView(
                activityView,
                new KajoConnectActivityDelegate(activityView),
                WatchUi.SLIDE_UP
            );
            return;
        }

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
            WatchUi.showToast(mSelectedBoat + " ausgewaehlt", null);
        }
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        mWidth = dc.getWidth();
        mHeight = dc.getHeight();
        mUnit = mWidth;
        if (mHeight < mUnit) { mUnit = mHeight; }

        var cx = mWidth / 2;
        var cy = mHeight / 2;
        var scale = mUnit;

        // Die Inhalte bleiben in der zentralen, kreisförmig sicheren Displayzone.
        drawCentered(dc, cx, scale * 0.105, "KAJO", scale * 0.72, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        drawCentered(dc, cx, scale * 0.185, "HEUTE", scale * 0.68, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);

        var sessionCount = mPlannedSessions.size();
        var activityLabelY = scale * 0.49;

        if (sessionCount > 0) {
            drawCentered(dc, cx, scale * 0.245, "TRAININGSPLAN", scale * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            mPlanStartY = scale * 0.285;
            mPlanRowHeight = scale * 0.092;

            var visibleCount = 2;
            if (sessionCount == 1) { visibleCount = 1; }

            for (var i = 0; i < visibleCount; i += 1) {
                var index = mPlanStartIndex + i;
                if (index < sessionCount) {
                    var rowY = mPlanStartY + (i * mPlanRowHeight);
                    var cardWidth = scale * 0.66;
                    var cardHeight = scale * 0.075;
                    var cardX = cx - (cardWidth / 2);
                    dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
                    dc.fillRoundedRectangle(Math.round(cardX).toNumber(), Math.round(rowY).toNumber(), Math.round(cardWidth).toNumber(), Math.round(cardHeight).toNumber(), Math.round(scale * 0.025).toNumber());
                    var sessionText = mPlannedSessions[index] as String;
                    drawCentered(
                        dc, cx,
                        rowY + (cardHeight - dc.getFontHeight(Graphics.FONT_TINY)) / 2,
                        sessionText,
                        cardWidth - (scale * 0.08),
                        Graphics.FONT_SMALL,
                        Graphics.COLOR_WHITE
                    );
                }
            }

            if (sessionCount > 2) {
                drawCentered(dc, cx, mPlanStartY + (2 * mPlanRowHeight),
                    "WEITERE EINHEITEN: WISCHEN", scale * 0.72,
                    Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
            if (sessionCount == 1) {
                activityLabelY = scale * 0.49;
            } else {
                activityLabelY = scale * 0.515;
            }
        } else {
            drawCentered(dc, cx, scale * 0.30, "DEIN TRAINING", scale * 0.70, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, cx, scale * 0.36, "Noch keine Einheit angezeigt", scale * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        drawCentered(dc, cx, activityLabelY, "AKTIVITAET STARTEN", scale * 0.76, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        // Drei große, gleich breite Auswahlflächen mit ausreichend Abstand.
        var buttonGap = scale * 0.025;
        var buttonWidth = scale * 0.24;
        var buttonHeight = scale * 0.13;
        var totalWidth = (buttonWidth * 3) + (buttonGap * 2);
        var left = cx - (totalWidth / 2);
        var buttonY = scale * 0.575;

        mBoatTop = buttonY;
        mBoatBottom = buttonY + buttonHeight;
        mBoatLeft = left;
        mBoatRight = left + totalWidth;

        var labels = ["K1", "C1", "C2"];
        for (var b = 0; b < 3; b += 1) {
            var bx = left + (b * (buttonWidth + buttonGap));
            var selected = (labels[b] == mSelectedBoat);

            if (selected) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle(Math.round(bx).toNumber(), Math.round(buttonY).toNumber(), Math.round(buttonWidth).toNumber(), Math.round(buttonHeight).toNumber(), Math.round(scale * 0.035).toNumber());
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);
            } else {
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
                dc.drawRoundedRectangle(Math.round(bx), Math.round(buttonY), Math.round(buttonWidth), Math.round(buttonHeight), Math.round(scale * 0.035));
                drawCentered(dc, bx + buttonWidth / 2,
                    buttonY + (buttonHeight - dc.getFontHeight(Graphics.FONT_MEDIUM)) / 2,
                    labels[b], buttonWidth * 0.82, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            }
        }

        // Start-Schaltfläche liegt oberhalb des unteren Kreisrandes.
        var startWidth = scale * 0.60;
        var startHeight = scale * 0.095;
        var startX = cx - (startWidth / 2);
        mStartTop = scale * 0.755;
        mStartBottom = mStartTop + startHeight;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(Math.round(startX).toNumber(), Math.round(mStartTop).toNumber(), Math.round(startWidth).toNumber(), Math.round(startHeight).toNumber(), Math.round(scale * 0.04).toNumber());
        drawCentered(dc, cx,
            mStartTop + (startHeight - dc.getFontHeight(Graphics.FONT_SMALL)) / 2,
            "STARTEN", startWidth * 0.85, Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK);

        mMenuTop = scale * 0.875;
        mMenuBottom = scale * 0.985;
        drawCentered(dc, cx, scale * 0.91, "MENUE", scale * 0.50, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
    }
}
