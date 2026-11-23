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

test('lap marker remains bound to the lower physical key during recording', () => {
    assert.match(delegate, /if \(key == WatchUi\.KEY_ESC && mView\.handleLapButton\(\)\)/);
    const lap = method(activity, 'handleLapButton', 'handleTap');
    assert.match(lap, /mEngine\.addLap\(\)/);
    assert.match(lap, /mStatus != "AUFZEICHNUNG"/);
});

test('interval countdown only advances while activity is recording', () => {
    const timer = method(activity, 'onTimer', 'onPosition');
    assert.match(timer, /if \(mStatus == "AUFZEICHNUNG"\) \{ updateWorkoutStepTimer\(\); \}/);
    const stepTimer = method(activity, 'updateWorkoutStepTimer', 'initialize');
    assert.match(stepTimer, /mWorkoutStepElapsedSeconds \+= 1/);
    assert.match(stepTimer, /mWorkoutStepIndex \+= 1/);
});
