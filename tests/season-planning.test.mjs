import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeSeasonPlan,
    validateSeasonPlan,
    buildSeasonPlanningContext,
    normalizeWeeklyPlan,
    validateWeeklyPlan
} from '../js/season-planning.js';
import { buildCoachRequestContext } from '../js/coach-data-context.js';

const validPlan = {
    schemaVersion: 1,
    id: 'season-2027',
    name: 'Saison 2027',
    planningMode: 'hybrid',
    planningHorizon: 'season',
    status: 'draft',
    startDate: '2027-01-01',
    endDate: '2027-10-31',
    primaryGoal: 'Leistungsentwicklung und Vorbereitung auf die Saisonhöhepunkte',
    secondaryGoals: ['C1-Leistung verbessern'],
    phases: [
        {
            id: 'base',
            name: 'Allgemeine Vorbereitung',
            type: 'preparation',
            startDate: '2027-01-01',
            endDate: '2027-03-31',
            objective: 'Grundlagen entwickeln',
            focus: ['Ausdauer', 'Kraft'],
            targetHoursPerWeek: 10,
            targetTrainingDaysPerWeek: 6,
            targetSessionsPerDay: 2,
            disciplineFocus: ['K1', 'C1']
        },
        {
            id: 'specific',
            name: 'Wettkampfspezifische Vorbereitung',
            type: 'specific',
            startDate: '2027-04-01',
            endDate: '2027-06-30',
            objective: 'Spezifische Leistungsfähigkeit entwickeln',
            focus: ['Classic', 'Sprint']
        }
    ]
};

test('normalizes the hybrid season plan and defaults to season horizon', () => {
    const plan = normalizeSeasonPlan({ ...validPlan, planningMode: 'unknown', planningHorizon: 'unknown' });
    assert.equal(plan.planningMode, 'hybrid');
    assert.equal(plan.planningHorizon, 'season');
    assert.equal(plan.phases.length, 2);
    assert.equal(plan.phases[0].targetHoursPerWeek, 10);
});

test('accepts valid season phases and rejects overlapping phases', () => {
    assert.equal(validateSeasonPlan(validPlan).valid, true);
    const invalid = structuredClone(validPlan);
    invalid.phases[1].startDate = '2027-03-30';
    const result = validateSeasonPlan(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('nicht überschneiden')));
});

test('rejects phase dates outside the season and invalid weekly targets', () => {
    const invalid = structuredClone(validPlan);
    invalid.phases[0].startDate = '2026-12-31';
    invalid.phases[0].targetTrainingDaysPerWeek = 8;
    const result = validateSeasonPlan(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('vor der Saison')));
    assert.ok(result.errors.some(error => error.includes('höchstens 7')));
});

test('season planning context includes only dated competitions and preserves unknown priorities', () => {
    const context = buildSeasonPlanningContext(validPlan, [
        { name: 'Weltcup', date: '2027-05-15', prio: 'B', location: 'Solkan' },
        { name: 'Ohne Datum', prio: 'A' },
        { name: 'Rennen mit unbekannter Priorität', date: '2027-06-01', prio: 'X' }
    ]);
    assert.equal(context.available, true);
    assert.equal(context.planningMode, 'hybrid');
    assert.equal(context.planningHorizon, 'season');
    assert.deepEqual(context.competitions.map(race => race.priority), ['B', null]);
});

test('Coach receives season plan and competition context; no plan is explicitly marked unavailable', () => {
    const context = buildCoachRequestContext({
        seasonPlan: validPlan,
        races: [{ name: 'A-Wettkampf', date: '2027-05-15', prio: 'A' }]
    }, 'Erstelle meine Saisonplanung');
    assert.equal(context.seasonPlanning.available, true);
    assert.equal(context.seasonPlanning.season.primaryGoal, validPlan.primaryGoal);
    assert.equal(context.seasonPlanning.competitions[0].priority, 'A');

    const emptyContext = buildCoachRequestContext({}, 'Wie sieht meine Saisonplanung aus?');
    assert.equal(emptyContext.seasonPlanning.available, false);
    assert.equal(emptyContext.seasonPlanning.planningMode, 'hybrid');
});

const approvedSeason = {
    ...validPlan,
    status: 'active',
    athleteApprovedAt: '2026-11-19T10:00:00.000Z',
    phases: [{
        id: 'base', name: 'Grundlagen', type: 'preparation',
        startDate: '2027-01-04', endDate: '2027-03-28',
        objective: 'Grundlagen entwickeln', focus: ['Ausdauer']
    }]
};
const validWeek = {
    id: 'week-2027-01-04',
    weekStartDate: '2027-01-04',
    weekEndDate: '2027-01-10',
    phaseId: 'base',
    status: 'draft',
    objective: 'Aerobe Grundlage und technische Stabilität',
    focus: ['Grundlagenausdauer', 'Technik'],
    sessions: [{
        id: 'session-1', date: '2027-01-04', name: 'K1 Grundlagen',
        type: 'Kayaking', category: 'GA', durationMinutes: 75,
        discipline: 'K1', objective: 'Ruhige, gleichmäßige Belastung'
    }]
};

test('normalizes and validates a weekly draft only inside an approved season phase', () => {
    const normalized = normalizeWeeklyPlan(validWeek);
    assert.equal(normalized.sessions[0].durationMinutes, 75);
    assert.equal(validateWeeklyPlan(validWeek, approvedSeason).valid, true);
    assert.equal(validateWeeklyPlan(validWeek, validPlan).valid, false);
});

test('rejects weekly plans with invalid week boundaries, phase placement or session dates', () => {
    const invalid = structuredClone(validWeek);
    invalid.weekEndDate = '2027-01-09';
    invalid.sessions[0].date = '2027-01-11';
    const result = validateWeeklyPlan(invalid, approvedSeason);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('sieben Kalendertage')));
    assert.ok(result.errors.some(error => error.includes('außerhalb der geplanten Woche')));
});

test('weekly plan normalization remains backward compatible with older season records', () => {
    const plan = normalizeSeasonPlan(validPlan);
    assert.deepEqual(plan.weeklyPlans, []);
});
