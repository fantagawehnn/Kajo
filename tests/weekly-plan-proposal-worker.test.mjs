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
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'weekly-plan-user' }), {
        status: 200, headers: { 'content-type': 'application/json' }
    });
    return {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => ({ success: true }) },
        AI: { run: async () => ({ response: aiResponse }) }
    };
}

const context = {
    seasonPlanning: {
        status: 'active',
        planningMode: 'hybrid',
        season: {
            id: 'season-2027', startDate: '2027-01-01', endDate: '2027-12-31',
            primaryGoal: 'Internationale Saisonhöhepunkte',
            athleteApprovedAt: '2026-11-19T10:00:00.000Z'
        },
        phases: [{
            id: 'base', name: 'Grundlagenphase', type: 'Aufbau',
            startDate: '2027-01-04', endDate: '2027-03-28',
            objective: 'Grundlagen entwickeln', focus: ['Ausdauer']
        }]
    },
    weeklyPlanning: {
        targetWeek: { weekStartDate: '2027-01-04', weekEndDate: '2027-01-10', phaseId: 'base', phaseName: 'Grundlagenphase' },
        existingPlannedSessions: []
    },
    athlete: { sports: ['Kanu-Wildwasserrennsport'] },
    training: { activities: [], plannedSessions: [] },
    recovery: { dailyCheckIns: [] }
};

const readyProposal = {
    status: 'ready',
    rationale: 'Die Woche orientiert sich an der freigegebenen Grundlagenphase und den verfügbaren Daten.',
    openQuestions: [],
    objective: 'Aerobe Grundlage und technische Stabilität entwickeln',
    focus: ['Grundlagenausdauer', 'Technik'],
    sessions: [{
        date: '2027-01-05', name: 'K1 Technik und Grundlage', type: 'Kayaking',
        category: 'GA', discipline: 'K1', raceFormat: 'classic', waterType: 'flatwater',
        durationMinutes: 70, intensity: 'locker bis moderat',
        objective: 'Technische Effizienz unter gleichmäßiger Belastung',
        warmup: 'Ruhig einpaddeln', mainSet: 'Gleichmäßige Grundlagenarbeit mit Technikfokus',
        cooldown: 'Locker ausfahren', notes: 'Technikqualität priorisieren'
    }]
};

test('weekly proposal returns a validated draft without fabricated load targets', async t => {
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context
    }), authorizedEnv(t, JSON.stringify(readyProposal)));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.proposal.status, 'ready');
    assert.equal(payload.proposal.weeklyPlan.status, 'draft');
    assert.equal(payload.proposal.weeklyPlan.sessions[0].targetLoad, null);
    assert.equal(payload.proposal.weeklyPlan.sessions[0].date, '2027-01-05');
});

test('weekly proposal preserves valid structured workout steps and filters invalid durations', async t => {
    const proposal = structuredClone(readyProposal);
    proposal.sessions[0].steps = [
        { type: 'warmup', label: 'Einpaddeln', durationSeconds: 600, target: 'Locker' },
        { type: 'work', label: 'Belastung 1', durationSeconds: 180, target: 'Schwelle' },
        { type: 'recovery', label: 'Erholung 1', durationSeconds: 120, target: 'Sehr locker' },
        { type: 'work', label: 'Ungültiger Schritt', durationSeconds: 0, target: '' }
    ];
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context
    }), authorizedEnv(t, JSON.stringify(proposal)));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.proposal.weeklyPlan.sessions[0].steps.map(step => step.label), [
        'Einpaddeln', 'Belastung 1', 'Erholung 1'
    ]);
    assert.equal(payload.proposal.weeklyPlan.sessions[0].steps[1].durationSeconds, 180);
});

test('weekly proposal requires a complete Monday-to-Sunday week inside the approved phase', async t => {
    const invalidContext = structuredClone(context);
    invalidContext.weeklyPlanning.targetWeek.weekStartDate = '2027-01-05';
    invalidContext.weeklyPlanning.targetWeek.weekEndDate = '2027-01-11';
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context: invalidContext
    }), authorizedEnv(t, JSON.stringify(readyProposal)));
    assert.equal(response.status, 400);
});

test('weekly proposal rejects C1 sessions longer than 75 minutes', async t => {
    const proposal = structuredClone(readyProposal);
    proposal.sessions[0].discipline = 'C1';
    proposal.sessions[0].durationMinutes = 80;
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context
    }), authorizedEnv(t, JSON.stringify(proposal)));
    assert.equal(response.status, 502);
});

test('weekly proposal returns needs_input without creating sessions', async t => {
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context
    }), authorizedEnv(t, JSON.stringify({
        status: 'needs_input', rationale: 'Verfügbarkeit fehlt',
        openQuestions: ['Welche Tage kannst du trainieren?'], sessions: []
    })));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.proposal.status, 'needs_input');
    assert.deepEqual(payload.proposal.weeklyPlan, undefined);
    assert.equal(payload.proposal.openQuestions.length, 1);
});

test('weekly proposal refuses a season plan that has not been approved', async t => {
    const unapproved = structuredClone(context);
    unapproved.seasonPlanning.status = 'draft';
    const response = await worker.fetch(makeRequest({
        task: 'weekly_plan_proposal', question: 'Plane meine Trainingswoche', context: unapproved
    }), authorizedEnv(t, JSON.stringify(readyProposal)));
    assert.equal(response.status, 400);
});
