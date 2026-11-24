import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    var mWorkout as Lang.Dictionary;
    var mParent as KajoConnectView;

    function initialize(workout as Lang.Dictionary, parent as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mWorkout = workout;
        mParent = parent;
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y >= mStartTop && y <= mStartBottom) {
            mParent.beginWorkout(mWorkout);
        } else {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }

    var mStartTop as Lang.Number = 0;
    var mStartBottom as Lang.Number = 0;

    function valueText(key as Lang.String, fallback as Lang.String) as Lang.String {
        var value = mWorkout[key];
        if (value == null) {
            return fallback;
        }
        return value.toString();
    }

    function compactText(value as Lang.String, maxLength as Lang.Number) as Lang.String {
        if (value.length() <= maxLength) {
            return value;
        }
        if (maxLength <= 3) {
            return value.substring(0, maxLength);
        }
        return value.substring(0, maxLength - 3) + "...";
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function drawSectionLabel(dc as Dc, x, y, text as Lang.String, maxWidth) as Void {
        drawCentered(dc, x, y, text, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var center = width / 2;
        var contentWidth = unit * 0.78;

        var name = valueText("name", "Geplante Einheit");
        var type = valueText("type", "Training");
        var duration = valueText("duration", "");
        var targetLoad = valueText("targetTss", "");
        var stepsValue = mWorkout["steps"];
        var stepCount = stepsValue == null ? 0 : stepsValue.size();
        var target = "";
        if (stepCount > 0) {
            var firstStep = stepsValue.get(0) as Lang.Dictionary;
            if (firstStep["target"] != null) { target = firstStep["target"].toString(); }
        }
        if (target.length() == 0 && mWorkout["intensity"] != null) {
            target = mWorkout["intensity"].toString();
        }

        drawCentered(dc, center, unit * 0.075, "TRAININGSDETAILS",
            contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        // Datum wird nicht mehr als zweite Kopfzeile ausgegeben.

        var cardTop = unit * 0.19;
        var cardHeight = unit * 0.15;
        var cardWidth = mKajoLayout.safeRectWidth(cardTop, cardHeight, unit * 0.78);
        var cardLeft = center - (cardWidth / 2);
        dc.setColor(0x07191D, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(cardLeft.toNumber(), cardTop.toNumber(),
            cardWidth.toNumber(), cardHeight.toNumber(), (unit * 0.035).toNumber());
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle((cardLeft + unit * 0.018).toNumber(),
            (cardTop + unit * 0.025).toNumber(), (unit * 0.01).toNumber(),
            (cardHeight - unit * 0.05).toNumber(), (unit * 0.004).toNumber());
        drawCentered(dc, center, cardTop + unit * 0.035, compactText(name, 36),
            cardWidth * 0.86, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, center, cardTop + unit * 0.095, compactText(type, 28),
            cardWidth * 0.86, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var statY = unit * 0.385;
        var statLabels = ["DAUER", "SCHRITTE", "ZIEL"];
        var statValues = [
            duration.length() > 0 ? duration + " MIN" : "--",
            stepCount > 0 ? stepCount.toString() : "--",
            target.length() > 0 ? compactText(target, 13) : (targetLoad.length() > 0 ? targetLoad : "--")
        ];
        var statCenters = [center - unit * 0.22, center, center + unit * 0.22];
        for (var c = 0; c < 3; c += 1) {
            drawCentered(dc, statCenters[c], statY, statLabels[c],
                unit * 0.20, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, statCenters[c], statY + unit * 0.045, statValues[c],
                unit * 0.22, Graphics.FONT_SMALL, c == 2 ? 0x00E5CC : Graphics.COLOR_WHITE);
        }

        drawCentered(dc, center, unit * 0.51, "ABLAUF",
            contentWidth, Graphics.FONT_XTINY, 0x00E5CC);
        var shownSteps = stepCount < 3 ? stepCount : 3;
        var y = unit * 0.555;
        for (var i = 0; i < shownSteps; i += 1) {
            var step = stepsValue.get(i) as Lang.Dictionary;
            var stepLabel = step["label"] == null ? "Trainingsschritt" : step["label"].toString();
            var stepDuration = step["durationSeconds"] == null ? "" : step["durationSeconds"].toString();
            var minutes = "";
            if (stepDuration.length() > 0) {
                var seconds = step["durationSeconds"] as Lang.Number;
                minutes = Math.floor(seconds / 60).toString() + " MIN";
            }
            var line = compactText(stepLabel, 22);
            if (minutes.length() > 0) { line += "  /  " + minutes; }
            drawCentered(dc, center, y, line, contentWidth,
                Graphics.FONT_TINY, i == 0 ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY);
            y += unit * 0.052;
        }
        if (stepCount > 3) {
            drawCentered(dc, center, y, "+ " + (stepCount - 3).toString() + " WEITERE",
                contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else if (stepCount == 0) {
            var mainSet = valueText("mainSet", "");
            var description = valueText("desc", "");
            var detailText = mainSet.length() > 0 ? mainSet : description;
            drawCentered(dc, center, unit * 0.585,
                detailText.length() > 0 ? compactText(detailText, 52) : "Keine Schrittfolge hinterlegt",
                contentWidth, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
        }

        mStartTop = (unit * 0.775).toNumber();
        mStartBottom = (unit * 0.865).toNumber();
        var startHeight = mStartBottom - mStartTop;
        var startWidth = mKajoLayout.safeRectWidth(mStartTop, startHeight, unit * 0.68);
        var startLeft = center - (startWidth / 2);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(startLeft.toNumber(), mStartTop.toNumber(),
            startWidth.toNumber(), startHeight.toNumber(), (unit * 0.03).toNumber());
        drawCentered(dc, center, unit * 0.795, "TRAINING STARTEN",
            startWidth * 0.88, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
        drawCentered(dc, center, unit * 0.89, "ZURUECK",
            unit * 0.48, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
