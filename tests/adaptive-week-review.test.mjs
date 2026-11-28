import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveWeekReview, areSameAdaptiveSports } from '../js/adaptive-week-review.js';

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

test('prefers explicit canoe discipline over a generic activity type', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [{ id: 'c1-plan', date: '2026-11-16', name: 'C1', type: 'Kayaking', discipline: 'C1' }]
    }, [{ date: '2026-11-16', type: 'Kayaking', discipline: 'C1', name: 'C1 paddling' }], '2026-11-19');
    assert.equal(review.matched.length, 1);
    assert.equal(review.matched[0].planned.id, 'c1-plan');
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

test('manual link overrides ambiguous auto matching and excludes linked activity from unplanned list', () => {
    const activities = [
        { id: 'a1', date: '2026-11-16', type: 'Kayaking', name: 'Paddeln 1' },
        { id: 'a2', date: '2026-11-16', type: 'Kayaking', name: 'Paddeln 2' }
    ];
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [{ id: 'p1', date: '2026-11-16', name: 'K1 locker', type: 'Kayaking', discipline: 'K1' }],
        manualActivityLinks: [{ sessionId: 'p1', activityId: 'a2' }]
    }, activities, '2026-11-19');
    assert.equal(review.matched.length, 1);
    assert.equal(review.matched[0].matchType, 'manual');
    assert.equal(review.matched[0].actual.id, 'a2');
    assert.deepEqual(review.unplannedActivities.map(item => item.activity.id), ['a1']);
    assert.equal(review.ambiguous.length, 0);
});

test('manual links ignore duplicate activity use and invalid session/date references', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [
            { id: 'p1', date: '2026-11-16', name: 'K1 locker', type: 'Kayaking', discipline: 'K1' },
            { id: 'p2', date: '2026-11-16', name: 'K1 Technik', type: 'Kayaking', discipline: 'K1' }
        ],
        manualActivityLinks: [
            { sessionId: 'p1', activityId: 'a1' }, { sessionId: 'p2', activityId: 'a1' },
            { sessionId: 'missing', activityId: 'a2' }, { sessionId: 'p2', activityId: 'outside' }
        ]
    }, [
        { id: 'a1', date: '2026-11-16', type: 'Kayaking' },
        { id: 'outside', date: '2026-11-17', type: 'Kayaking' }
    ], '2026-11-19');
    assert.equal(review.manualLinks.length, 1);
    assert.equal(review.manualLinks[0].sessionId, 'p1');
});

test('removing a manual link returns activity to automatic matching', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [{ id: 'p1', date: '2026-11-16', name: 'K1 locker', type: 'Kayaking', discipline: 'K1' }],
        manualActivityLinks: []
    }, [{ id: 'a1', date: '2026-11-16', type: 'Kayaking' }], '2026-11-19');
    assert.equal(review.matched.length, 1);
    assert.equal(review.matched[0].matchType, 'automatic');
});

test('manual completed-without-import and missed statuses are distinct and remove sessions from unresolved list', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        manualSessionStatuses: [
            { sessionId: 'p1', status: 'completed_unrecorded' },
            { sessionId: 'p2', status: 'missed' },
            { sessionId: 'p4', status: 'missed' }
        ]
    }, [], '2026-11-19');
    assert.equal(review.completedWithoutActivity.length, 1);
    assert.equal(review.completedWithoutActivity[0].session.id, 'p1');
    assert.equal(review.missed.length, 1);
    assert.equal(review.missed[0].session.id, 'p2');
    assert.equal(review.unmatchedPlanned.length, 1);
    assert.equal(review.unmatchedPlanned[0].session.id, 'p3');
    assert.equal(review.upcoming.length, 1);
    assert.equal(review.upcoming[0].id, 'p4');
});

test('explicit manual status overrides same-day automatic matching; invalid statuses are ignored', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        manualSessionStatuses: [
            { sessionId: 'p1', status: 'missed' },
            { sessionId: 'p2', status: 'unknown' }
        ]
    }, [{ id: 'a1', date: '2026-11-16', type: 'Kayaking' }], '2026-11-19');
    assert.equal(review.matched.length, 0);
    assert.equal(review.completedWithoutActivity.length, 0);
    assert.equal(review.missed.length, 1);
    assert.equal(review.missed[0].session.id, 'p1');
    assert.deepEqual(review.unplannedActivities.map(item => item.activity.id), ['a1']);
    assert.equal(review.unmatchedPlanned.length, 2);
});


test('manual activity links require the same identifiable sport', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [{ id: 'p1', date: '2026-11-16', name: 'K1 locker', type: 'Kayaking', discipline: 'K1' }],
        manualActivityLinks: [{ sessionId: 'p1', activityId: 'run1' }]
    }, [{ id: 'run1', date: '2026-11-16', type: 'Run', name: 'Easy run' }], '2026-11-19');
    assert.equal(review.matched.length, 0);
    assert.equal(review.manualLinks.length, 0);
    assert.equal(review.unmatchedPlanned.length, 1);
    assert.equal(review.unplannedActivities.length, 1);
});

test('sport comparison accepts equivalent aliases but rejects unknown sports', () => {
    assert.equal(areSameAdaptiveSports({ discipline: 'C1', type: 'Kayaking' }, { type: 'Kayaking', discipline: 'C1' }), true);
    assert.equal(areSameAdaptiveSports({ discipline: 'K1', type: 'Kayaking' }, { type: 'Run' }), false);
    assert.equal(areSameAdaptiveSports({ type: 'Other' }, { type: 'Other' }), false);
});

test('excludes rest days from training review, unresolved sessions and upcoming workouts', () => {
    const review = buildAdaptiveWeekReview({
        ...plan,
        sessions: [
            { id: 'rest-past', date: '2026-11-16', name: 'Ruhetag', type: 'RestDay', category: 'rest' },
            { id: 'rest-future', date: '2026-11-22', name: 'Ruhetag', type: 'rest' },
            { id: 'training', date: '2026-11-17', name: 'C1 Technik', type: 'C1', discipline: 'C1' }
        ],
        manualSessionStatuses: [{ sessionId: 'rest-past', status: 'missed' }]
    }, [], '2026-11-19');
    assert.equal(review.unmatchedPlanned.length, 1);
    assert.equal(review.unmatchedPlanned[0].session.id, 'training');
    assert.equal(review.upcoming.length, 0);
    assert.equal(review.missed.length, 0);
    assert.equal(review.coverage.unconfirmedPastPlanCount, 1);
    assert.equal(review.coverage.upcomingCount, 0);
});
