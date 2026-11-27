import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readinessZone,
  classifyPersonalMetric,
  classifySleepDuration,
  classifyGarminSleepScore,
  classifySubjective,
  classifyTrainingBalance,
  classifyAcwr,
  inferSeasonPhaseCategory,
  getSeasonPhaseTargets,
  getSeasonPhaseForDate
} from '../js/metric-zones.js';

test('readiness keeps its existing four thresholds and maps them to five-zone colors', () => {
  assert.equal(readinessZone(90).zone, 5);
  assert.equal(readinessZone(70).zone, 4);
  assert.equal(readinessZone(50).zone, 2);
  assert.equal(readinessZone(30).zone, 1);
  assert.equal(readinessZone(null).zone, undefined);
});

test('personal metrics use existing individual reference bands', () => {
  const baseline = Array(12).fill(60);
  assert.equal(classifyPersonalMetric('hrv', 60, baseline).zone, 4);
  assert.equal(classifyPersonalMetric('hrv', 56, baseline).zone, 2);
  assert.equal(classifyPersonalMetric('hrv', 53, baseline).zone, 1);
  assert.equal(classifyPersonalMetric('hrv', 60, []).zone, undefined);
});

test('sleep duration preserves the existing 30, 60 and 90 minute bands', () => {
  const baseline = Array(12).fill(8);
  assert.equal(classifySleepDuration(7.7, baseline).zone, 4);
  assert.equal(classifySleepDuration(7.4, baseline).zone, 3);
  assert.equal(classifySleepDuration(6.8, baseline).zone, 2);
  assert.equal(classifySleepDuration(6.4, baseline).zone, 1);
  assert.equal(classifySleepDuration(7.5, []).zone, undefined);
});

test('Garmin sleep score uses Garmin category boundaries', () => {
  assert.equal(classifyGarminSleepScore(95).zone, 5);
  assert.equal(classifyGarminSleepScore(85).zone, 4);
  assert.equal(classifyGarminSleepScore(70).zone, 3);
  assert.equal(classifyGarminSleepScore(50).zone, 1);
});

test('subjective ratings keep their three existing categories', () => {
  assert.equal(classifySubjective('fatigue', 1).zone, 4);
  assert.equal(classifySubjective('fatigue', 3).zone, 3);
  assert.equal(classifySubjective('fatigue', 5).zone, 1);
  assert.equal(classifySubjective('fatigue', null).zone, undefined);
});

test('season phase is inferred from free-text phase metadata', () => {
  assert.equal(inferSeasonPhaseCategory({ name: 'Grundlagenaufbau' }), 'build');
  assert.equal(inferSeasonPhaseCategory({ type: 'Wettkampf' }), 'competition');
  assert.equal(inferSeasonPhaseCategory({ objective: 'aktive Regeneration' }), 'recovery');
  assert.equal(inferSeasonPhaseCategory({ focus: ['spezifische Intensität'] }), 'specific');
  assert.equal(inferSeasonPhaseCategory({ name: 'Unklar' }), 'unknown');
});

test('phase targets are automatic by phase and can be overridden manually', () => {
  const build = getSeasonPhaseTargets({ name: 'Grundlagenaufbau' });
  assert.deepEqual(build.acwr, [0.8, 1.3]);
  assert.deepEqual(build.tsb, [-25, 5]);
  const manual = getSeasonPhaseTargets({ name: 'Wettkampf', acwrTargetMin: 0.9, acwrTargetMax: 1.2, tsbTargetMin: 4, tsbTargetMax: 18 });
  assert.deepEqual(manual.acwr, [0.9, 1.2]);
  assert.deepEqual(manual.tsb, [4, 18]);
  assert.equal(manual.source, 'manual');
});

test('phase date lookup requires exactly one matching phase', () => {
  const plan = { phases: [{ id: 'a', startDate: '2026-01-01', endDate: '2026-01-31' }] };
  assert.equal(getSeasonPhaseForDate(plan, '2026-01-15').id, 'a');
  assert.equal(getSeasonPhaseForDate(plan, '2026-02-01'), null);
  assert.equal(getSeasonPhaseForDate({ phases: [...plan.phases, ...plan.phases] }, '2026-01-15'), null);
});

test('phase-aware classifiers do not invent a zone without a phase', () => {
  assert.equal(classifyAcwr(1.0).zone, undefined);
  assert.equal(classifyTrainingBalance(-5, 'relative').zone, undefined);
  const targets = getSeasonPhaseTargets({ name: 'Wettkampf' });
  assert.equal(classifyAcwr(1.0, targets).zone, 4);
  assert.equal(classifyTrainingBalance(8, 'relative', targets).zone, 4);
  assert.equal(classifyAcwr(1.7, targets).zone, 1);
});

test('ACWR requires a phase target and classifies relative to it', () => {
  assert.equal(classifyAcwr(1.0).zone, undefined);
  const targets = getSeasonPhaseTargets({ name: 'Wettkampf' });
  assert.equal(classifyAcwr(0.7, targets).zone, 2);
  assert.equal(classifyAcwr(1.0, targets).zone, 4);
  assert.equal(classifyAcwr(1.4, targets).zone, 2);
  assert.equal(classifyAcwr(1.6, targets).zone, 1);
  assert.equal(classifyAcwr(null, targets).zone, undefined);
});

test('absolute TSB without a validated general zone remains neutral', () => {
  assert.equal(classifyTrainingBalance(-20, 'unclassified').status, 'info');
  assert.equal(classifyTrainingBalance(-20, 'unclassified').zone, undefined);
});
