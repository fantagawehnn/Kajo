import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSFormTestSegments, summarizeTestSegment } from '../js/test-segments.js';

test('S-Form: manual boundaries group automatic 1-km laps as splits', () => {
    const laps = [
        { lapTrigger: 0, durationSeconds: 12, distance: 20 },
        { lapTrigger: 2, durationSeconds: 80, distance: 1000 },
        { lapTrigger: 2, durationSeconds: 75, distance: 1000 },
        { lapTrigger: 0, durationSeconds: 10, distance: 15 },
        { lapTrigger: 0, durationSeconds: 11, distance: 18 },
        { lapTrigger: 2, durationSeconds: 82, distance: 1000 },
        { lapTrigger: 0, durationSeconds: 9, distance: 12 }
    ];
    const segments = deriveSFormTestSegments(laps);
    assert.deepEqual(segments.map(segment => segment.lapIndexes), [[1, 2], [5]]);
    assert.deepEqual(summarizeTestSegment(segments[0], laps), {
        durationSeconds: 155, distanceMeters: 2000,
        averageSpeedKmh: 2000 / 155 * 3.6, splitCount: 2
    });
});

test('S-Form: no complete interval is invented without two manual boundaries', () => {
    assert.deepEqual(deriveSFormTestSegments([
        { lapTrigger: 0 }, { lapTrigger: 2 }, { lapTrigger: 2 }
    ]), []);
});

test('non-manual triggers are not treated as manual boundaries', () => {
    assert.deepEqual(deriveSFormTestSegments([
        { lapTrigger: 1 }, { lapTrigger: 2 }, { lapTrigger: 7 }
    ]), []);
});
