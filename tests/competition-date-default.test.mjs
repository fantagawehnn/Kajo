import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('index.html', 'utf8');
const competitions = readFileSync('js/competitions.js', 'utf8');

test('new competition form defaults to the current local date, not a stale hard-coded date', () => {
    assert.doesNotMatch(html, /id="race-date" value="\d{4}-\d{2}-\d{2}"/);
    assert.match(competitions, /if \(raceDateInput && !raceDateInput\.value\) raceDateInput\.value = toLocalDateString\(\);/);
});

test('reopening the competition form preserves a date already selected by the user', () => {
    assert.match(competitions, /if \(raceDateInput && !raceDateInput\.value\)/);
});
