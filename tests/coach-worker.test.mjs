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
