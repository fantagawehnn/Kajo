import test from 'node:test';
import assert from 'node:assert/strict';
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
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'season-plan-user' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
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
        planningMode: 'hybrid',
        season: {
            id: 'season-1',
            name: 'Saison 2027',
            startDate: '2027-01-01',
            endDate: '2027-12-31',
            primaryGoal: 'Internationale Saisonhöhepunkte'
        }
    }
};

test('season proposal returns validated consecutive phases without generated workload targets', async (t) => {
    const aiResponse = JSON.stringify({
        status: 'ready',
        rationale: 'Die Phasen orientieren sich an den eingetragenen Saisonrahmen.',
        openQuestions: ['Welche Wettkämpfe sind A-Priorität?'],
        phases: [
            { name: 'Grundlagen', type: 'Aufbau', startDate: '2027-01-01', endDate: '2027-03-31', objective: 'Grundlagen entwickeln', focus: ['Ausdauer', 'Technik'], disciplineFocus: ['K1'] },
            { name: 'Spezifische Vorbereitung', type: 'spezifisch', startDate: '2027-04-01', endDate: '2027-06-30', objective: 'Wettkampfspezifik entwickeln', focus: ['Pacing', 'Technik'], disciplineFocus: ['K1', 'C1'] },
            { name: 'Wettkampfphase', type: 'Wettkampf', startDate: '2027-07-01', endDate: '2027-10-31', objective: 'Leistung abrufen', focus: ['Wettkampf'], disciplineFocus: ['K1'] },
            { name: 'Übergang', type: 'Übergang', startDate: '2027-11-01', endDate: '2027-12-31', objective: 'Saison reflektieren', focus: ['Regeneration'], disciplineFocus: [] }
        ]
    });
    const response = await worker.fetch(makeRequest({
        task: 'season_plan_proposal',
        question: 'Erstelle einen Saisonplan.',
        context
    }), authorizedEnv(t, aiResponse));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.proposal.status, 'ready');
    assert.equal(payload.proposal.phases.length, 4);
    assert.equal(payload.proposal.phases[0].startDate, '2027-01-01');
    assert.equal(payload.proposal.phases[3].endDate, '2027-12-31');
    assert.equal(payload.proposal.phases[0].targetHoursPerWeek, null);
    assert.equal(payload.proposal.phases[0].targetTrainingDaysPerWeek, null);
});

test('season proposal rejects overlapping or incomplete phase coverage', async (t) => {
    const aiResponse = JSON.stringify({
        status: 'ready',
        rationale: 'Vorschlag',
        openQuestions: [],
        phases: [
            { name: 'Phase A', type: 'Aufbau', startDate: '2027-01-01', endDate: '2027-07-01', objective: 'Ziel A' },
            { name: 'Phase B', type: 'Wettkampf', startDate: '2027-06-30', endDate: '2027-12-31', objective: 'Ziel B' }
        ]
    });
    const response = await worker.fetch(makeRequest({
        task: 'season_plan_proposal',
        question: 'Erstelle einen Saisonplan.',
        context
    }), authorizedEnv(t, aiResponse));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /zeitlich nicht konsistent/);
});

test('season proposal reports missing information without creating phases', async (t) => {
    const aiResponse = JSON.stringify({
        status: 'needs_input',
        rationale: 'Die Wettkampfprioritäten fehlen.',
        openQuestions: ['Welche Wettkämpfe sind deine Saisonhöhepunkte?'],
        phases: []
    });
    const response = await worker.fetch(makeRequest({
        task: 'season_plan_proposal',
        question: 'Erstelle einen Saisonplan.',
        context
    }), authorizedEnv(t, aiResponse));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.proposal.status, 'needs_input');
    assert.equal(payload.proposal.phases.length, 0);
    assert.equal(payload.proposal.openQuestions.length, 1);
});

test('season proposal refuses when season dates or goal are missing', async (t) => {
    const response = await worker.fetch(makeRequest({
        task: 'season_plan_proposal',
        question: 'Erstelle einen Saisonplan.',
        context: { seasonPlanning: { season: { startDate: null, endDate: null, primaryGoal: null } } }
    }), authorizedEnv(t, JSON.stringify({ status: 'needs_input', rationale: 'Daten fehlen', openQuestions: [], phases: [] })));
    assert.equal(response.status, 400);
});
