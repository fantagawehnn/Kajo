import Toybox.Lang;
import Toybox.WatchUi;

// Use InputDelegate directly: onKey receives the physical key codes without
// BehaviorDelegate translating or consuming them first. Touch remains handled
// separately by onTap/onSwipe.
class KajoConnectActivityDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectActivityView;

    function initialize(view as KajoConnectActivityView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            if (mView.isPausedForSave()) {
                mView.handlePausedShortPrimary();
            } else {
                mView.handlePrimaryButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC || key == WatchUi.KEY_LAP) {
            if (mView.isPausedForSave()) {
                mView.handlePausedShortSecondary();
            } else if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(-1);
            } else {
                mView.handleBackOrLapButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_MENU) {
            if (mView.isPausedForSave()) {
                // Long-press menu behavior is kept as the secondary long action.
                mView.handlePausedLongSecondary();
            } else if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(1);
            } else {
                mView.nextDisplayPage(1);
            }
            return true;
        }

        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_PAGE) {
            if (mView.isSavedForDetails()) {
                if (!mView.scrollSavedLaps(-1)) {
                    mView.nextSavedDetailPage(-1);
                }
            } else {
                mView.nextDisplayPage(-1);
            }
            return true;
        }

        if (key == WatchUi.KEY_DOWN) {
            if (mView.isSavedForDetails()) {
                if (!mView.scrollSavedLaps(1)) {
                    mView.nextSavedDetailPage(1);
                }
            } else {
                mView.nextDisplayPage(1);
            }
            return true;
        }

        return false;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            if (mView.isSavedForDetails()) {
                if (!mView.scrollSavedLaps(1)) {
                    mView.nextSavedDetailPage(1);
                }
            } else {
                mView.nextDisplayPage(1);
            }
            return true;
        }
        if (direction == WatchUi.SWIPE_DOWN) {
            if (mView.isSavedForDetails()) {
                if (!mView.scrollSavedLaps(-1)) {
                    mView.nextSavedDetailPage(-1);
                }
            } else {
                mView.nextDisplayPage(-1);
            }
            return true;
        }
        return false;
    }
}
