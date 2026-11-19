import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

function request(path = '/api/coach', options = {}) {
    return new Request(`https://kajo.example${path}`, options);
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

test('Coach endpoint rejects methods other than POST', async () => {
    const response = await worker.fetch(request('/api/coach', { method: 'GET' }), {});
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { error: 'Method not allowed.' });
});

test('Coach endpoint rejects a foreign Origin before processing credentials', async () => {
    const response = await worker.fetch(request('/api/coach', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
        body: JSON.stringify({})
    }), {});
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Origin not allowed.' });
});

test('Coach endpoint fails closed when Supabase verification is not configured', async () => {
    const response = await worker.fetch(request('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }), { AI: { run: async () => ({ response: 'unused' }) } });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Supabase/);
});

test('Coach endpoint requires a bearer access token', async () => {
    const response = await worker.fetch(request('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }), {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        AI: { run: async () => ({ response: 'unused' }) }
    });
    assert.equal(response.status, 401);
});

test('Coach endpoint rejects invalid sessions before rate limiting or AI execution', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async () => jsonResponse({ message: 'invalid token' }, 401);

    let rateLimitCalls = 0;
    let aiCalls = 0;
    const response = await worker.fetch(request('/api/coach', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer expired-token'
        },
        body: JSON.stringify({ question: 'Test', context: {} })
    }), {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => { rateLimitCalls++; return { success: true }; } },
        AI: { run: async () => { aiCalls++; return { response: 'unused' }; } }
    });

    assert.equal(response.status, 401);
    assert.equal(rateLimitCalls, 0);
    assert.equal(aiCalls, 0);
});

function authorizedEnv(t, overrides = {}) {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async () => jsonResponse({ id: 'user-123' });
    return {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => ({ success: true }) },
        AI: { run: async () => ({ response: 'Coach-Antwort' }) },
        ...overrides
    };
}

function validCoachRequest(body = { question: 'Wie war meine Trainingswoche?', context: {} }) {
    return request('/api/coach', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-token'
        },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}

test('Coach endpoint fails closed when the rate limiter is missing', async (t) => {
    const env = authorizedEnv(t);
    delete env.COACH_RATE_LIMITER;
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 503);
});

test('Coach endpoint fails closed when the rate limiter throws', async (t) => {
    const env = authorizedEnv(t, {
        COACH_RATE_LIMITER: { limit: async () => { throw new Error('binding unavailable'); } }
    });
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 503);
});

test('Coach endpoint returns 429 when the rate limit is exceeded', async (t) => {
    let aiCalls = 0;
    const env = authorizedEnv(t, {
        COACH_RATE_LIMITER: { limit: async () => ({ success: false }) },
        AI: { run: async () => { aiCalls++; return { response: 'unused' }; } }
    });
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 429);
    assert.equal(aiCalls, 0);
});

test('Coach endpoint rejects malformed JSON', async (t) => {
    const response = await worker.fetch(validCoachRequest('{invalid-json'), authorizedEnv(t));
    assert.equal(response.status, 400);
});

test('Coach endpoint rejects an oversized training context', async (t) => {
    const body = { question: 'Analysiere meine Daten', context: { data: 'x'.repeat(300_001) } };
    const response = await worker.fetch(validCoachRequest(body), authorizedEnv(t));
    assert.equal(response.status, 413);
});

test('Coach endpoint maps AI service failures to 502', async (t) => {
    const env = authorizedEnv(t, {
        AI: { run: async () => { throw new Error('upstream unavailable'); } }
    });
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 502);
});

test('Coach endpoint rejects an empty AI response', async (t) => {
    const env = authorizedEnv(t, { AI: { run: async () => ({ response: '  ' }) } });
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 502);
});

test('Coach endpoint returns the AI answer for an authenticated request', async (t) => {
    const response = await worker.fetch(validCoachRequest(), authorizedEnv(t));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Coach-Antwort' });
});

test('Coach endpoint handles an unreadable Supabase auth response', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async () => new Response('not-json', { status: 200 });
    const response = await worker.fetch(validCoachRequest(), {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => ({ success: true }) },
        AI: { run: async () => ({ response: 'unused' }) }
    });
    assert.equal(response.status, 502);
});

test('Coach endpoint times out a stalled Supabase auth verification', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let receivedSignal;
    globalThis.fetch = async (_url, options) => {
        receivedSignal = options.signal;
        throw new DOMException('The auth request timed out', 'TimeoutError');
    };
    const response = await worker.fetch(validCoachRequest(), {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-key',
        COACH_RATE_LIMITER: { limit: async () => ({ success: true }) },
        AI: { run: async () => ({ response: 'unused' }) }
    });
    assert.equal(receivedSignal instanceof AbortSignal, true);
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /zu lange gedauert/);
});

test('Coach endpoint fails closed when the AI binding is missing', async (t) => {
    const env = authorizedEnv(t);
    delete env.AI;
    const response = await worker.fetch(validCoachRequest(), env);
    assert.equal(response.status, 503);
});

test('Coach endpoint enforces the streamed request-size limit', async (t) => {
    let aiCalls = 0;
    const body = { question: 'Analysiere meine Daten', context: { data: 'x'.repeat(360_000) } };
    const env = authorizedEnv(t, {
        AI: { run: async () => { aiCalls++; return { response: 'unused' }; } }
    });
    const response = await worker.fetch(validCoachRequest(body), env);
    assert.equal(response.status, 413);
    assert.equal(aiCalls, 0);
});

test('Coach endpoint rejects a missing question and an invalid context shape', async (t) => {
    const env = authorizedEnv(t);
    const missingQuestion = await worker.fetch(validCoachRequest({ context: {} }), env);
    assert.equal(missingQuestion.status, 400);
    const invalidContext = await worker.fetch(validCoachRequest({ question: 'Test', context: [] }), env);
    assert.equal(invalidContext.status, 400);
});


test('Coach system rules enforce glossary, privacy exclusions and incomplete-data limits', async (t) => {
    let messages = [];
    const env = authorizedEnv(t, {
        AI: {
            run: async (_model, options) => {
                messages = options.messages;
                return { response: 'Coach-Antwort' };
            }
        }
    });
    const response = await worker.fetch(validCoachRequest({
        question: 'Kannst du mein Gewicht und meinen Zyklus analysieren?',
        context: {
            privacy: {
                excludedFromCoachContext: ['bodyWeight', 'cycleData'],
                reason: 'privacy_minimization'
            },
            dataCoverage: {
                checkIns: { availableCount: 12, includedCount: 0, excludedFields: ['weight', 'bodyWeight', 'cycle'] }
            }
        }
    }), env);

    assert.equal(response.status, 200);
    const systemPrompt = messages.filter(item => item.role === 'system').map(item => item.content).join('\n');
    assert.match(systemPrompt, /Bereitschaft, Fitness, Ermüdung, Form/);
    assert.match(systemPrompt, /privacy\.excludedFromCoachContext/);
    assert.match(systemPrompt, /mindestens drei tatsächlich vorhandene/);
    assert.match(systemPrompt, /Körpergewicht und Zyklusdaten werden nicht an den KI-Coach übermittelt/);
});
