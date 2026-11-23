import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

class KajoLayout {

    var mWidth as Lang.Number = 0;
    var mHeight as Lang.Number = 0;
    var mUnit as Lang.Number = 0;
    var mCenterX as Lang.Number = 0;
    var mCenterY as Lang.Number = 0;
    var mRadius as Lang.Number = 0;

    function initialize() {
    }

    function configure(width as Lang.Number, height as Lang.Number) as Void {
        mWidth = width;
        mHeight = height;
        mUnit = width < height ? width : height;
        mCenterX = width / 2;
        mCenterY = height / 2;
        mRadius = Math.round(mUnit * 0.465).toNumber();
    }

    function fontPercent(preferredFont) as Lang.Float {
        // Garmin-Fonts sind auf kleinen Runddisplays deutlich groesser als
        // ihre Bezeichnung vermuten laesst. Deshalb konservative Zielhoehen.
        if (preferredFont == Graphics.FONT_NUMBER_HOT) { return 0.070; }
        if (preferredFont == Graphics.FONT_NUMBER_MEDIUM) { return 0.060; }
        if (preferredFont == Graphics.FONT_LARGE) { return 0.045; }
        if (preferredFont == Graphics.FONT_MEDIUM) { return 0.040; }
        if (preferredFont == Graphics.FONT_SMALL) { return 0.035; }
        if (preferredFont == Graphics.FONT_TINY) { return 0.030; }
        return 0.028;
    }

    function fontForPercent(dc as Dc, percent as Lang.Float) {
        var targetHeight = mUnit * percent;
        var fonts = [
            Graphics.FONT_XTINY,
            Graphics.FONT_TINY,
            Graphics.FONT_SMALL,
            Graphics.FONT_MEDIUM,
            Graphics.FONT_LARGE,
            Graphics.FONT_NUMBER_MEDIUM,
            Graphics.FONT_NUMBER_HOT
        ];
        var selected = Graphics.FONT_XTINY;
        for (var i = 0; i < fonts.size(); i += 1) {
            var candidate = fonts[i];
            if (dc.getFontHeight(candidate) <= targetHeight) { selected = candidate; }
        }
        return selected;
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var font = fontForPercent(dc, fontPercent(preferredFont));
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_SMALL; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_TINY; }
        if (dc.getTextWidthInPixels(text, font) > maxWidth) { font = Graphics.FONT_XTINY; }
        return font;
    }

    function safeWidthAt(x, y, requestedWidth) as Lang.Number {
        var dy = y - mCenterY;
        var remaining = (mRadius * mRadius) - (dy * dy);
        if (remaining <= 0) { return 0; }
        var halfChord = Math.sqrt(remaining);
        var margin = mUnit * 0.035;
        var left = mCenterX - halfChord + margin;
        var right = mCenterX + halfChord - margin;
        var availableLeft = x - left;
        var availableRight = right - x;
        var available = availableLeft < availableRight ? availableLeft : availableRight;
        available = available * 2;
        if (available < 0) { return 0; }
        return Math.round(available < requestedWidth ? available : requestedWidth).toNumber();
    }

    function safeTextWidth(dc as Dc, x, y,
        font, requestedWidth) as Lang.Number {
        return safeWidthAt(x, y + (dc.getFontHeight(font) / 2), requestedWidth);
    }

    function safeTextY(y, textHeight) as Lang.Number {
        // Text darf niemals automatisch vertikal verschoben werden.
        // Ein Clamping an den Kreisrand hat zuvor mehrere unabhaengige
        // Textzeilen auf dieselbe y-Position gesetzt und Ueberlagerungen
        // verursacht. Die Kreisbreite wird separat ueber safeTextWidth
        // begrenzt; die vom jeweiligen Bildschirm definierte Zeile bleibt
        // exakt an ihrer vorgesehenen Position.
        return Math.round(y).toNumber();
    }

    function safeRectWidthAt(x, top, height,
        requestedWidth) as Lang.Number {
        var margin = mUnit * 0.01;
        var topWidth = safeWidthAt(x, top + margin, requestedWidth);
        var bottomWidth = safeWidthAt(x, top + height - margin, requestedWidth);
        return Math.round(topWidth < bottomWidth ? topWidth : bottomWidth).toNumber();
    }

    function safeRectWidth(top, height,
        requestedWidth) as Lang.Number {
        var margin = mUnit * 0.01;
        var topWidth = safeWidthAt(mCenterX, top + margin, requestedWidth);
        var bottomWidth = safeWidthAt(mCenterX, top + height - margin, requestedWidth);
        return topWidth < bottomWidth ? topWidth : bottomWidth;
    }
}
