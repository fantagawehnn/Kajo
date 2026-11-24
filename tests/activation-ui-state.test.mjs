import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivationUiState } from '../js/activation-ui-state.js';

test('keeps the app hidden until the authenticated local account is loaded', () => {
    assert.deepEqual(getActivationUiState('athlete-1', null, null), { visible: false, readOnly: false });
});
test('shows local data in a read-only shell while cloud reconciliation is pending', () => {
    assert.deepEqual(getActivationUiState('athlete-1', 'athlete-1', null), { visible: true, readOnly: true });
});
test('unlocks the app only after reconciliation for the same account', () => {
    assert.deepEqual(getActivationUiState('athlete-1', 'athlete-1', 'athlete-1'), { visible: true, readOnly: false });
});
test('does not expose a previous account local view after an account switch', () => {
    assert.deepEqual(getActivationUiState('athlete-2', 'athlete-1', null), { visible: false, readOnly: false });
});
test('a fully ready account remains available without a local-ready marker', () => {
    assert.deepEqual(getActivationUiState('athlete-1', null, 'athlete-1'), { visible: true, readOnly: false });
});
