import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutView extends WatchUi.View {

    var mWorkout as Lang.Dictionary;

    function initialize(workout as Lang.Dictionary) {
        View.initialize();
        mWorkout = workout;
    }

    function valueText(key as Lang.String, fallback as Lang.String) as Lang.String {
        var value = mWorkout[key];
        if (value == null) {
            return fallback;
        }
        return value.toString();
    }

    function drawCentered(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(x.toNumber(), y.toNumber(), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function onUpdate(dc as Dc) {
        dc.clear();

        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width;
        if (height < unit) { unit = height; }
        var center = width / 2;
        var contentWidth = unit * 0.76;

        var name = valueText("name", "Geplante Einheit");
        var date = valueText("date", "Datum offen");
        var type = valueText("type", "Training");
        var duration = valueText("duration", "—");
        var targetLoad = valueText("targetTss", "—");
        var category = valueText("category", "Keine Kategorie");
        var description = valueText("desc", "");
        var isRestDay = (type == "RestDay");

        drawCentered(dc, center, unit * 0.085, "TRAININGSUEBERSICHT", contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, center, unit * 0.17, isRestDay ? "GEPLANTER RUHETAG" : "GEPLANTE EINHEIT", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(
            (center - unit * 0.36).toNumber(),
            (unit * 0.235).toNumber(),
            (unit * 0.72).toNumber(),
            (unit * 0.17).toNumber(),
            (unit * 0.035).toNumber()
        );
        drawCentered(dc, center, unit * 0.285, name, unit * 0.66, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        drawCentered(dc, center, unit * 0.445, date, contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        drawCentered(dc, center, unit * 0.50, type, contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);

        if (!isRestDay) {
            var leftX = center - unit * 0.19;
            var rightX = center + unit * 0.19;
            drawCentered(dc, leftX, unit * 0.60, "DAUER", unit * 0.34, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, leftX, unit * 0.655, duration == "—" ? "—" : duration + " min", unit * 0.34, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, rightX, unit * 0.60, "ZIEL-LOAD", unit * 0.34, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            drawCentered(dc, rightX, unit * 0.655, targetLoad, unit * 0.34, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            drawCentered(dc, center, unit * 0.735, category, contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        } else {
            drawCentered(dc, center, unit * 0.64, "Keine geplante Trainingsbelastung", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        }

        if (description.length() > 0) {
            drawCentered(dc, center, unit * 0.805, description, contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_WHITE);
        }

        drawCentered(dc, center, unit * 0.91, "ZURUECK", unit * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
    }
}
