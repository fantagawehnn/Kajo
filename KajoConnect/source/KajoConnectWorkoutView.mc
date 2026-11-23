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
        // Erst die tatsaechliche vertikale Textposition innerhalb des runden
        // Displays bestimmen, danach die dort verfuegbare Kreisbreite messen.
        var font = mKajoLayout.fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        var safeY = mKajoLayout.safeTextY(y.toNumber(), dc.getFontHeight(font));
        var safeWidth = mKajoLayout.safeTextWidth(dc, x.toNumber(), safeY, font, maxWidth.toNumber());

        // Falls die Kreisform weniger Platz bietet, Schrift weiter verkleinern.
        var fittedFont = mKajoLayout.fitFont(dc, text, safeWidth, preferredFont);
        if (fittedFont != font) {
            font = fittedFont;
            safeY = mKajoLayout.safeTextY(y.toNumber(), dc.getFontHeight(font));
            safeWidth = mKajoLayout.safeTextWidth(dc, x.toNumber(), safeY, font, maxWidth.toNumber());
        }

        var displayText = text;
        while (displayText.length() > 0 && dc.getTextWidthInPixels(displayText, font) > safeWidth) {
            if (displayText.length() <= 4) { displayText = ""; }
            else { displayText = displayText.substring(0, displayText.length() - 4) + "..."; }
        }
        if (displayText == "" || safeWidth <= 0) { return; }
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(x).toNumber(), Math.round(safeY).toNumber(), font, displayText, Graphics.TEXT_JUSTIFY_CENTER);
    }
    function drawSectionLabel(dc as Dc, x, y, text as Lang.String, maxWidth) as Void {
        drawCentered(dc, x, y, text, maxWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }

    function onUpdate(dc as Dc) {
        dc.clear();

        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width;
        if (height < unit) { unit = height; }
        mKajoLayout.configure(width, height);
        var center = width / 2;
        var contentWidth = unit * 0.78;

        // Einheitlicher KAJO-Randakzent.
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawLine((unit * 0.105).toNumber(), (unit * 0.105).toNumber(),
            (unit * 0.12).toNumber(), (unit * 0.075).toNumber());
        dc.drawLine((unit * 0.12).toNumber(), (unit * 0.075).toNumber(),
            (unit * 0.15).toNumber(), (unit * 0.052).toNumber());
        dc.drawLine((unit * 0.15).toNumber(), (unit * 0.052).toNumber(),
            (unit * 0.185).toNumber(), (unit * 0.04).toNumber());

        var name = valueText("name", "Geplante Einheit");
        var date = valueText("date", "Datum offen");
        var type = valueText("type", "Training");
        var duration = valueText("duration", "");
        var targetLoad = valueText("targetTss", "");
        var stepsValue = mWorkout["steps"];
        var stepCount = stepsValue == null ? 0 : stepsValue.size();
        var target = "";
        if (stepCount > 0) {
            var firstStep = stepsValue.get(0) as Lang.Dictionary;
            if (firstStep["target"] != null) {
                target = firstStep["target"].toString();
            }
        }
        if (target.length() == 0 && mWorkout["intensity"] != null) {
            target = mWorkout["intensity"].toString();
        }

        drawCentered(dc, center, unit * 0.075, "GEPLANTES TRAINING", contentWidth, Graphics.FONT_SMALL, 0x00E5CC);
        drawCentered(dc, center, unit * 0.12, date, contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        var cardTop = unit * 0.17;
        var cardHeight = unit * 0.14;
        var cardWidth = mKajoLayout.safeRectWidth(cardTop, cardHeight, unit * 0.76);
        var cardLeft = center - (cardWidth / 2);
        dc.setColor(0x05181C, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(cardLeft.toNumber(),
            cardTop.toNumber(), cardWidth.toNumber(),
            cardHeight.toNumber(), (unit * 0.035).toNumber());
        dc.setColor(0x1A4A52, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(cardLeft.toNumber(),
            cardTop.toNumber(), cardWidth.toNumber(),
            cardHeight.toNumber(), (unit * 0.035).toNumber());
        drawCentered(dc, center, unit * 0.205, compactText(name, 38),
            cardWidth * 0.88, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, center, unit * 0.26, compactText(type, 30),
            cardWidth * 0.88, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Drei dynamische Kennzahlen: nur vorhandene Planwerte werden angezeigt.
        var colX = [center - unit * 0.245, center, center + unit * 0.245];
        var labels = ["DAUER", "SCHRITTE", "ZIEL"];
        var values = [
            duration.length() > 0 ? duration + " MIN" : "—",
            stepCount > 0 ? stepCount.toString() : "—",
            target.length() > 0 ? compactText(target, 16) : (targetLoad.length() > 0 ? targetLoad : "—")
        ];
        for (var c = 0; c < 3; c += 1) {
            if (c > 0) {
                dc.setColor(0x1A4A52, Graphics.COLOR_BLACK);
                dc.drawLine((colX[c] - unit * 0.122).toNumber(), (unit * 0.365).toNumber(),
                    (colX[c] - unit * 0.122).toNumber(), (unit * 0.49).toNumber());
            }
            drawCentered(dc, colX[c], unit * 0.37, labels[c], unit * 0.22,
                Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, colX[c], unit * 0.415, values[c], unit * 0.22,
                Graphics.FONT_SMALL, c == 2 ? 0x00E5CC : Graphics.COLOR_WHITE);
        }

        drawCentered(dc, center, unit * 0.515, "TRAININGSABLAUF", contentWidth,
            Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Maximal drei reale Trainingsschritte; bei mehr Schritten wird die Anzahl genannt.
        var shownSteps = stepCount < 3 ? stepCount : 3;
        var y = unit * 0.56;
        for (var i = 0; i < shownSteps; i += 1) {
            var step = stepsValue.get(i) as Lang.Dictionary;
            var stepLabel = step["label"] == null ? "Trainingsschritt" : step["label"].toString();
            var stepDuration = step["durationSeconds"] == null ? "" : step["durationSeconds"].toString();
            var minutes = "";
            if (stepDuration.length() > 0) {
                var seconds = step["durationSeconds"] as Lang.Number;
                minutes = Math.floor(seconds / 60).toString() + " MIN";
            }
            var line = compactText(stepLabel, 24);
            if (minutes.length() > 0) { line += " (" + minutes + ")"; }
            drawCentered(dc, center, y, line, contentWidth, Graphics.FONT_TINY,
                i == 0 ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY);
            y += unit * 0.052;
        }
        if (stepCount > 3) {
            drawCentered(dc, center, y, "+ " + (stepCount - 3).toString() + " WEITERE SCHRITTE",
                contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else if (stepCount == 0) {
            var mainSet = valueText("mainSet", "");
            var description = valueText("desc", "");
            var detail = mainSet.length() > 0 ? mainSet : description;
            if (detail.length() > 0) {
                drawCentered(dc, center, unit * 0.585, compactText(detail, 50),
                    contentWidth, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
            } else {
                drawCentered(dc, center, unit * 0.585, "Keine Schrittfolge hinterlegt",
                    contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
        }

        // Startaktion liegt als große, klar erkennbare Fläche am unteren Rand.
        mStartTop = (unit * 0.78).toNumber();
        mStartBottom = (unit * 0.87).toNumber();
        var startHeight = mStartBottom - mStartTop;
        var startWidth = mKajoLayout.safeRectWidth(mStartTop, startHeight, unit * 0.62);
        var startLeft = center - (startWidth / 2);
        dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
        dc.drawRoundedRectangle(startLeft.toNumber(),
            mStartTop.toNumber(), startWidth.toNumber(),
            startHeight.toNumber(), (unit * 0.04).toNumber());
        drawCentered(dc, center, unit * 0.805, "TRAINING STARTEN",
            startWidth * 0.86, Graphics.FONT_SMALL, 0x00E5CC);
        drawCentered(dc, center, unit * 0.90, "ZURUECK",
            unit * 0.45, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
