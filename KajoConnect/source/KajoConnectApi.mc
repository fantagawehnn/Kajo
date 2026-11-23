import Toybox.Communications;
import Toybox.Lang;

// Zentrale HTTPS-Transportebene für KAJO-Connect.
// Die konkreten Endpunkte werden erst nach Backend-Implementierung angebunden.
class KajoConnectApi {

    function initialize() {
    }

    // Sendet einen JSON-POST asynchron an einen KAJO-Connect-Endpunkt.
    // callback muss die Garmin-Signatur (responseCode, data) unterstützen.
    function postJson(
        url as Lang.String,
        payload as Lang.Dictionary,
        bearerToken as Lang.String or Null,
        callback as Lang.Method
    ) as Void {

        var headers = {
            "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
            // Öffentlicher Publishable Key; kein Benutzer- oder Service-Secret.
            "apikey" => "sb_publishable_r2jD8lZ6vm9ueStigYm-Ig_h0SuyDNL"
        };

        if (bearerToken != null && bearerToken.length() > 0) {
            headers["Authorization"] = "Bearer " + bearerToken;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => headers,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        Communications.makeWebRequest(
            url,
            payload,
            options,
            callback
        );
    }
}
