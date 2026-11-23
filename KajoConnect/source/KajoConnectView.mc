import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectView extends WatchUi.View {

    var mSelectedBoat = "K1";
    var mPlannedSessions as Lang.Array<Lang.String> = [];

    var mWidth = 0;
    var mHeight = 0;

    var mBoatTop = 0;
    var mBoatBottom = 0;
    var mStartTop = 0;
    var mStartBottom = 0;

    var mPlanStartY = 0;
    var mPlanRowHeight = 0;
    var mPlanStartIndex = 0;

    function initialize() {
        View.initialize();
    }

    function fitLabel(dc, text, font, maxWidth) {
        var result = text;

        while (result.length() > 3 &&
               dc.getTextWidthInPixels(result, font) > maxWidth) {

            var candidate = result.substring(0, result.length() - 1) + "..";

            if (dc.getTextWidthInPixels(candidate, font) > maxWidth) {
                result = result.substring(0, result.length() - 1);
            } else {
                result = candidate;
                break;
            }
        }

        return result;
    }

    function setPlannedSessions(sessions) {
        mPlannedSessions = sessions;
        mPlanStartIndex = 0;
        WatchUi.requestUpdate();
    }

    function scrollPlan(direction) {

        var count = mPlannedSessions.size();

        if (count <= 2) {
            return;
        }

        mPlanStartIndex += direction;

        if (mPlanStartIndex < 0) {
            mPlanStartIndex = 0;
        }

        if (mPlanStartIndex > count - 2) {
            mPlanStartIndex = count - 2;
        }

        WatchUi.requestUpdate();
    }

    function handleTap(x, y) {

        // Trainingseinheit auswählen
        if (mPlannedSessions.size() > 0 &&
            y >= mPlanStartY &&
            y < mPlanStartY + (mPlanRowHeight * 2)) {

            var row = 0;

            if (y >= mPlanStartY + mPlanRowHeight) {
                row = 1;
            }

            var index = mPlanStartIndex + row;

            if (index < mPlannedSessions.size()) {
                var selectedSession = mPlannedSessions[index] as String;
                var workoutView = new KajoConnectWorkoutView(selectedSession);
                WatchUi.pushView(
                    workoutView,
                    new KajoConnectWorkoutDelegate(),
                    WatchUi.SLIDE_UP
                );

                return;
            }
        }

        // Aktivität vorbereiten und öffnen
        if (y >= mStartTop && y <= mStartBottom) {
            var activityView = new KajoConnectActivityView(mSelectedBoat);
            WatchUi.pushView(
                activityView,
                new KajoConnectActivityDelegate(activityView),
                WatchUi.SLIDE_UP
            );
            return;
        }

        // Bootsauswahl
        if (y >= mBoatTop &&
            y <= mBoatBottom &&
            x >= mWidth * 0.20 &&
            x <= mWidth * 0.80) {

            if (x < mWidth * 0.40) {
                mSelectedBoat = "K1";
            } else if (x < mWidth * 0.60) {
                mSelectedBoat = "C1";
            } else {
                mSelectedBoat = "C2";
            }

            WatchUi.requestUpdate();

            WatchUi.showToast(
                mSelectedBoat + " ausgewählt",
                null
            );
        }
    }

    function onUpdate(dc as Dc) {

        dc.clear();

        mWidth = dc.getWidth();
        mHeight = dc.getHeight();

        var centerX = mWidth / 2;

        var fontTiny = Graphics.FONT_XTINY;
        var fontSmall = Graphics.FONT_TINY;

        // HEADER
        dc.setColor(
            Graphics.COLOR_WHITE,
            Graphics.COLOR_BLACK
        );

        dc.drawText(
            centerX,
            mHeight * 0.10,
            Graphics.FONT_SMALL,
            "KAJO",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(
            Graphics.COLOR_LT_GRAY,
            Graphics.COLOR_BLACK
        );

        dc.drawText(
            centerX,
            mHeight * 0.19,
            fontTiny,
            "HEUTE",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // TRAININGSPLAN
        var sessionCount = mPlannedSessions.size();

        var activityY = mHeight * 0.43;

        if (sessionCount > 0) {

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );

            dc.drawText(
                centerX,
                mHeight * 0.26,
                fontTiny,
                "TRAININGSPLAN",
                Graphics.TEXT_JUSTIFY_CENTER
            );

            mPlanStartY = mHeight * 0.32;
            mPlanRowHeight = mHeight * 0.085;

            var visibleCount = 2;

            if (sessionCount == 1) {
                visibleCount = 1;
            }

            for (var i = 0; i < visibleCount; i += 1) {

                var index = mPlanStartIndex + i;

                if (index < sessionCount) {

                    var rowY = mPlanStartY +
                        (i * mPlanRowHeight);

                    var cardX = mWidth * 0.20;
                    var cardWidth = mWidth * 0.60;
                    var cardHeight = mHeight * 0.075;

                    dc.setColor(
                        Graphics.COLOR_DK_GRAY,
                        Graphics.COLOR_BLACK
                    );

                    dc.fillRoundedRectangle(
                        cardX,
                        rowY,
                        cardWidth,
                        cardHeight,
                        7
                    );

                    dc.setColor(
                        Graphics.COLOR_WHITE,
                        Graphics.COLOR_DK_GRAY
                    );

                    var sessionText = fitLabel(
                        dc,
                        mPlannedSessions[index] as String,
                        fontSmall,
                        cardWidth - 16
                    );

                    var textY = rowY +
                        (cardHeight - dc.getFontHeight(fontSmall)) / 2;

                    dc.drawText(
                        centerX,
                        textY,
                        fontSmall,
                        sessionText,
                        Graphics.TEXT_JUSTIFY_CENTER
                    );
                }
            }

            if (sessionCount > 2) {

                dc.setColor(
                    Graphics.COLOR_LT_GRAY,
                    Graphics.COLOR_BLACK
                );

                dc.drawText(
                    centerX,
                    mPlanStartY + (2 * mPlanRowHeight),
                    fontTiny,
                    "WISCHEN FÜR WEITERE",
                    Graphics.TEXT_JUSTIFY_CENTER
                );
            }

            if (sessionCount == 1) {
                activityY = mHeight * 0.53;
            } else {
                activityY = mHeight * 0.59;
            }
        }

        // AKTIVITÄT STARTEN
        dc.setColor(
            Graphics.COLOR_WHITE,
            Graphics.COLOR_BLACK
        );

        dc.drawText(
            centerX,
            activityY,
            fontTiny,
            "AKTIVITÄT STARTEN",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        var buttonY = activityY + (mHeight * 0.07);
        var buttonHeight = mHeight * 0.075;
        var buttonWidth = mWidth * 0.19;

        mBoatTop = buttonY;
        mBoatBottom = buttonY + buttonHeight;

        var boatTextY = buttonY +
            (buttonHeight - dc.getFontHeight(fontSmall)) / 2;

        // K1
        var k1CenterX = mWidth * 0.30;
        var k1X = k1CenterX - (buttonWidth / 2);

        if (mSelectedBoat == "K1") {

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );

            dc.fillRoundedRectangle(
                k1X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_BLACK,
                Graphics.COLOR_WHITE
            );

        } else {

            dc.setColor(
                Graphics.COLOR_LT_GRAY,
                Graphics.COLOR_BLACK
            );

            dc.drawRoundedRectangle(
                k1X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );
        }

        dc.drawText(
            k1CenterX,
            boatTextY,
            fontSmall,
            "K1",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // C1
        var c1CenterX = mWidth * 0.50;
        var c1X = c1CenterX - (buttonWidth / 2);

        if (mSelectedBoat == "C1") {

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );

            dc.fillRoundedRectangle(
                c1X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_BLACK,
                Graphics.COLOR_WHITE
            );

        } else {

            dc.setColor(
                Graphics.COLOR_LT_GRAY,
                Graphics.COLOR_BLACK
            );

            dc.drawRoundedRectangle(
                c1X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );
        }

        dc.drawText(
            c1CenterX,
            boatTextY,
            fontSmall,
            "C1",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // C2
        var c2CenterX = mWidth * 0.70;
        var c2X = c2CenterX - (buttonWidth / 2);

        if (mSelectedBoat == "C2") {

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );

            dc.fillRoundedRectangle(
                c2X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_BLACK,
                Graphics.COLOR_WHITE
            );

        } else {

            dc.setColor(
                Graphics.COLOR_LT_GRAY,
                Graphics.COLOR_BLACK
            );

            dc.drawRoundedRectangle(
                c2X,
                buttonY,
                buttonWidth,
                buttonHeight,
                7
            );

            dc.setColor(
                Graphics.COLOR_WHITE,
                Graphics.COLOR_BLACK
            );
        }

        dc.drawText(
            c2CenterX,
            boatTextY,
            fontSmall,
            "C2",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // START-BUTTON
        mStartTop = mHeight * 0.77;
        mStartBottom = mHeight * 0.86;
        var startX = mWidth * 0.25;
        var startWidth = mWidth * 0.50;
        var startHeight = mStartBottom - mStartTop;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(startX, mStartTop, startWidth, startHeight, 10);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        dc.drawText(
            centerX,
            mStartTop + (startHeight - dc.getFontHeight(fontSmall)) / 2,
            fontSmall,
            "STARTEN",
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // MENÜ-HINWEIS
        dc.setColor(
            Graphics.COLOR_LT_GRAY,
            Graphics.COLOR_BLACK
        );

        dc.drawText(
            centerX,
            mHeight * 0.87,
            fontTiny,
            "MENÜ",
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }
}