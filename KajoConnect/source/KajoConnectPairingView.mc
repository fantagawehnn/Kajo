import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

class KajoConnectPairingView extends WatchUi.View {

    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    var mKajoLayout as KajoLayout;
    var mApi as KajoConnectApi;
    var mTimer as Timer.Timer;
    var mCode as Lang.String = "";
    var mPollSecret as Lang.String = "";
    var mStatus as Lang.String = "VERBINDUNG WIRD GESTARTET";
    var mPaired as Lang.Boolean = false;
    var mStarted as Lang.Boolean = false;
    var mPollInFlight as Lang.Boolean = false;

    function initialize() {
        View.initialize();
        mKajoLayout = new KajoLayout();
        mApi = new KajoConnectApi();
        mTimer = new Timer.Timer();
    }

    function onShow() as Void {
        var savedToken = Storage.getValue("kajoDeviceToken");
        if (savedToken != null && savedToken.toString().length() > 0) {
            mPaired = true;
            mStatus = "BEREITS MIT KAJO VERBUNDEN";
            return;
        }
        if (mPaired) { return; }

        // Einen noch gültigen Kopplungsvorgang nach dem Öffnen der Ansicht
        // oder einem Neustart der App fortsetzen.
        var savedCode = Storage.getValue("kajoPairingCode");
        var savedSecret = Storage.getValue("kajoPairingPollSecret");
        if (mCode.length() != 12 && savedCode != null) {
            mCode = savedCode.toString();
        }
        if (mPollSecret.length() != 64 && savedSecret != null) {
            mPollSecret = savedSecret.toString();
        }

        if (mCode.length() == 12 && mPollSecret.length() == 64) {
            mStarted = true;
            mStatus = "WARTE AUF KAJO";
            pollPairing();
            mTimer.start(method(:pollPairing), 10000, true);
        } else {
            // Unvollständige lokale Zugangsdaten nicht weiterverwenden.
            mCode = "";
            mPollSecret = "";
            try {
                Storage.setValue("kajoPairingCode", "");
                Storage.setValue("kajoPairingPollSecret", "");
            } catch (error) {
            }
            mStarted = true;
            createPairing();
        }
    }

    function onHide() as Void {
        mTimer.stop();
    }

    function createPairing() as Void {
        mStatus = "KOPPLUNGSCODE WIRD ERSTELLT";
        WatchUi.requestUpdate();
        mApi.postJson(
            mEndpoint,
            { "action" => "create-pairing", "deviceLabel" => "Garmin KAJO Connect" },
            null,
            method(:onCreateResponse)
        );
    }

    function onCreateResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        if (responseCode != 200 || data == null) {
            mStatus = "VERBINDUNG FEHLGESCHLAGEN";
            WatchUi.requestUpdate();
            return;
        }

        var codeValue = data["code"];
        var secretValue = data["pollSecret"];
        if (codeValue == null || secretValue == null) {
            mStatus = "UNGUELTIGE SERVERANTWORT";
            WatchUi.requestUpdate();
            return;
        }

        mCode = codeValue.toString();
        mPollSecret = secretValue.toString();
        try {
            Storage.setValue("kajoPairingCode", mCode);
            Storage.setValue("kajoPairingPollSecret", mPollSecret);
        } catch (error) {
            // Die Kopplung kann in dieser Sitzung fortgesetzt werden; bei einem
            // Neustart muss andernfalls ein neuer Code angefordert werden.
        }
        mStatus = "CODE IN KAJO EINGEBEN";
        WatchUi.requestUpdate();

        pollPairing();
        mTimer.start(method(:pollPairing), 10000, true);
    }

    function pollPairing() as Void {
        if (mPaired || mPollInFlight || mCode.length() != 12 || mPollSecret.length() != 64) {
            return;
        }
        mPollInFlight = true;
        try {
            mApi.postJson(
                mEndpoint,
                { "action" => "poll-pairing", "code" => mCode, "pollSecret" => mPollSecret },
                null,
                method(:onPollResponse)
            );
        } catch (error) {
            mPollInFlight = false;
            mStatus = "VERBINDUNG FEHLGESCHLAGEN";
            WatchUi.requestUpdate();
        }
    }

    function onPollResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        mPollInFlight = false;
        if (responseCode == 404) {
            mStatus = "KOPPLUNG ABGELAUFEN";
            mTimer.stop();
            mCode = "";
            mPollSecret = "";
            mStarted = false;
            try {
                Storage.setValue("kajoPairingCode", "");
                Storage.setValue("kajoPairingPollSecret", "");
            } catch (error) {
            }
            WatchUi.requestUpdate();
            return;
        }
        if (responseCode != 200 || data == null) {
            mStatus = "WARTE AUF VERBINDUNG";
            WatchUi.requestUpdate();
            return;
        }

        var statusValue = data["status"];
        if (statusValue == null) {
            mStatus = "WARTE AUF KAJO";
            WatchUi.requestUpdate();
            return;
        }

        var status = statusValue.toString();
        if (status == "paired") {
            var tokenValue = data["deviceToken"];
            if (tokenValue == null) {
                mStatus = "TOKEN FEHLT";
                WatchUi.requestUpdate();
                return;
            }
            try {
                Storage.setValue("kajoDeviceToken", tokenValue.toString());
            } catch (error) {
                mStatus = "TOKEN KANN NICHT GESPEICHERT WERDEN";
                WatchUi.requestUpdate();
                return;
            }
            try {
                Storage.setValue("kajoPairingCode", "");
                Storage.setValue("kajoPairingPollSecret", "");
            } catch (error) {
            }
            mPaired = true;
            mTimer.stop();
            mStatus = "ERFOLGREICH VERBUNDEN";
        } else if (status == "pending" || status == "claimed") {
            mStatus = status == "claimed" ? "KAJO BESTAETIGT – VERBINDE" : "CODE IN KAJO EINGEBEN";
        } else {
            mStatus = "KOPPLUNG ABGELAUFEN";
            mTimer.stop();
        }
        WatchUi.requestUpdate();
    }

    function formatCode() as Lang.String {
        if (mCode.length() != 12) { return mCode; }
        return mCode.substring(0, 4) + " " + mCode.substring(4, 8) + " " + mCode.substring(8, 12);
    }

    function drawFit(dc as Dc, x, y, text as Lang.String, maxWidth, preferredFont, color as Lang.Number) as Void {
        mKajoLayout.drawTextFit(dc, x, y, text, maxWidth, preferredFont, color);
    }

    function onUpdate(dc as Dc) as Void {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width < height ? width : height;
        var center = width / 2;
        mKajoLayout.configure(width, height);

        drawFit(dc, center, unit * 0.12, "KAJO",
            unit * 0.70, Graphics.FONT_LARGE, Graphics.COLOR_WHITE);
        // Kopplungsstatus und Code erklaeren den Vorgang direkt.

        if (mCode.length() > 0 && !mPaired) {
            var cardTop = unit * 0.31;
            var cardHeight = unit * 0.17;
            var cardWidth = mKajoLayout.safeRectWidth(cardTop, cardHeight, unit * 0.80);
            var cardLeft = center - (cardWidth / 2);
            dc.setColor(0x07191D, Graphics.COLOR_BLACK);
            dc.fillRoundedRectangle(cardLeft.toNumber(), cardTop.toNumber(),
                cardWidth.toNumber(), cardHeight.toNumber(), (unit * 0.035).toNumber());
            dc.setColor(0x00E5CC, Graphics.COLOR_BLACK);
            dc.drawRoundedRectangle(cardLeft.toNumber(), cardTop.toNumber(),
                cardWidth.toNumber(), cardHeight.toNumber(), (unit * 0.035).toNumber());
            drawFit(dc, center, cardTop + unit * 0.025, "KOPPLUNGSCODE",
                cardWidth * 0.86, Graphics.FONT_XTINY, 0xA0AAB2);
            drawFit(dc, center, cardTop + unit * 0.075, formatCode(),
                cardWidth * 0.92, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
            drawFit(dc, center, unit * 0.535, "CODE IN DER KAJO APP EINGEBEN",
                unit * 0.78, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        } else if (mPaired) {
            drawFit(dc, center, unit * 0.39, "VERBUNDEN",
                unit * 0.72, Graphics.FONT_MEDIUM, 0x00E5CC);
        } else {
            drawFit(dc, center, unit * 0.40, "CODE WIRD ERSTELLT",
                unit * 0.72, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        }

        drawFit(dc, center, unit * 0.68, mStatus,
            unit * 0.78, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
        drawFit(dc, center, unit * 0.87, "ZURUECK",
            unit * 0.48, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY);
    }
}
