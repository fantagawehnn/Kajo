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
        if (preferredFont == Graphics.FONT_NUMBER_HOT) { return 0.070; }
        if (preferredFont == Graphics.FONT_NUMBER_MEDIUM) { return 0.060; }
        if (preferredFont == Graphics.FONT_LARGE) { return 0.045; }
        if (preferredFont == Graphics.FONT_MEDIUM) { return 0.040; }
        if (preferredFont == Graphics.FONT_SMALL) { return 0.035; }
        if (preferredFont == Graphics.FONT_TINY) { return 0.030; }
        return 0.028;
    }

    function scaledFont(dc as Dc, text as Lang.String, maxWidth,
        maxHeight, preferredFont) {
        var baseHeight = dc.getFontHeight(preferredFont);
        if (baseHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
            return preferredFont;
        }

        var scale = ((maxHeight * 1.0) - 2.0) / (baseHeight * 1.0);
        if (scale > 1.0) { scale = 1.0; }
        if (scale <= 0.0) { return preferredFont; }

        var baseWidth = dc.getTextWidthInPixels(text, preferredFont);
        if (baseWidth > 0) {
            var widthScale = ((maxWidth * 0.94) / (baseWidth * 1.0));
            if (widthScale < scale) { scale = widthScale; }
        }

        if (scale <= 0.0) { return preferredFont; }

        // Venu 3S supports scalable fonts (Connect IQ 5.2). Scaling the
        // requested Garmin font keeps the visual hierarchy but allows real
        // 12–24 px text instead of forcing FONT_XTINY's 32 px bitmap size.
        if (Graphics has :getVectorFont) {
            var vectorFont = Graphics.getVectorFont({
                :font => preferredFont,
                :scale => scale
            });
            if (vectorFont != null) { return vectorFont; }
        }

        // Safe fallback for devices without scalable-font support. The
        // caller clips the text to its own box and skips impossible layouts.
        return preferredFont;
    }

    function fontForPercent(dc as Dc, targetPercent as Lang.Float) {
        var targetHeight = mUnit * targetPercent;
        var preferred = Graphics.FONT_XTINY;
        if (targetHeight >= dc.getFontHeight(Graphics.FONT_LARGE)) {
            preferred = Graphics.FONT_LARGE;
        } else if (targetHeight >= dc.getFontHeight(Graphics.FONT_MEDIUM)) {
            preferred = Graphics.FONT_MEDIUM;
        } else if (targetHeight >= dc.getFontHeight(Graphics.FONT_SMALL)) {
            preferred = Graphics.FONT_SMALL;
        }
        return scaledFont(dc, "KAJO", mUnit * 0.8, targetHeight, preferred);
    }

    function fitFont(dc as Dc, text as Lang.String, maxWidth as Lang.Number, preferredFont) {
        var targetHeight = dc.getFontHeight(preferredFont) * 0.62;
        return scaledFont(dc, text, maxWidth, targetHeight, preferredFont);
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
        return safeWidthAt(x, y, requestedWidth);
    }

    function safeTextY(y, textHeight) as Lang.Number {
        return Math.round(y).toNumber();
    }

    function drawTextFit(dc as Dc, x, y, text as Lang.String,
        maxWidth, preferredFont, color as Lang.Number) as Void {
        if (text.length() == 0 || maxWidth <= 0) { return; }
        var targetHeight = dc.getFontHeight(preferredFont) * 0.62;
        drawTextBox(
            dc,
            x.toNumber(),
            y.toNumber(),
            maxWidth.toNumber(),
            targetHeight.toNumber(),
            text,
            preferredFont,
            color
        );
    }

    // Every text draw is measured against its actual rectangle. A scalable
    // font is selected for that rectangle, the string is shortened using
    // measured pixel width, and setClip is a final guard against spillover.
    function drawTextBox(dc as Dc, x as Lang.Number, top as Lang.Number,
        width as Lang.Number, height as Lang.Number, text as Lang.String,
        preferredFont, color as Lang.Number) as Void {
        if (text.length() == 0 || width <= 0 || height <= 0) { return; }

        var centerY = top + (height / 2);
        var available = safeWidthAt(x, centerY, width);
        if (available <= 0) { return; }

        var font = scaledFont(dc, text, available, height, preferredFont);
        var textHeight = dc.getFontHeight(font);
        if (textHeight > height) {
            // Do not draw an oversized fallback font into a smaller row.
            return;
        }

        var displayText = text;
        if (dc.getTextWidthInPixels(displayText, font) > available) {
            while (displayText.length() > 0 &&
                dc.getTextWidthInPixels(displayText + "...", font) > available) {
                displayText = displayText.substring(0, displayText.length() - 1);
            }
            if (displayText.length() > 0) {
                displayText += "...";
            } else {
                displayText = "";
            }
        }

        if (displayText.length() == 0) { return; }

        var clipLeft = Math.round(x - (available / 2)).toNumber();
        var clipTop = Math.round(top).toNumber();
        var clipWidth = Math.round(available).toNumber();
        var clipHeight = Math.round(height).toNumber();

        dc.setClip(clipLeft, clipTop, clipWidth, clipHeight);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            x,
            centerY,
            font,
            displayText,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
        );
        dc.clearClip();
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
