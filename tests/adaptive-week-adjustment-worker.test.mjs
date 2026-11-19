import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

function makeRequest(body) {
    return new Request('https://kajo.example/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify(body)
    });
}

function authorizedEnv(t, aiResponse) {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'adaptive-user' }), {
        status: 200, headers: { 'content-type': 'application/json' }
    });
    return {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => ({ success: true }) },
        AI: { run: async () => ({ response: JSON.stringify(aiResponse) }) }
    };
}

const context = {
    seasonPlanning: {
        status: 'active',
        season: { id: 'season-2027', athleteApprovedAt: '2026-11-19T10:00:00.000Z' }
    },
    weeklyPlanning: {
        currentDate: '2027-01-06',
        targetWeek: { weekStartDate: '2027-01-04', weekEndDate: '2027-01-10' },
        approvedWeeklyPlan: {
            id: 'week-2027-01-04', status: 'approved',
            athleteApprovedAt: '2027-01-01T10:00:00.000Z',
            weekStartDate: '2027-01-04', weekEndDate: '2027-01-10',
            sessions: [
                { id: 'future-k1', date: '2027-01-08', name: 'K1 Intervalle', type: 'Kayaking', discipline: 'K1', durationMinutes: 60, intensity: 'intensiv' },
                { id: 'future-c1', date: '2027-01-09', name: 'C1 Technik', type: 'C1', discipline: 'C1', durationMinutes: 60 },
                { id: 'matched', date: '2027-01-08', name: 'K1 locker', type: 'Kayaking', discipline: 'K1', durationMinutes: 45 }
            ]
        },
        matchedSessionIds: ['matched'],
        ambiguousSessionIds: [],
        futureSessions: [
            { id: 'future-k1', date: '2027-01-08' },
            { id: 'future-c1', date: '2027-01-09' }
        ],
        review: { coverage: { matchedCount: 1 } }
    },
    recovery: { dailyCheckIns: [{ date: '2027-01-06', garminHrv: 65, garminRhr: 51 }] },
    health: { documentedEvents: [] }
};

const proposal = {
    status: 'ready',
    rationale: 'Die verbleibenden Einheiten werden an die aktuelle Erholung angepasst.',
    openQuestions: [],
    changes: [
        { sessionId: 'future-k1', action: 'reduce', rationale: 'Die Belastung der letzten Tage spricht für eine reduzierte Intensität.', updatedSession: {
            date: '2027-01-08', name: 'K1 locker und technisch', type: 'Kayaking', category: 'GA',
            discipline: 'K1', durationMinutes: 45, intensity: 'locker', objective: 'Technikqualität und lockere Bewegung'
        }},
        { sessionId: 'future-c1', action: 'keep', rationale: 'Für diese Einheit ergeben sich keine belastbaren Gründe für eine Änderung.', updatedSession: null }
    ]
};

test('adaptive proposal returns only validated future-session decisions', async t => {
    const response = await worker.fetch(makeRequest({
        task: 'adaptive_week_adjustment', question: 'Prüfe die verbleibende Woche', context
    }), authorizedEnv(t, proposal));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.proposal.status, 'ready');
    assert.equal(body.proposal.changes.length, 2);
    assert.equal(body.proposal.changes[0].sessionId, 'future-k1');
    assert.equal(body.proposal.changes[0].updatedSession.durationMinutes, 45);
    assert.equal(body.proposal.changes[1].action, 'keep');
});

test('adaptive proposal cannot change a completed or matched session', async t => {
    const invalid = structuredClone(proposal);
    invalid.changes[0].sessionId = 'matched';
    const response = await worker.fetch(makeRequest({
        task: 'adaptive_week_adjustment', question: 'Prüfe die verbleibende Woche', context
    }), authorizedEnv(t, invalid));
    assert.equal(response.status, 502);
});

test('adaptive proposal rejects past dates and C1 sessions longer than 75 minutes', async t => {
    const past = structuredClone(proposal);
    past.changes[0].updatedSession.date = '2027-01-05';
    const pastResponse = await worker.fetch(makeRequest({
        task: 'adaptive_week_adjustment', question: 'Prüfe die verbleibende Woche', context
    }), authorizedEnv(t, past));
    assert.equal(pastResponse.status, 502);

    const longC1 = structuredClone(proposal);
    longC1.changes[1] = {
        sessionId: 'future-c1', action: 'modify', rationale: 'Test',
        updatedSession: { date: '2027-01-09', name: 'C1 lang', type: 'C1', discipline: 'C1', durationMinutes: 80 }
    };
    const response = await worker.fetch(makeRequest({
        task: 'adaptive_week_adjustment', question: 'Prüfe die verbleibende Woche', context
    }), authorizedEnv(t, longC1));
    assert.equal(response.status, 502);
});

test('adaptive proposal reports missing information without changes', async t => {
    const response = await worker.fetch(makeRequest({
        task: 'adaptive_week_adjustment', question: 'Prüfe die verbleibende Woche', context
    }), authorizedEnv(t, {
        status: 'needs_input', rationale: 'Eine aktuelle Rückmeldung fehlt.',
        openQuestions: ['Wie fühlst du dich heute?'], changes: []
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.proposal.status, 'needs_input');
    assert.deepEqual(body.proposal.changes, []);
});
