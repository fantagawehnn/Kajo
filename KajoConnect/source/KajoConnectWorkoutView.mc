import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class KajoConnectWorkoutView extends WatchUi.View {

    var mKajoLayout as KajoLayout;
    var mWorkout as Lang.Dictionary;
    var mParent as KajoConnectView;
    var mStartTop as Lang.Number = 0;
    var mStartBottom as Lang.Number = 0;

    function initialize(workout as Lang.Dictionary, parent as KajoConnectView) {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mWorkout = workout;
        mParent = parent;
    }

    function startSelectedWorkout() as Void {
        mParent.beginWorkout(mWorkout);
    }

    function handleTap(x as Lang.Number, y as Lang.Number) as Void {
        if (y >= mStartTop && y <= mStartBottom) {
            startSelectedWorkout();
        }
    }

    function valueText(key as Lang.String, fallback as Lang.String) as Lang.String {
        var value = mWorkout[key];
        return value == null ? fallback : value.toString();
    }

    function compactText(value as Lang.String, maxLength as Lang.Number) as Lang.String {
        if (value.length() <= maxLength) { return value; }
        if (maxLength <= 3) { return value.substring(0, maxLength); }
        return value.substring(0, maxLength - 3) + "...";
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function onUpdate(dc as Dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
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
        var stepsValue = mWorkout["steps"];
        var stepCount = stepsValue == null ? 0 : stepsValue.size();
        var warmup = valueText("warmup", "");
        var mainSet = valueText("mainSet", "");
        var cooldown = valueText("cooldown", "");

        drawCentered(dc, center, unit * 0.075, "BEREIT",
            contentWidth, Graphics.FONT_SMALL, 0x25D3CB);
        drawCentered(dc, center, unit * 0.14, compactText(name, 34),
            contentWidth, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, center, unit * 0.20, type,
            contentWidth, Graphics.FONT_XTINY, 0x98A5AB);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(70, unit * 0.26, 320, unit * 0.26);

        drawCentered(dc, center - unit * 0.17, unit * 0.30, "DAUER",
            unit * 0.28, Graphics.FONT_XTINY, 0x98A5AB);
        drawCentered(dc, center - unit * 0.17, unit * 0.35,
            duration == "" ? "–" : duration + " MIN",
            unit * 0.32, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, center + unit * 0.17, unit * 0.30, "ABSCHNITTE",
            unit * 0.28, Graphics.FONT_XTINY, 0x98A5AB);
        drawCentered(dc, center + unit * 0.17, unit * 0.35,
            stepCount.toString(), unit * 0.25, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(70, unit * 0.43, 320, unit * 0.43);
        drawCentered(dc, center, unit * 0.46, "ABLAUF",
            contentWidth, Graphics.FONT_XTINY, 0x25D3CB);

        var summary = [];
        if (warmup != "") { summary.add("EINWÄRMEN · " + warmup); }
        if (mainSet != "") { summary.add("HAUPTTEIL · " + mainSet); }
        if (cooldown != "") { summary.add("AUSFAHREN · " + cooldown); }

        if (stepCount > 0) {
            var shownSteps = stepCount < 4 ? stepCount : 4;
            for (var i = 0; i < shownSteps; i += 1) {
                var step = stepsValue.get(i) as Lang.Dictionary;
                var label = step["label"] == null ? "Trainingsabschnitt" : step["label"].toString();
                var seconds = step["durationSeconds"];
                var suffix = "";
                if (seconds != null) {
                    var minutes = Math.floor((seconds as Lang.Number) / 60);
                    suffix = " · " + minutes.toString() + " MIN";
                }
                summary.add((i + 1).toString() + ". " + compactText(label, 26) + suffix);
            }
        }
        var y = unit * 0.52;
        var shown = summary.size() < 4 ? summary.size() : 4;
        for (var j = 0; j < shown; j += 1) {
            drawCentered(dc, center, y, compactText(summary[j], 48),
                contentWidth, Graphics.FONT_XTINY, j == 0 ? Graphics.COLOR_WHITE : 0x98A5AB);
            y += unit * 0.055;
        }
        if (summary.size() == 0) {
            var desc = valueText("desc", "Keine weiteren Angaben hinterlegt");
            drawCentered(dc, center, y, compactText(desc, 48),
                contentWidth, Graphics.FONT_XTINY, 0x98A5AB);
        }

        mStartTop = unit * 0.78;
        mStartBottom = unit * 0.89;
        var buttonWidth = mKajoLayout.safeRectWidth(mStartTop, mStartBottom - mStartTop, unit * 0.78);
        var buttonLeft = center - (buttonWidth / 2);
        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.fillRectangle(buttonLeft.toNumber(), mStartTop, buttonWidth.toNumber(),
            (mStartBottom - mStartTop).toNumber());
        drawCentered(dc, center, unit * 0.805, "TRAINING STARTEN",
            buttonWidth - 16, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
        drawCentered(dc, center, unit * 0.92, "ZURÜCK",
            contentWidth, Graphics.FONT_XTINY, 0x98A5AB);
    }
}