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

    // Die Press/Release-Callbacks merken nur den Beginn des Drucks.
    // Sie geben das Ereignis bewusst frei, damit onKey die Aktion ausführt.
    function onKeyPressed(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mUpperPressStartedAt = System.getTimer();
        } else if (key == WatchUi.KEY_ESC || key == WatchUi.KEY_MENU ||
                   key == WatchUi.KEY_LAP) {
            mLowerPressStartedAt = System.getTimer();
        }
        return false;
    }

    // Keine Aktion hier ausführen und den Zeitstempel nicht löschen:
    // Garmin liefert anschließend onKey für den vollständigen Tastendruck.
    function onKeyReleased(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        return false;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            var upperHeld = 0;
            if (mUpperPressStartedAt >= 0) {
                upperHeld = System.getTimer() - mUpperPressStartedAt;
            }
            mUpperPressStartedAt = -1;

            if (mView.isPausedForSave()) {
                if (upperHeld >= mLongPressThreshold) {
                    mView.handlePausedLongPrimary();
                } else {
                    mView.handlePausedShortPrimary();
                }
            } else {
                mView.handlePrimaryButton();
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC || key == WatchUi.KEY_LAP) {
            var lowerHeld = 0;
            if (mLowerPressStartedAt >= 0) {
                lowerHeld = System.getTimer() - mLowerPressStartedAt;
            }
            mLowerPressStartedAt = -1;

            if (mView.isPausedForSave()) {
                if (lowerHeld >= mLongPressThreshold) {
                    mView.handlePausedLongSecondary();
                } else {
                    mView.handlePausedShortSecondary();
                }
            } else if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(1);
            } else {
                mView.handleBackOrLapButton();
            }
            return true;
        }

        // Auf der Venu 3S kann ein langer Druck auf die untere Taste
        // als KEY_MENU ankommen. Im Pausenzustand ist das die Verwerfen-Aktion.
        if (key == WatchUi.KEY_MENU) {
            mLowerPressStartedAt = -1;
            if (mView.isPausedForSave()) {
                mView.handlePausedLongSecondary();
            } else if (mView.isSavedForDetails()) {
                mView.nextSavedDetailPage(1);
            } else {
                mView.nextDisplayPage(1);
            }
            return true;
        }

        if (key == WatchUi.KEY_ACTION_MENU || key == WatchUi.KEY_UP ||
            key == WatchUi.KEY_PAGE) {
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
