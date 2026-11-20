import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnalysisPreferences, ANALYSIS_PERIODS } from '../js/analysis-preferences.js';

test('uses the existing analysis defaults', () => {
  assert.deepEqual(normalizeAnalysisPreferences({}), {
    order: ['trend', 'distribution', 'period'],
    visible: { trend: true, distribution: true, period: true },
    metrics: { load: true, recovery: true, performance: true },
    defaultPeriod: '3m',
    activityMeasure: 'duration',
    performanceRange: '28d'
  });
});
test('normalizes order, visibility and invalid options', () => {
  assert.deepEqual(normalizeAnalysisPreferences({
    order: ['period', 'period', 'unknown'],
    visible: { trend: false, period: false },
    metrics: { load: false, recovery: false, performance: true },
    defaultPeriod: 'invalid', activityMeasure: 'pace'
  }), {
    order: ['period', 'trend', 'distribution'],
    visible: { trend: false, distribution: true, period: false },
    metrics: { load: false, recovery: false, performance: true },
    defaultPeriod: '3m', activityMeasure: 'duration', performanceRange: '28d'
  });
});
test('keeps at least one trend metric visible', () => {
  const normalized = normalizeAnalysisPreferences({ metrics: { load: false, recovery: false, performance: false } });
  assert.equal(normalized.metrics.load, true);
  assert.equal(Object.values(normalized.metrics).filter(Boolean).length, 1);
});
test('only accepts supported default periods', () => {
  assert.deepEqual(ANALYSIS_PERIODS, ['7d', '28d', '3m', '6m', '1y']);
  assert.equal(normalizeAnalysisPreferences({ defaultPeriod: '1y' }).defaultPeriod, '1y');
});

test('validates the independent performance detail range', () => {
  assert.equal(normalizeAnalysisPreferences({ performanceRange: '1y' }).performanceRange, '1y');
  assert.equal(normalizeAnalysisPreferences({ performanceRange: 'custom' }).performanceRange, '28d');
});
