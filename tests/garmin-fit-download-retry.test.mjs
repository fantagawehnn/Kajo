import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTransientRetry } from '../supabase/functions/garmin-personal/fit-download-retry.js';

test('retries temporary gateway errors and returns the successful response', async () => {
  const statuses = [504, 504, 200];
  const delays = [];
  let calls = 0;

  const response = await fetchWithTransientRetry('https://garmin.example/fit', {}, {
    fetchImpl: async () => new Response('', { status: statuses[calls++] }),
    wait: async (ms) => delays.push(ms),
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('does not retry permanent client errors', async () => {
  let calls = 0;
  const delays = [];

  const response = await fetchWithTransientRetry('https://garmin.example/fit', {}, {
    fetchImpl: async () => {
      calls++;
      return new Response('not found', { status: 404 });
    },
    wait: async (ms) => delays.push(ms),
  });

  assert.equal(response.status, 404);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('retries transient network errors and stops after the configured attempts', async () => {
  let calls = 0;
  const delays = [];

  await assert.rejects(
    fetchWithTransientRetry('https://garmin.example/fit', {}, {
      fetchImpl: async () => {
        calls++;
        throw new TypeError('network connection failed');
      },
      wait: async (ms) => delays.push(ms),
    }),
    /network connection failed/,
  );

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('returns the final gateway response after exhausting retries', async () => {
  let calls = 0;
  const delays = [];

  const response = await fetchWithTransientRetry('https://garmin.example/fit', {}, {
    fetchImpl: async () => {
      calls++;
      return new Response('gateway timeout', { status: 504 });
    },
    wait: async (ms) => delays.push(ms),
  });

  assert.equal(response.status, 504);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});
