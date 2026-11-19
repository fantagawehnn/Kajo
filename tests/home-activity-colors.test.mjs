import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivityDisplayColor } from '../js/home-activity-colors.js';

const sports = { Kayaking: { color: '#E53935' }, Run: { color: '#FB8C00' } };
const categories = { ga: { color: '#10b981' }, interval: { color: '#f59e0b' } };

test('Sportart mode uses the configured sport color', () => {
    assert.equal(getActivityDisplayColor({ type: 'Kayaking', category: 'interval' }, 'sport', sports, categories), '#E53935');
});

test('Trainingsart mode uses the configured training category color', () => {
    assert.equal(getActivityDisplayColor({ type: 'Kayaking', category: 'interval' }, 'training', sports, categories), '#f59e0b');
});

test('Trainingsart mode defaults to GA when no category is set', () => {
    assert.equal(getActivityDisplayColor({ type: 'Kayaking' }, 'training', sports, categories), '#10b981');
});

test('Unknown categories fall back to the sport color', () => {
    assert.equal(getActivityDisplayColor({ type: 'Run', category: 'unknown' }, 'training', sports, categories), '#FB8C00');
});

test('Unknown sports use the neutral fallback', () => {
    assert.equal(getActivityDisplayColor({ type: 'Other' }, 'sport', sports, categories), '#64748b');
});
