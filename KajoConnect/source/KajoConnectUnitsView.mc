import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class KajoConnectUnitsView extends WatchUi.View {

    var mKajoLayout as KajoLayout;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, width, font, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, width, font, color);
    }

    function onUpdate(dc as Dc) {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        mKajoLayout.configure(width, height);
        var cx = width / 2;

        drawFit(dc, cx, unit * 0.075, "EINHEITEN",
            unit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        drawFit(dc, cx, unit * 0.15, "METRISCH · AKTUELLER STANDARD",
            unit * 0.80, Graphics.FONT_XTINY, 0x98A5AB);
        dc.setColor(0x2A3439, Graphics.COLOR_BLACK);
        dc.drawLine(62, unit * 0.20, 328, unit * 0.20);

        var rows = [
            ["DISTANZ", "KM"],
            ["TEMPO", "MIN/KM"],
            ["GESCHWINDIGKEIT", "KM/H"]
        ];
        var rowTop = unit * 0.29;
        var rowStep = unit * 0.15;
        var rowWidth = mKajoLayout.safeRectWidth(rowTop, 52, unit * 0.80);
        var left = cx - (rowWidth / 2);
        for (var i = 0; i < rows.size(); i += 1) {
            var y = rowTop + (i * rowStep);
            dc.setColor(0x0B1114, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), rowWidth.toNumber(), 52);
            dc.setColor(0x25D3CB, Graphics.COLOR_BLACK);
            dc.fillRectangle(left.toNumber(), y.toNumber(), 4, 52);
            drawFit(dc, cx - rowWidth * 0.10, y + 17, rows[i][0],
                rowWidth * 0.66, Graphics.FONT_XTINY, 0x98A5AB);
            drawFit(dc, cx + rowWidth * 0.34, y + 14, rows[i][1],
                rowWidth * 0.24, Graphics.FONT_SMALL, 0x25D3CB);
        }

        drawFit(dc, cx, unit * 0.86, "UNTERE TASTE · ZURÜCK",
            unit * 0.76, Graphics.FONT_XTINY, 0x98A5AB);
    }
}