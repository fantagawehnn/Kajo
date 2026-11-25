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
        } else if (y >= 350) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
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

    function drawCentered(dc as Dc, x, y, text as Lang.String,
        maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function onUpdate(dc as Dc) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var center = width / 2;
        var contentWidth = unit * 0.78;

        var name = valueText("name", "Geplante Einheit");
        var boatClass = valueText("discipline", "KANU");
        var category = valueText("category", "");
        var raceFormat = valueText("raceFormat", "");
        var duration = valueText("duration", "");
        var intensity = valueText("intensity", "");
        var objective = valueText("objective", "");
        var isStandard = mWorkout["isStandardWorkout"] == true;
        var stepsValue = mWorkout["steps"];
        var stepCount = stepsValue == null ? 0 : stepsValue.size();

        // Kopfbereich: Art der Einheit, Name und die wichtigsten Eckdaten.
        drawCentered(dc, center, unit * 0.045,
            isStandard ? "STANDARDTRAINING" : "GEPLANTE EINHEIT",
            contentWidth, Graphics.FONT_SMALL, 0x25D3CB);
        drawCentered(dc, center, unit * 0.095, compactText(name, 38),
            contentWidth, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        var metadata = boatClass;
        if (raceFormat != "") { metadata += " · " + raceFormat; }
        if (category != "") { metadata += " · " + category; }
        drawCentered(dc, center, unit * 0.155, metadata,
            contentWidth, Graphics.FONT_XTINY, 0x98A5AB);

        var durationText = duration == "" ? "DAUER –" : duration + " MIN";
        var stepsText = stepCount.toString() + " ABSCHNITTE";
        drawCentered(dc, center - unit * 0.17, unit * 0.205,
            durationText, unit * 0.30, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, center + unit * 0.17, unit * 0.205,
            stepsText, unit * 0.30, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        if (intensity != "") {
            drawCentered(dc, center, unit * 0.255,
                "INTENSITÄT · " + compactText(intensity, 42),
                contentWidth, Graphics.FONT_XTINY, 0xD7DEE2);
        }

        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(
            (center - contentWidth / 2).toNumber(),
            (unit * 0.295).toNumber(),
            (center + contentWidth / 2).toNumber(),
            (unit * 0.295).toNumber()
        );

        if (objective != "") {
            drawCentered(dc, center, unit * 0.315, "TRAININGSZIEL",
                contentWidth, Graphics.FONT_XTINY, 0x25D3CB);
            drawCentered(dc, center, unit * 0.355,
                compactText(objective, 52), contentWidth,
                Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        } else {
            drawCentered(dc, center, unit * 0.335, "TRAININGSABLAUF",
                contentWidth, Graphics.FONT_XTINY, 0x25D3CB);
        }

        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(
            (center - contentWidth / 2).toNumber(),
            (unit * 0.405).toNumber(),
            (center + contentWidth / 2).toNumber(),
            (unit * 0.405).toNumber()
        );

        if (objective != "") {
            drawCentered(dc, center, unit * 0.425, "ABLAUF",
                contentWidth, Graphics.FONT_XTINY, 0x25D3CB);
        }

        var summary = [];
        if (stepCount > 0) {
            var shownSteps = stepCount < 4 ? stepCount : 4;
            for (var i = 0; i < shownSteps; i += 1) {
                var step = stepsValue.get(i) as Lang.Dictionary;
                var label = step["label"] == null
                    ? "Trainingsabschnitt"
                    : step["label"].toString();
                var seconds = step["durationSeconds"];
                var suffix = "";
                if (seconds != null) {
                    var minutes = Math.floor((seconds as Lang.Number) / 60);
                    suffix = " · " + minutes.toString() + " MIN";
                }
                summary.add((i + 1).toString() + ". " +
                    compactText(label, 27) + suffix);
            }
        } else {
            var warmup = valueText("warmup", "");
            var mainSet = valueText("mainSet", "");
            var cooldown = valueText("cooldown", "");
            if (warmup != "") { summary.add("EINWÄRMEN · " + warmup); }
            if (mainSet != "") { summary.add("HAUPTTEIL · " + mainSet); }
            if (cooldown != "") { summary.add("AUSFAHREN · " + cooldown); }
            if (summary.size() == 0) {
                var desc = valueText("desc", "Keine weiteren Angaben hinterlegt");
                summary.add(desc);
            }
        }

        var y = unit * 0.475;
        var shown = summary.size() < 4 ? summary.size() : 4;
        for (var j = 0; j < shown; j += 1) {
            drawCentered(dc, center, y, compactText(summary[j], 50),
                contentWidth, Graphics.FONT_XTINY,
                j == 0 ? Graphics.COLOR_WHITE : 0x98A5AB);
            y += unit * 0.052;
        }

        // Die Startfläche liegt in einem eigenen, gut antippbaren Bereich.
        mStartTop = (unit * 0.78).toNumber();
        mStartBottom = (unit * 0.89).toNumber();
        var buttonWidth = mKajoLayout.safeRectWidth(
            mStartTop, mStartBottom - mStartTop, unit * 0.78
        );
        var buttonLeft = center - (buttonWidth / 2);
        dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(
            buttonLeft.toNumber(), mStartTop,
            buttonWidth.toNumber(), (mStartBottom - mStartTop).toNumber(), 8
        );
        drawCentered(dc, center, unit * 0.805, "TRAINING STARTEN",
            buttonWidth - 16, Graphics.FONT_SMALL, Graphics.COLOR_BLACK);
        drawCentered(dc, center, unit * 0.92, "ZURÜCK",
            contentWidth, Graphics.FONT_XTINY, 0x98A5AB);
    }
}
