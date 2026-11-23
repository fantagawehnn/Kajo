import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutView extends WatchUi.View {

    var mWorkoutName as Lang.String;

    function initialize(workoutName as Lang.String) {
        View.initialize();
        mWorkoutName = workoutName;
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function drawFit(dc as Dc, cx, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        var font = fitFont(dc, text, maxWidth, preferredFont);
        dc.setColor(color, Graphics.COLOR_BLACK);
        dc.drawText(Math.round(cx), Math.round(y), font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width;
        if (height < unit) { unit = height; }
        var center = width / 2;
        var contentWidth = unit * 0.70;

        drawFit(dc, center, unit * 0.105, "TRAININGSUEBERSICHT", contentWidth, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, center, unit * 0.24, "GEPLANTE EINHEIT", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_BLACK);
        dc.fillRoundedRectangle(Math.round(center - unit * 0.34), Math.round(unit * 0.32), Math.round(unit * 0.68), Math.round(unit * 0.17), Math.round(unit * 0.035));
        drawFit(dc, center, unit * 0.375, mWorkoutName, unit * 0.60, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);

        drawFit(dc, center, unit * 0.58, "Trainingsdetails werden angezeigt,", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, center, unit * 0.64, "sobald die KAJO-Synchronisierung", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, center, unit * 0.70, "eingerichtet ist.", contentWidth, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);

        drawFit(dc, center, unit * 0.835, "ZURUECK", unit * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
    }
}
