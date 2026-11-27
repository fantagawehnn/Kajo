import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const activity = await readFile(new URL('../KajoConnect/source/KajoConnectActivityView.mc', import.meta.url), 'utf8');
const engine = await readFile(new URL('../KajoConnect/source/KajoConnectRecordingEngine.mc', import.meta.url), 'utf8');
const delegate = await readFile(new URL('../KajoConnect/source/KajoConnectActivityDelegate.mc', import.meta.url), 'utf8');

function method(source, name, nextName) {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `Missing method: ${name}`);
    const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
    return source.slice(start, end === -1 ? source.length : end);
}

test('short lower key exits the ready view and marks a lap while recording', () => {
    const backOrLap = method(activity, 'handleBackOrLapButton', 'handleLapButton');
    assert.match(backOrLap, /mStatus == "BEREIT" \|\| mStatus == "START FEHLGESCHLAGEN"/);
    assert.match(backOrLap, /WatchUi\.popView\(WatchUi\.SLIDE_DOWN\)/);
    assert.match(backOrLap, /handleLapButton\(\)/);
    assert.match(delegate, /mView\.handleBackOrLapButton\(\)/);
});

test('saved lap details can scroll through all laps in five-row pages', () => {
    const scroll = method(activity, 'scrollSavedLaps', 'nextDisplayPage');
    assert.match(scroll, /mSavedDetailPage != 2/);
    assert.match(scroll, /mFinalLaps\.size\(\) <= 5/);
    assert.match(scroll, /mSavedLapOffset \+= direction/);
    assert.match(scroll, /mSavedLapOffset > maxOffset/);
    assert.match(activity, /mFinalLaps\[mSavedLapOffset \+ lapIndex\]/);
    assert.match(delegate, /if \(!mView\.scrollSavedLaps\(1\)\)/);
    assert.match(delegate, /if \(!mView\.scrollSavedLaps\(-1\)\)/);
});

test('saving an activity preserves a meaningful final partial lap without duplicating an empty segment', () => {
    const partial = method(activity, 'captureFinalPartialLap', 'finishRecording');
    assert.match(partial, /lapDuration > 1000/);
    assert.match(partial, /distanceValue > 1/);
    assert.match(partial, /mLiveLapSummaries\.add\(lap\)/);
    assert.match(partial, /mLapHeartRateSum \/ mLapHeartRateCount/);
    assert.match(partial, /if \(mEngine\.isRecording\(\)\) \{\s*mEngine\.addLap\(\);/);
    const finish = method(activity, 'finishRecording', 'nextDisplayPage');
    assert.match(finish, /captureFinalPartialLap\(Activity\.getActivityInfo\(\)\)/);
    assert.match(finish, /else \{\s*finalLaps\.add\(liveLap\);/);
});

test('failed Garmin stop keeps the recording and timer active for a retry', () => {
    const finish = method(activity, 'finishRecording', 'nextDisplayPage');
    assert.match(finish, /if \(mEngine\.finish\(\)\)/);
    assert.match(finish, /else if \(mEngine\.isRecording\(\)\)/);
    const stopFailure = finish.slice(finish.indexOf('else if (mEngine.isRecording())'), finish.indexOf('} else {', finish.indexOf('else if (mEngine.isRecording())')));
    assert.doesNotMatch(stopFailure, /mTimer\.stop\(\)/);
    assert.doesNotMatch(stopFailure, /LOCATION_DISABLE/);
    assert.match(stopFailure, /mStatus = "AUFZEICHNUNG"/);
});

test('failed FIT save stops UI timers but preserves engine session for another save attempt', () => {
    const finish = method(activity, 'finishRecording', 'nextDisplayPage');
    const saveFailure = finish.slice(finish.indexOf('} else {', finish.indexOf('else if (mEngine.isRecording())')));
    assert.match(saveFailure, /mTimer\.stop\(\)/);
    assert.match(saveFailure, /LOCATION_DISABLE/);
    assert.match(saveFailure, /mStatus = "SPEICHERN FEHLGESCHLAGEN"/);
    assert.match(activity, /else if \(mStatus == "SPEICHERN FEHLGESCHLAGEN"\) \{\s*finishRecording\(\);/);
    assert.match(engine, /var saved = mSession\.save\(\);[\s\S]*?if \(saved\) \{\s*mSession = null;/);
});

test('activity navigation receives physical keys directly through InputDelegate', () => {
    assert.match(delegate, /extends WatchUi\.InputDelegate/);
    assert.match(delegate, /InputDelegate\.initialize\(\)/);
    const key = method(delegate, 'onKey', 'onTap');
    assert.match(key, /WatchUi\.KEY_ENTER/);
    assert.match(key, /WatchUi\.KEY_ESC/);
    assert.match(key, /WatchUi\.KEY_MENU/);
    assert.match(key, /mView\.handlePrimaryButton\(\)/);
    assert.match(delegate, /function onTap\(clickEvent/);
    assert.match(delegate, /function onSwipe\(swipeEvent/);
});

test('lap marker remains available through the raw back key handler', () => {
    const key = method(delegate, 'onKey', 'onTap');
    assert.match(key, /mView\.handleBackOrLapButton\(\)/);
    const backOrLap = method(activity, 'handleBackOrLapButton', 'handleLapButton');
    assert.match(backOrLap, /handleLapButton\(\)/);
    const lap = method(activity, 'handleLapButton', 'handleTap');
    assert.match(lap, /mStatus != "AUFZEICHNUNG"/);
    assert.match(lap, /completeLap\(showSummary, info\)/);
});

test('free training creates kilometre laps and calculates the lap average heart rate', () => {
    const sampling = method(activity, 'sampleLapMetrics', 'isNextStepRecovery');
    assert.match(sampling, /mCurrentWorkoutState == "FREE"/);
    assert.match(sampling, /mNextAutoLapDistanceMeters/);
    assert.match(sampling, /mLapHeartRateSum \+= info\.currentHeartRate/);
    const complete = method(activity, 'completeLap', 'onPosition');
    assert.match(complete, /mEngine\.addLap\(\)/);
    assert.match(complete, /averageHeartRateBpm/);
    assert.match(complete, /mLapHeartRateSum \/ mLapHeartRateCount/);
    assert.match(activity, /"Ø BPM"/);
});

test('planned training lap summary is shown at the transition into recovery', () => {
    const recovery = method(activity, 'isNextStepRecovery', 'completeLap');
    assert.match(recovery, /isRecoveryStep\(mWorkoutSteps\[nextIndex\]/);
    assert.match(recovery, /mWorkoutStepElapsedSeconds <= 3/);
    assert.match(recovery, /isRecoveryStep\(currentStep\)/);
});

test('interval countdown only advances while activity is recording', () => {
    const timer = method(activity, 'onTimer', 'onPosition');
    assert.match(timer, /if \(mStatus == "AUFZEICHNUNG"\) \{ updateWorkoutStepTimer\(\); \}/);
    const stepTimer = method(activity, 'updateWorkoutStepTimer', 'initialize');
    assert.match(stepTimer, /mWorkoutStepElapsedSeconds \+= 1/);
    assert.match(stepTimer, /mWorkoutStepIndex \+= 1/);
});


test('GPS quality updates independently without changing the FIT recording state', () => {
    const gpsCallback = method(activity, 'onPosition', 'finishRecording');
    assert.match(activity, /var mGpsQuality as Lang\.Number = Position\.QUALITY_NOT_AVAILABLE/);
    assert.match(gpsCallback, /mGpsQuality = positionInfo\.accuracy/);
    assert.match(gpsCallback, /mGpsQuality = Position\.QUALITY_NOT_AVAILABLE/);
    assert.doesNotMatch(gpsCallback, /mEngine\.(finish|start|discard)\(/);
    assert.doesNotMatch(gpsCallback, /mTimer\.(stop|start)\(/);
    assert.doesNotMatch(gpsCallback, /mStatus\s*=/);
    assert.match(activity, /gpsAccuracy = gpsQualityText\(mGpsQuality\)/);
});

test('GPS tracking is enabled only after the FIT session starts successfully', () => {
    const start = method(activity, 'startRecording', 'onTimer');
    assert.ok(start.indexOf('if (started)') < start.indexOf('Position.enableLocationEvents'));
    assert.match(start, /Position\.LOCATION_CONTINUOUS/);
    assert.match(start, /else\s*\{\s*mStartError = mEngine\.getLastError\(\);\s*mStatus = "START FEHLGESCHLAGEN"/);
});


test('an existing active Garmin FIT session is reused after an app restart', () => {
    const start = method(engine, 'start', 'isRecording');
    assert.match(start, /mSession = ActivityRecording\.createSession\(/);
    assert.match(start, /if \(mSession\.isRecording\(\)\) \{\s*return true;/);
    assert.ok(start.indexOf('mSession.isRecording()') < start.indexOf('mSession.start()'));
});

test('a failed start attempt never discards a potentially existing FIT session', () => {
    const start = method(engine, 'start', 'isRecording');
    assert.doesNotMatch(start, /mSession\.discard\(/);
    assert.match(start, /if \(!started\) \{[\s\S]*?return false;/);
    assert.doesNotMatch(start, /mSession = null/);
    assert.match(start, /mLastError = error\.toString\(\)/);
});

test('watch upload updates the versioned activity manifest before acknowledging success', async () => {
    const { readFile } = await import('node:fs/promises');
    const endpoint = await readFile(new URL('../supabase/functions/kajo-connect/index.ts', import.meta.url), 'utf8');
    const helperStart = endpoint.indexOf('async function addActivityToSnapshotManifest');
    const uploadStart = endpoint.indexOf('if (action === "upload-activity")');
    assert.notEqual(helperStart, -1);
    assert.notEqual(uploadStart, -1);
    const helper = endpoint.slice(helperStart, endpoint.indexOf('Deno.serve', helperStart));
    assert.match(helper, /from\("user_data"\)/);
    assert.match(helper, /p_expected_version:\s*Number\(snapshot\.version/);
    assert.match(helper, /admin\.rpc\("save_user_data"/);
    assert.match(helper, /attempt < 3/);
    const upload = endpoint.slice(uploadStart, endpoint.indexOf('// All watch requests after pairing', uploadStart));
    assert.ok(upload.indexOf('addActivityToSnapshotManifest(admin, device.user_id, recordId)') > upload.indexOf('Activity upload could not be verified'));
    assert.match(upload, /source: "garmin-connect-iq"/);
});
