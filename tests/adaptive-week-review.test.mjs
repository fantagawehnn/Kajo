import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveWeekReview } from '../js/adaptive-week-review.js';

const plan = {
    weekStartDate: '2026-11-16',
    weekEndDate: '2026-11-22',
    status: 'approved',
    sessions: [
        { id: 'p1', date: '2026-11-16', name: 'K1 locker', type: 'Kayaking', discipline: 'K1' },
        { id: 'p2', date: '2026-11-17', name: 'C1 Technik', type: 'C1', discipline: 'C1' },
        { id: 'p3', date: '2026-11-18', name: 'Kraft', type: 'WeightTraining' },
        { id: 'p4', date: '2026-11-21', name: 'K1 Intervalle', type: 'Kayaking', discipline: 'K1' }
    ]
};

test('matches only unique same-day same-sport activity', () => {
    const review = buildAdaptiveWeekReview(plan, [
        { date: '2026-11-16', type: 'Kayaking', name: 'Paddeln' },
        { date: '2026-11-17', type: 'C1', name: 'C1 Training' }
    ], '2026-11-19');
    assert.equal(review.matched.length, 2);
    assert.equal(review.unmatchedPlanned.length, 1);
    assert.equal(review.unmatchedPlanned[0].session.id, 'p3');
    assert.equal(review.upcoming.length, 1);
    assert.equal(review.upcoming[0].id, 'p4');
});

test('does not guess when multiple actual activities could match', () => {
    const review = buildAdaptiveWeekReview(plan, [
        { date: '2026-11-16', type: 'Kayaking', name: 'Paddeln 1' },
        { date: '2026-11-16', type: 'Kayaking', name: 'Paddeln 2' }
    ], '2026-11-19');
    assert.equal(review.matched.length, 0);
    assert.equal(review.ambiguous.length, 1);
    assert.equal(review.unplannedActivities.length, 2);
});

test('does not label unmatched planned sessions as missed', () => {
    const review = buildAdaptiveWeekReview(plan, [], '2026-11-19');
    assert.match(review.unmatchedPlanned[0].reason, /nicht automatisch als ausgefallen/);
});

test('leaves unknown sport types unmatched instead of guessing', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [{ date: '2026-11-16', name: 'Unbekannt', type: 'Other' }]
    }, [{ date: '2026-11-16', type: 'Other' }], '2026-11-19');
    assert.equal(review.matched.length, 0);
    assert.equal(review.unmatchedPlanned.length, 1);
    assert.equal(review.unplannedActivities.length, 1);
});
