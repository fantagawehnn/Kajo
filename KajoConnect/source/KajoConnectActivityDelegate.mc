import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

class KajoConnectActivityDelegate extends WatchUi.InputDelegate {

    var mView as KajoConnectActivityView;
    var mUpperPressStartedAt as Lang.Number = -1;
    var mLowerPressStartedAt as Lang.Number = -1;
    var mLongPressThreshold as Lang.Number = 800;

    function initialize(view as KajoConnectActivityView) {
        InputDelegate.initialize();
        mView = view;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coordinates = clickEvent.getCoordinates();
        mView.handleTap(coordinates[0], coordinates[1]);
        return true;
    }

    // onKey ist das zentrale Ereignis für einen vollständigen Tastendruck.
    // Das ist wichtig auf Touch-Uhren, auf denen Pressed/Released nicht immer
    // zuverlässig geliefert werden. Die Zeitmessung bleibt nur für Long-Press-Aktionen.
    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            if (mView.isPausedForSave()) {
                // Wenn Pressed/Released verfügbar sind, entscheidet onKeyReleased.
                if (mUpperPressStartedAt < 0) {
                    mView.handlePausedShortPrimary();
                }
            } else {
                mUpperPressStartedAt = -1;
                mView.handlePrimaryButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC) {
            if (mView.isPausedForSave()) {
                if (mLowerPressStartedAt < 0) {
                    mView.handlePausedShortSecondary();
                }
            } else if (mView.isSavedForDetails()) {
                mLowerPressStartedAt = -1;
                mView.nextSavedDetailPage(1);
            } else {
                mLowerPressStartedAt = -1;
                mView.handleBackOrLapButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_MENU || key == WatchUi.KEY_ACTION_MENU ||
            key == WatchUi.KEY_UP || key == WatchUi.KEY_PAGE) {
            if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(1);
            } else {
                mView.nextDisplayPage(1);
            }
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(-1);
            } else {
                mView.nextDisplayPage(-1);
            }
            return true;
        }
        return false;
    }

    function onKeyPressed(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mUpperPressStartedAt = System.getTimer();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            mLowerPressStartedAt = System.getTimer();
            return true;
        }
        return false;
    }

    function onKeyReleased(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        var now = System.getTimer();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            if (mUpperPressStartedAt < 0) { return true; }
            var upperHeld = now - mUpperPressStartedAt;
            mUpperPressStartedAt = -1;
            if (mView.isPausedForSave()) {
                if (upperHeld >= mLongPressThreshold) {
                    mView.handlePausedLongPrimary();
                } else {
                    mView.handlePausedShortPrimary();
                }
            } else if (upperHeld < mLongPressThreshold) {
                mView.handlePrimaryButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC) {
            if (mLowerPressStartedAt < 0) { return true; }
            var lowerHeld = now - mLowerPressStartedAt;
            mLowerPressStartedAt = -1;
            if (mView.isPausedForSave()) {
                if (lowerHeld >= mLongPressThreshold) {
                    mView.handlePausedLongSecondary();
                } else {
                    mView.handlePausedShortSecondary();
                }
            } else if (mView.isSavedForDetails() && lowerHeld < mLongPressThreshold) {
                mView.nextSavedDetailPage(1);
            } else if (lowerHeld < mLongPressThreshold) {
                mView.handleBackOrLapButton();
            }
            return true;
        }
        return false;
    }

    // Touch-Wischgesten werden direkt verarbeitet, ohne Behavior-Mapping.
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
