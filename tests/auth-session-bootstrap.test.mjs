import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const authPath = fileURLToPath(new URL('../js/auth.js', import.meta.url));
const mainPath = fileURLToPath(new URL('../js/main.js', import.meta.url));
const authSource = readFileSync(authPath, 'utf8');
const mainSource = readFileSync(mainPath, 'utf8');

test('uses Supabase INITIAL_SESSION instead of issuing a duplicate auth getSession request', () => {
    assert.match(authSource, /supabase\.auth\.onAuthStateChange\(/);
    assert.doesNotMatch(authSource, /supabase\.auth\.getSession\(/);

    const bootstrapStart = mainSource.indexOf('if (supabase) {', mainSource.indexOf('async function handleAuthSession'));
    const bootstrapEnd = mainSource.indexOf('\n} else {', bootstrapStart);
    assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart);
    const bootstrap = mainSource.slice(bootstrapStart, bootstrapEnd);
    assert.match(bootstrap, /onAuthStateChange\(\(event, session\)/);
    assert.match(bootstrap, /handleAuthSession\(session, event\)/);
    assert.doesNotMatch(bootstrap, /auth\.getSession\(/);
});

test('does not re-check a definitive initial or signed-out null session', () => {
    assert.match(mainSource, /authEvent !== 'INITIAL_SESSION' && authEvent !== 'SIGNED_OUT'/);
});
