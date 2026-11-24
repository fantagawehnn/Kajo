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

    function fontForPercent(dc as Dc, targetPercent as Lang.Float) {
        // Waehlt die groesste Garmin-Schrift, deren reale Pixelhoehe
        // innerhalb des angeforderten Anteils der Displayhoehe liegt.
        // So bleiben Hoehenberechnungen und die tatsaechlich gezeichnete
        // Schrift auf dem Venu 3S konsistent.
        var targetHeight = mUnit * targetPercent;
        var selectedFont = Graphics.FONT_XTINY;
        var selectedHeight = dc.getFontHeight(selectedFont);

        var candidate = Graphics.FONT_TINY;
        var candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
            selectedHeight = candidateHeight;
        }

        candidate = Graphics.FONT_SMALL;
        candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
            selectedHeight = candidateHeight;
        }

        candidate = Graphics.FONT_MEDIUM;
        candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
            selectedHeight = candidateHeight;
        }

        candidate = Graphics.FONT_LARGE;
        candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
            selectedHeight = candidateHeight;
        }

        candidate = Graphics.FONT_NUMBER_MEDIUM;
        candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
            selectedHeight = candidateHeight;
        }

        candidate = Graphics.FONT_NUMBER_HOT;
        candidateHeight = dc.getFontHeight(candidate);
        if (candidateHeight <= targetHeight && candidateHeight >= selectedHeight) {
            selectedFont = candidate;
        }

        return selectedFont;
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        // Immer mit der angeforderten Schrift beginnen und nur kleiner werden.
        // Die vorherige Logik konnte von XTINY auf SMALL vergroessern, wenn
        // eine Zeile zu breit war. Das war kontraproduktiv und beguenstigte
        // Ueberlagerungen in den kompakten Bereichen des runden Displays.
        var font = preferredFont;
        if (dc.getTextWidthInPixels(text, font) <= maxWidth) { return font; }

        if (font == Graphics.FONT_NUMBER_HOT ||
            font == Graphics.FONT_NUMBER_MEDIUM ||
            font == Graphics.FONT_LARGE ||
            font == Graphics.FONT_MEDIUM) {
            font = Graphics.FONT_SMALL;
            if (dc.getTextWidthInPixels(text, font) <= maxWidth) { return font; }
        }

        if (font != Graphics.FONT_TINY && font != Graphics.FONT_XTINY) {
            font = Graphics.FONT_TINY;
            if (dc.getTextWidthInPixels(text, font) <= maxWidth) { return font; }
        }

        font = Graphics.FONT_XTINY;
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

    function drawTextFit(dc as Dc, x, y, text as Lang.String,
        maxWidth, preferredFont, color as Lang.Number) as Void {
        if (text.length() == 0 || maxWidth <= 0) { return; }

        // Texte werden innerhalb ihrer vorgesehenen Zeile gehalten.
        // Vertikale Positionen werden nicht verschoben, da das sonst
        // benachbarte Zeilen uebereinander schieben koennte.
        var font = fitFont(dc, text, maxWidth.toNumber(), preferredFont);
        var textHeight = dc.getFontHeight(font);
        var textY = Math.round(y).toNumber();
        if (textY < 0 || textY + textHeight > dc.getHeight()) { return; }

        var availableWidth = safeTextWidth(
            dc, x.toNumber(), textY, font, maxWidth.toNumber()
        );
        font = fitFont(dc, text, availableWidth, font);
        textHeight = dc.getFontHeight(font);
        if (textY + textHeight > dc.getHeight()) { return; }
        availableWidth = safeTextWidth(
            dc, x.toNumber(), textY, font, maxWidth.toNumber()
        );

        var displayText = text;
        while (displayText.length() > 0 &&
            dc.getTextWidthInPixels(displayText, font) > availableWidth) {
            if (displayText.length() <= 4) {
                displayText = "";
            } else {
                displayText = displayText.substring(0, displayText.length() - 4) + "...";
            }
        }

        if (displayText.length() == 0 || availableWidth <= 0) { return; }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            Math.round(x).toNumber(),
            textY,
            font,
            displayText,
            Graphics.TEXT_JUSTIFY_CENTER
        );
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
