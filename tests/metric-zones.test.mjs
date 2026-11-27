import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readinessZone,
  classifyPersonalMetric,
  classifySleepDuration,
  classifyGarminSleepScore,
  classifySubjective,
  classifyTrainingBalance,
  classifyAcwr
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

test('relative training balance keeps all five existing threshold bands', () => {
  assert.equal(classifyTrainingBalance(-26, 'relative').zone, 1);
  assert.equal(classifyTrainingBalance(-15, 'relative').zone, 2);
  assert.equal(classifyTrainingBalance(0, 'relative').zone, 3);
  assert.equal(classifyTrainingBalance(10, 'relative').zone, 4);
  assert.equal(classifyTrainingBalance(21, 'relative').zone, 2);
});

test('ACWR keeps existing non-safety interpretation bands', () => {
  assert.equal(classifyAcwr(0.7).zone, 2);
  assert.equal(classifyAcwr(1.0).zone, 3);
  assert.equal(classifyAcwr(1.4).zone, 2);
  assert.equal(classifyAcwr(1.6).zone, 1);
  assert.equal(classifyAcwr(null).zone, undefined);
});

test('absolute TSB without a validated general zone remains neutral', () => {
  assert.equal(classifyTrainingBalance(-20, 'unclassified').status, 'info');
  assert.equal(classifyTrainingBalance(-20, 'unclassified').zone, undefined);
});
