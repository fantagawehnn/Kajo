import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeeklyPlanCalendarEntries, calendarTypeForSession } from '../js/weekly-plan-calendar.js';

const plan = {
    id: 'week-2027-01-04',
    sessions: [
        { id: 's1', date: '2027-01-05', name: 'K1 Technik', type: 'Kayaking', discipline: 'K1', durationMinutes: 65, category: 'tech', objective: 'Technik', warmup: 'Einpaddeln', mainSet: 'Technikserien', cooldown: 'Locker' },
        { id: 's2', date: '2027-01-06', name: 'C1 Intervalle', type: 'Kayaking', discipline: 'C1', durationMinutes: 60, category: 'interval', mainSet: 'Intervalle' },
        { id: 's3', date: '2027-01-07', name: 'Unklar', type: 'Canoe', discipline: '', durationMinutes: 40 },
        { id: 's4', date: '2027-01-08', name: 'Ruhetag', type: 'RestDay', category: 'rest', durationMinutes: null }
    ]
};

test('maps canoe discipline before generic activity type', () => {
    assert.equal(calendarTypeForSession({ type: 'Kayaking', discipline: 'C1' }), 'C1');
    assert.equal(calendarTypeForSession({ type: 'Kayaking', discipline: 'K1' }), 'Kayaking');
    assert.equal(calendarTypeForSession({ type: 'Canoe' }), null);
});

test('creates planned entries with workout content and no invented load', () => {
    const { additions, skipped } = buildWeeklyPlanCalendarEntries(plan, []);
    assert.equal(additions.length, 3);
    assert.equal(skipped.length, 1);
    assert.equal(additions[0].type, 'Kayaking');
    assert.equal(additions[1].type, 'C1');
    assert.equal(additions[2].type, 'RestDay');
    assert.equal(additions[2].duration, null);
    assert.equal(additions[2].category, 'rest');
    assert.equal(additions[0].targetTss, null);
    assert.match(additions[0].desc, /Hauptteil: Technikserien/);
    assert.equal(additions[0].sourceWeeklyPlanId, plan.id);
});

test('does not import a linked or identical existing calendar entry twice', () => {
    const existing = [
        { sourceWeeklyPlanId: plan.id, sourceWeeklySessionId: 's1' },
        { date: '2027-01-06', name: 'C1 Intervalle', type: 'C1' },
        { date: '2027-01-08', name: 'Ruhetag', type: 'RestDay' }
    ];
    const { additions, skipped } = buildWeeklyPlanCalendarEntries(plan, existing);
    assert.equal(additions.length, 0);
    assert.equal(skipped.length, 4);
});

test('does not create duplicate entries repeated within the same weekly draft', () => {
    const duplicatePlan = {
        ...plan,
        sessions: [
            ...plan.sessions.slice(0, 1),
            { ...plan.sessions[0], id: 's1-copy' }
        ]
    };
    const { additions, skipped } = buildWeeklyPlanCalendarEntries(duplicatePlan, []);
    assert.equal(additions.length, 1);
    assert.equal(skipped.length, 1);
});
