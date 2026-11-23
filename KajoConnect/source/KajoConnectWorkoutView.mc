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
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        var displayText = text;
        while (displayText.length() > 0 && dc.getTextWidthInPixels(displayText, font) > maxWidth) {
            if (displayText.length() <= 4) { displayText = ""; }
            else { displayText = displayText.substring(0, displayText.length() - 4) + "..."; }
        }
        if (displayText == "") { return; }
        var safeY = y;
        var textHeight = dc.getFontHeight(font);
        var maxHeight = dc.getHeight();
        if (safeY < 2) { safeY = 2; }
        if (safeY + textHeight > maxHeight - 2) { safeY = maxHeight - textHeight - 2; }
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
        var center = width / 2;
        var contentWidth = unit * 0.78;

        var name = valueText("name", "Geplante Einheit");
        var date = valueText("date", "Datum offen");
        var type = valueText("type", "Training");
        var duration = valueText("duration", "—");
        var targetLoad = valueText("targetTss", "—");
        var category = valueText("category", "");
        var description = valueText("desc", "");
        var isRestDay = (type == "RestDay");

        var objective = valueText("objective", "");
        var intensity = valueText("intensity", "");
        var mainSet = valueText("mainSet", "");
        var warmup = valueText("warmup", "");
        var cooldown = valueText("cooldown", "");
        var notes = valueText("notes", "");

        var raceFormat = valueText("raceFormat", "");
        var waterType = valueText("waterType", "");
        var sportContext = raceFormat;
        if (waterType.length() > 0) {
            sportContext = sportContext.length() > 0 ? sportContext + " · " + waterType : waterType;
        }

        drawCentered(dc, center, unit * 0.075, "TRAINING", contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawCentered(dc, center, unit * 0.125, date, contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        // Hauptkarte: Name der Einheit und sportartspezifischer Kontext.
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(
            (center - unit * 0.38).toNumber(),
            (unit * 0.18).toNumber(),
            (unit * 0.76).toNumber(),
            (unit * 0.145).toNumber(),
            (unit * 0.035).toNumber()
        );
        drawCentered(dc, center, unit * 0.215, compactText(name, 42), unit * 0.69, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        drawCentered(dc, center, unit * 0.27, compactText(type, 32), unit * 0.68, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);

        if (sportContext.length() > 0) {
            drawCentered(dc, center, unit * 0.345, compactText(sportContext, 38), contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        }

        if (isRestDay) {
            drawCentered(dc, center, unit * 0.49, "RUHETAG", contentWidth, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
            drawCentered(dc, center, unit * 0.57, "Keine geplante Trainingsbelastung", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        } else {
            // Zwei kompakte Kennzahlen, ähnlich der klaren Zielanzeige bei Garmin.
            var leftX = center - unit * 0.19;
            var rightX = center + unit * 0.19;
            drawSectionLabel(dc, leftX, unit * 0.395, "DAUER", unit * 0.34);
            drawCentered(dc, leftX, unit * 0.435, duration == "—" ? "—" : duration + " min", unit * 0.34, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawSectionLabel(dc, rightX, unit * 0.395, "ZIEL-LOAD", unit * 0.34);
            drawCentered(dc, rightX, unit * 0.435, targetLoad, unit * 0.34, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

            if (category.length() > 0) {
                drawCentered(dc, center, unit * 0.49, compactText(category, 38), contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }

            // Intensitaet und Trainingsziel werden nur angezeigt, wenn im Plan vorhanden.
            if (intensity.length() > 0) {
                drawSectionLabel(dc, center, unit * 0.545, "INTENSITAET", contentWidth);
                drawCentered(dc, center, unit * 0.58, compactText(intensity, 46), contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }

            if (objective.length() > 0) {
                drawSectionLabel(dc, center, unit * 0.635, "TRAININGSZIEL", contentWidth);
                drawCentered(dc, center, unit * 0.67, compactText(objective, 48), contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }

            // Der Hauptteil bekommt die groesste Aufmerksamkeit.
            if (mainSet.length() > 0) {
                dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
                dc.fillRoundedRectangle(
                    (center - unit * 0.37).toNumber(),
                    (unit * 0.715).toNumber(),
                    (unit * 0.74).toNumber(),
                    (unit * 0.105).toNumber(),
                    (unit * 0.025).toNumber()
                );
                drawSectionLabel(dc, center, unit * 0.735, "HAUPTTEIL", contentWidth);
                drawCentered(dc, center, unit * 0.775, compactText(mainSet, 48), unit * 0.68, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            } else if (description.length() > 0) {
                drawSectionLabel(dc, center, unit * 0.735, "TRAININGSINFO", contentWidth);
                drawCentered(dc, center, unit * 0.775, compactText(description, 48), contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
            }

            var preparation = warmup.length() > 0 ? "EIN: " + compactText(warmup, 25) : "";
            var finish = cooldown.length() > 0 ? "AUS: " + compactText(cooldown, 25) : "";
            var bottomInfo = preparation;
            if (finish.length() > 0) {
                bottomInfo = bottomInfo.length() > 0 ? bottomInfo + "  ·  " + finish : finish;
            }
            if (bottomInfo.length() > 0) {
                drawCentered(dc, center, unit * 0.855, bottomInfo, contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            } else if (notes.length() > 0) {
                drawCentered(dc, center, unit * 0.855, compactText(notes, 48), contentWidth, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
            }
        }

        drawCentered(dc, center, unit * 0.94, "ZURUECK", unit * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
    }
}
