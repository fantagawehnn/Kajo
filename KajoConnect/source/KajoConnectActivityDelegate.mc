import Toybox.Lang;
import Toybox.WatchUi;

// BehaviorDelegate maps the same user intent across touch and button devices.
// The raw key handler remains as a fallback for simulator/device-specific keys.
class KajoConnectActivityDelegate extends WatchUi.BehaviorDelegate {

    var mView as KajoConnectActivityView;

    function initialize(view as KajoConnectActivityView) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    // Keep selection in the low-level handlers so touch taps retain their
    // coordinate-aware behavior and paused screens remain touch-inert.
    function onSelect() as Lang.Boolean {
        return false;
    }

    function onBack() as Lang.Boolean {
        if (mView.isPausedForSave()) {
            mView.handlePausedShortSecondary();
        } else if (mView.isSavedForDetails()) {
            mView.nextSavedDetailPage(-1);
        } else {
            mView.handleBackOrLapButton();
        }
        return true;
    }

    // On touch-first Garmin devices, the menu behavior is commonly produced
    // by the lower-button long press. In the paused state it starts/continues
    // the explicit discard confirmation.
    function onMenu() as Lang.Boolean {
        if (mView.isPausedForSave()) {
            mView.handlePausedLongSecondary();
        } else if (mView.isSavedForDetails()) {
            mView.nextSavedDetailPage(1);
        } else {
            mView.nextDisplayPage(1);
        }
        return true;
    }

    function onNextPage() as Lang.Boolean {
        if (mView.isSavedForDetails()) {
            if (!mView.scrollSavedLaps(1)) {
                mView.nextSavedDetailPage(1);
            }
        } else {
            mView.nextDisplayPage(1);
        }
        return true;
    }

    function onPreviousPage() as Lang.Boolean {
        if (mView.isSavedForDetails()) {
            if (!mView.scrollSavedLaps(-1)) {
                mView.nextSavedDetailPage(-1);
            }
        } else {
            mView.nextDisplayPage(-1);
        }
        return true;
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
