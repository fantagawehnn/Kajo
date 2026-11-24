import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivationGuard } from '../js/activation-guard.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('a late cloud reconciliation cannot apply a snapshot after same-account reactivation', async () => {
    let activationSequence = 10;
    const userId = 'same-account';
    let appliedSnapshot = null;
    const response = deferred();
    const ensureCurrent = createActivationGuard(
        () => activeUserId === userId && activationSequence === 10,
        'cloud activation changed'
    );
    let activeUserId = userId;

    const reconciliation = (async () => {
        const cloudSnapshot = await response.promise;
        ensureCurrent();
        appliedSnapshot = cloudSnapshot;
    })();

    // Sign out and back into the same account: only the activation sequence changes.
    activationSequence += 1;
    response.resolve({ profile: { name: 'stale cloud state' } });

    await assert.rejects(reconciliation, /cloud activation changed/);
    assert.equal(appliedSnapshot, null);
});

test('a delayed Garmin import cannot save after same-account reactivation', async () => {
    let activationSequence = 20;
    let appUserReady = true;
    let activeUserId = 'same-account';
    let saved = false;
    const rowsResponse = deferred();
    const userId = activeUserId;
    const expectedActivationSequence = activationSequence;
    const ensureCurrent = createActivationGuard(
        () => appUserReady && activeUserId === userId && activationSequence === expectedActivationSequence,
        'Garmin activation changed'
    );

    const importTask = (async () => {
        const rows = await rowsResponse.promise;
        ensureCurrent();
        if (rows.length) saved = true;
    })();

    // The same account returns, but this is a different activation cycle.
    appUserReady = false;
    activationSequence += 1;
    appUserReady = true;
    rowsResponse.resolve([{ record_date: '2026-11-24', data_type: 'hrv_daily', payload: { lastNightAvg: 60 } }]);

    await assert.rejects(importTask, /Garmin activation changed/);
    assert.equal(saved, false);
});
