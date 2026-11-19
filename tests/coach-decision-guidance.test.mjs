import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachDecisionGuidance } from '../js/coach-decision-guidance.js';

test('Coach guidance defines distinct units for HRV and resting heart rate', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.equal(guidance.metricSemantics.hrv.unit, 'ms');
    assert.equal(guidance.metricSemantics.rhr.unit, 'bpm');
    assert.equal(guidance.metricSemantics.garminRhr.unit, 'bpm');
    assert.match(guidance.metricSemantics.hrv.rule, /niemals mit bpm/);
});

test('negative TSB alone must not trigger an automatic rest day', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.ok(guidance.dailyTrainingDecision.some(rule => /negativer TSB-Wert.*kein automatischer Grund/.test(rule)));
    assert.ok(guidance.dailyTrainingDecision.some(rule => /vollständigem Ruhetag/.test(rule)));
});

test('single wearable values cannot determine training readiness', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.ok(guidance.dailyTrainingDecision.some(rule => /Einzelne HRV- oder Ruheherzfrequenzwerte entscheiden nie allein/.test(rule)));
    assert.ok(guidance.dailyTrainingDecision.some(rule => /Body-Battery- oder Garmin-Stress-Werte/.test(rule)));
});

test('coach must not invent competition or test dates', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.ok(guidance.competitionAndDates.some(rule => /Erfinde oder erschließe keine Termine/.test(rule)));
});

test('health and safety rules retain priority over performance', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.equal(guidance.decisionPriority[0], 'Gesundheit und Sicherheit');
    assert.ok(guidance.healthAndSafety.some(rule => /Fieber/.test(rule)));
});


test('Coach guidance requires source-aware HRV in ms and resting heart rate in bpm', () => {
    const guidance = buildCoachDecisionGuidance();
    assert.match(guidance.metricSemantics.hrv.rule, /measurementSources\.hrv\.unit = ms/);
    assert.match(guidance.metricSemantics.hrv.rule, /garminHrv hat Vorrang/);
    assert.match(guidance.responseFormat.join(' '), /hrvMs/);
    assert.match(guidance.responseFormat.join(' '), /rhrBpm/);
});
