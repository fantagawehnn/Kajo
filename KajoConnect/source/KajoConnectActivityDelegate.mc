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

    // onKey wird bei pausierter Aktivität konsumiert. Die Auswertung
    // kurzer/langer Tastendrücke erfolgt zentral in onKeyReleased().
    function onKey(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        var key = keyEvent.getKey();
        if (mView.isPausedForSave()) {
            if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START || key == WatchUi.KEY_ESC) {
                return true;
            }
        }

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            mView.handlePrimaryButton();
            return true;
        }

        if (key == WatchUi.KEY_ESC && mView.handleLapButton()) {
            return true;
        }

        if (key == WatchUi.KEY_MENU || key == WatchUi.KEY_ACTION_MENU ||
            key == WatchUi.KEY_UP || key == WatchUi.KEY_PAGE) {
            mView.nextDisplayPage(1);
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            mView.nextDisplayPage(-1);
            return true;
        }
        return false;
    }

    function onKeyPressed(keyEvent as WatchUi.KeyEvent) as Lang.Boolean {
        if (!mView.isPausedForSave()) { return false; }
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
        if (!mView.isPausedForSave()) { return false; }
        var key = keyEvent.getKey();
        var now = System.getTimer();

        if (key == WatchUi.KEY_ENTER || key == WatchUi.KEY_START) {
            if (mUpperPressStartedAt >= 0) {
                var held = now - mUpperPressStartedAt;
                mUpperPressStartedAt = -1;
                if (held >= mLongPressThreshold) {
                    mView.handlePausedLongPrimary();
                } else {
                    mView.handlePausedShortPrimary();
                }
            }
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            if (mLowerPressStartedAt >= 0) {
                var held = now - mLowerPressStartedAt;
                mLowerPressStartedAt = -1;
                if (held >= mLongPressThreshold) {
                    mView.handlePausedLongSecondary();
                } else {
                    mView.handlePausedShortSecondary();
                }
            }
            return true;
        }
        return false;
    }

    // Touch-Wischgesten werden direkt verarbeitet, ohne Behavior-Mapping.
    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            mView.nextDisplayPage(1);
            return true;
        }
        if (direction == WatchUi.SWIPE_DOWN) {
            mView.nextDisplayPage(-1);
            return true;
        }
        return false;
    }
}
