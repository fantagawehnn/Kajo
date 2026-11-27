import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edge = readFileSync(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('Garmin Edge Function compares stored previews and upserts only changed rows', () => {
    assert.match(edge, /selectChangedGarminActivityRows\(records, existingRows\)/);
    assert.match(edge, /\.select\("garmin_activity_id,activity,start_time,activity_type,duration_seconds,distance_meters"\)/);
    assert.match(edge, /stored \+= changedRecords\.length/);
});

test('Garmin cloud preview loader fetches compact metadata and bounded changed-ID payloads', () => {
    assert.match(main, /select\('garmin_activity_id, updated_at'\)/);
    assert.match(main, /for \(let offset = 0; offset < changedIds\.length; offset \+= 100\)/);
    assert.match(main, /getGarminActivityRowsNeedingPayload\(/);
    assert.match(main, /Object\.keys\(seenAtById\)\.length > 0/);
});
