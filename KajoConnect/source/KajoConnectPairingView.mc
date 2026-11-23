import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

class KajoConnectPairingView extends WatchUi.View {

    var mEndpoint as Lang.String = "https://zgvargkfzgekokuisarv.supabase.co/functions/v1/kajo-connect";

    var mApi as KajoConnectApi;
    var mTimer as Timer.Timer;
    var mCode as Lang.String = "";
    var mPollSecret as Lang.String = "";
    var mStatus as Lang.String = "VERBINDUNG WIRD GESTARTET";
    var mPaired as Lang.Boolean = false;
    var mStarted as Lang.Boolean = false;

    function initialize() {
        View.initialize();
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
        if (!mStarted) {
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
        Storage.setValue("kajoPairingCode", mCode);
        Storage.setValue("kajoPairingPollSecret", mPollSecret);
        mStatus = "CODE IN KAJO EINGEBEN";
        WatchUi.requestUpdate();

        pollPairing();
        mTimer.start(method(:pollPairing), 10000, true);
    }

    function pollPairing() as Void {
        if (mPaired || mCode.length() == 0 || mPollSecret.length() == 0) {
            return;
        }
        mApi.postJson(
            mEndpoint,
            { "action" => "poll-pairing", "code" => mCode, "pollSecret" => mPollSecret },
            null,
            method(:onPollResponse)
        );
    }

    function onPollResponse(responseCode as Lang.Number, data as Lang.Dictionary or Null) as Void {
        if (responseCode == 404) {
            mStatus = "KOPPLUNG ABGELAUFEN";
            mTimer.stop();
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
            Storage.setValue("kajoDeviceToken", tokenValue.toString());
            Storage.setValue("kajoPairingCode", "");
            Storage.setValue("kajoPairingPollSecret", "");
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

    function onUpdate(dc as Dc) as Void {
        dc.clear();
        var width = dc.getWidth();
        var height = dc.getHeight();
        var unit = width;
        if (height < unit) unit = height;
        var center = width / 2;
        var contentWidth = unit * 0.78;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.drawText(center, unit * 0.13, Graphics.FONT_LARGE, "KAJO", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(center, unit * 0.25, Graphics.FONT_SMALL, "UHR KOPPELN", Graphics.TEXT_JUSTIFY_CENTER);

        if (mCode.length() > 0 && !mPaired) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            var codeFont = Graphics.FONT_MEDIUM;
            var codeText = formatCode();
            if (dc.getTextWidthInPixels(codeText, codeFont) > contentWidth) codeFont = Graphics.FONT_SMALL;
            dc.drawText(center, unit * 0.39, codeFont, codeText, Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
            dc.drawText(center, unit * 0.52, Graphics.FONT_XTINY, "KAJO APP OEFFNEN UND CODE EINGEBEN", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (mPaired) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
            dc.drawText(center, unit * 0.42, Graphics.FONT_MEDIUM, "VERBUNDEN", Graphics.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.drawText(center, unit * 0.68, Graphics.FONT_XTINY, mStatus, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(center, unit * 0.89, Graphics.FONT_SMALL, "ZURUECK", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
