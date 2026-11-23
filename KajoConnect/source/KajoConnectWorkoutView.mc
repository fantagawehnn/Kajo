import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectWorkoutView extends WatchUi.View {

    var mWorkoutName as Lang.String;

    function initialize(workoutName as Lang.String) {
        View.initialize();
        mWorkoutName = workoutName;
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var center = dc.getWidth() / 2;
        var height = dc.getHeight();

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(center, height * 0.09, Graphics.FONT_SMALL, "TRAININGSUEBERSICHT", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(center, height * 0.22, Graphics.FONT_TINY, "GEPLANTE EINHEIT", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(center, height * 0.32, Graphics.FONT_MEDIUM, mWorkoutName, Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(center, height * 0.48, Graphics.FONT_TINY, "Details wie Dauer, Zielbelastung", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(center, height * 0.55, Graphics.FONT_TINY, "und Trainingsbeschreibung erscheinen", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(center, height * 0.62, Graphics.FONT_TINY, "nach der KAJO-Synchronisierung.", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(center, height * 0.82, Graphics.FONT_SMALL, "ZURUECK", Graphics.TEXT_JUSTIFY_CENTER);
    }
}