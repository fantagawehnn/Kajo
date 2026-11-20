import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDashboardLayout, DASHBOARD_METRICS } from '../js/dashboard-customization.js';

test('uses the current dashboard order and shows every section by default', () => {
    const layout = normalizeDashboardLayout({});
    assert.deepEqual(layout.order, ['status', 'daily', 'recommendation', 'wearables', 'race', 'week']);
    assert.ok(Object.values(layout.visible).every(Boolean));
});

test('preserves valid order, removes duplicates and unknown ids', () => {
    const layout = normalizeDashboardLayout({ order: ['week', 'daily', 'daily', 'unknown'] });
    assert.deepEqual(layout.order, ['week', 'daily', 'status', 'recommendation', 'wearables', 'race']);
});

test('allows hiding individual sections without affecting other defaults', () => {
    const layout = normalizeDashboardLayout({ visible: { wearables: false, week: false } });
    assert.equal(layout.visible.wearables, false);
    assert.equal(layout.visible.week, false);
    assert.equal(layout.visible.status, true);
});

test('individual performance and wearable metrics default to visible', () => {
    const layout = normalizeDashboardLayout({});
    assert.equal(layout.metrics.readiness, true);
    assert.equal(layout.metrics.fitness, true);
    assert.equal(layout.metrics.hrv, true);
});

test('allows hiding an individual metric independently from its section', () => {
    const layout = normalizeDashboardLayout({ visible: { status: true }, metrics: { readiness: false } });
    assert.equal(layout.visible.status, true);
    assert.equal(layout.metrics.readiness, false);
    assert.equal(layout.metrics.fitness, true);
});
