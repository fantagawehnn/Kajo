import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutomaticallySyncCloudSnapshot } from '../js/cloud-sync-policy.js';

test('blocks automatic cloud writes until the initial upload is explicitly confirmed', () => {
    for (const state of ['unknown', 'checking', 'empty', 'error', null, undefined]) {
        assert.equal(canAutomaticallySyncCloudSnapshot(state), false, `state ${state} must remain blocked`);
    }
});

test('allows automatic cloud writes after an existing cloud snapshot or confirmed initial upload', () => {
    assert.equal(canAutomaticallySyncCloudSnapshot('exists'), true);
    assert.equal(canAutomaticallySyncCloudSnapshot('uploaded'), true);
});
