import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const store = new Map();
const elements = {};
globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value)
};
globalThis.document = {
    addEventListener() {},
    getElementById(id) {
        return elements[id] ||= {
            value: '', textContent: '', className: '', checked: false,
            classList: { add() {}, remove() {}, toggle() {} }
        };
    },
    createElement() {
        const child = {
            id: '', className: '', innerHTML: '', hidden: false, dataset: {},
            setAttribute() {},
            querySelector() { return { textContent: '', addEventListener() {} }; },
            remove() {}
        };
        return child;
    },
    body: { appendChild() {} }
};
globalThis.confirm = () => true;
globalThis.window = { dispatchEvent() {}, addEventListener() {} };
const alertMessages = [];
globalThis.alert = message => alertMessages.push(String(message));
globalThis.setTimeout = () => 0;

const { state, setRefreshHandler } = await import('../js/state.js');
const storage = await import('../js/storage.js?v=3');
const { escapeHtml, toLocalDateString, formatKm, getSportsCatalog, resolveGarminActivityDateTime } = await import('../js/utils.js');
const { computePerformanceTimeline } = await import('../js/calculations.js');
const { getRacePriorityMeta, migrateLegacyRacePriorities, addRace } = await import('../js/competitions.js');

// Local date must not shift to the previous/next day through UTC conversion.
assert.equal(toLocalDateString(new Date(2026, 10, 10, 0, 15)), '2026-11-10');
assert.equal(escapeHtml(`<script>alert('x')</script>`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
assert.equal(formatKm(12.3456), '12.35');
assert.deepEqual(resolveGarminActivityDateTime({
    startTimeLocal: '2026-11-16T00:15:00'
}), { date: '2026-11-16', startTime: '2026-11-16T00:15:00' });
assert.deepEqual(resolveGarminActivityDateTime({
    startTimeLocal: '2026-11-16T00:15:00',
    startTimeGMT: '2026-11-15T23:15:00Z'
}), { date: '2026-11-16', startTime: '2026-11-15T23:15:00.000Z' });
assert.deepEqual(resolveGarminActivityDateTime({
    startTimeGMT: '2026-11-15T23:15:00Z'
}), { date: '2026-11-15', startTime: '2026-11-15T23:15:00.000Z' });

state.settings = { sports: { custom_row: { label: 'Rudern', color: '#123456' } }, categories: {}, heartRateZones: {} };
assert.equal(getSportsCatalog().custom_row.label, 'Rudern');
const todayKey = toLocalDateString();
const completedDate = new Date();
completedDate.setDate(completedDate.getDate() - 1);
const completedKey = toLocalDateString(completedDate);
const loadSettings = {
    ...state.settings,
    garminActivityCoverageRanges: [{
        startDate: completedKey, endDate: completedKey,
        status: 'complete', source: 'garmin_activity_list'
    }]
};
const timeline = computePerformanceTimeline([{
    id: 'garmin-smoke-activity', source: 'garmin', date: completedKey,
    garminTrainingLoad: 80
}], loadSettings, state.profile);
const loadedDay = timeline.find(day => day.date === completedKey);
assert.equal(loadedDay.load, 80);
assert.equal(loadedDay.dataStatus, 'complete');
assert.equal(loadedDay.isProvisional, true);
assert.equal(computePerformanceTimeline([{ date: todayKey, tss: 80 }], state.settings, state.profile).length, 0);

// Competition priorities cover all five levels and migrate old generic C entries safely.
assert.equal(getRacePriorityMeta('A').title, 'International WM/EM');
assert.equal(getRacePriorityMeta('B').title, 'International World Cup');
assert.equal(getRacePriorityMeta('C').title, 'PEU Cup');
assert.equal(getRacePriorityMeta('D').title, 'Deutsche Meisterschaft & nationale Qualifikationen');
assert.equal(getRacePriorityMeta('E').title, 'Sonstige Rennen');
state.races = [
    { id: 'legacy-c', prio: 'C', label: 'Trainingswettkampf', name: 'Alter Trainingswettkampf' },
    { id: 'peu-c', prio: 'C', label: 'PEU Cup', name: 'PEU Cup' }
];
assert.equal(migrateLegacyRacePriorities(), true);
assert.equal(state.races[0].prio, 'E');
assert.equal(state.races[0].name, 'Alter Trainingswettkampf');
assert.equal(state.races[1].prio, 'C');

// Invalid competition input must never create a placeholder event.
const raceCountBeforeValidation = state.races.length;
document.getElementById('race-name').value = '';
document.getElementById('race-date').value = '2026-11-20';
addRace();
assert.equal(state.races.length, raceCountBeforeValidation);
assert.match(alertMessages.at(-1), /Wettkampfnamen/);
document.getElementById('race-name').value = 'Testwettkampf';
document.getElementById('race-date').value = 'not-a-date';
addRace();
assert.equal(state.races.length, raceCountBeforeValidation);
assert.match(alertMessages.at(-1), /gültiges Wettkampfdatum/);


// Legacy global data is intentionally not imported into a user account automatically.
// It must remain untouched until the user explicitly assigns it to an account.
const legacyCheckins = JSON.stringify({
    '2026-11-10': { sleep: 7.4, weight: 65 },
    '2026-11-09': { sleep: 4, soreness: 2 },
    '2026-11-08': { sleep: 5 }
});
store.set('endurance_checkins', legacyCheckins);
storage.loadStateFromStorage();
assert.deepEqual(state.dailyCheckins, {});
assert.equal(store.get('endurance_checkins'), legacyCheckins);

// Subsequent import checks run inside an isolated authenticated-user storage scope.
await storage.loadStateForUser('smoke-test-user');

// Confirmed Garmin activity-list coverage is durable user data and survives
// both the cloud-snapshot apply path and a fresh local user-state load.
const persistedCoverage = [{
    startDate: '2026-10-01', endDate: '2026-10-14',
    status: 'complete', source: 'garmin_activity_list',
    syncedAt: '2026-10-15T08:00:00.000Z'
}];
state.settings = {
    ...(state.settings || {}),
    garminActivityCoverageRanges: persistedCoverage
};
const coverageSnapshot = storage.getUserDataSnapshot();
assert.deepEqual(coverageSnapshot.settings.garminActivityCoverageRanges, persistedCoverage);
storage.applyCloudDataSnapshot(coverageSnapshot);
assert.deepEqual(state.settings.garminActivityCoverageRanges, persistedCoverage);
await storage.loadStateForUser('smoke-test-user');
assert.deepEqual(state.settings.garminActivityCoverageRanges, persistedCoverage);
const backupSettings = { ...state.settings };
await storage.importDatabaseBackup({
    text: async () => JSON.stringify({ settings: backupSettings })
}, { confirmed: true, categories: ['settings'] });
assert.deepEqual(state.settings.garminActivityCoverageRanges, persistedCoverage);


// Garmin raw telemetry remains available in memory for charts but is never
// written to the persistent per-user activity or telemetry collections.
state.rawActivities = [{
    id: 'garmin-123456',
    source: 'garmin',
    date: todayKey,
    garminTelemetry: {
        time: [0, 1],
        metricSeriesTime: [0, 1],
        metricSeries: {
            directSpeed: { label: 'Speed', unit: 'm/s', values: [1.2, 1.4], nonNullCount: 2 }
        }
    }
}];
assert.equal(storage.saveActivitiesToLocalStorage(), true);
await new Promise(resolve => setImmediate(resolve));
const compactActivity = JSON.parse(store.get('endurance:user:smoke-test-user:activities'))[0];
assert.equal(compactActivity.garminTelemetry, undefined);
assert.equal(store.get('endurance:user:smoke-test-user:garminTelemetry'), undefined);
assert.deepEqual(state.rawActivities[0].garminTelemetry.metricSeries.directSpeed.values, [1.2, 1.4]);
assert.deepEqual(storage.getUserDataSnapshot().activities[0].garminTelemetry, undefined);

// Wellness merge preserves manual values and does not replace fields absent from API.
state.rawActivities = [];
state.dailyCheckins['2026-11-10'] = {
    sleepQuality: 5, soreness: 3, fatigue: 2, motivation: 4,
    weight: 65, manualNote: 'keep'
};
setRefreshHandler(() => {});
globalThis.fetch = async url => url.includes('/activities')
    ? { ok: true, json: async () => [] }
    : { ok: true, json: async () => [{
        id: '2026-11-10', sleepSecs: 28800, weight: null, restingHR: 48, hrv: 72, respiration: 15.2
    }] };
const importer = await import('../js/import.js');

const ambiguousGarmin = [
    { id: 'garmin-a', source: 'garmin', type: 'kayak', startTime: '2026-11-10T08:00:00Z', duration: 60 },
    { id: 'garmin-b', source: 'garmin', type: 'kayak', startTime: '2026-11-10T08:04:00Z', duration: 60 },
    { id: 'icu-shared', source: 'intervals', sourceId: 'icu-shared', type: 'kayak', startTime: '2026-11-10T08:02:00Z', duration: 60 }
];
assert.equal(importer.consolidateVisibleCrossSourceDuplicates(ambiguousGarmin), 0,
    'one Intervals activity matching multiple Garmin activities is not auto-merged');
assert.equal(ambiguousGarmin.length, 3, 'ambiguous Garmin matches remain separate');

const ambiguousIntervals = [
    { id: 'garmin-shared', source: 'garmin', type: 'kayak', startTime: '2026-11-10T09:02:00Z', duration: 60 },
    { id: 'icu-a', source: 'intervals', sourceId: 'icu-a', type: 'kayak', startTime: '2026-11-10T09:00:00Z', duration: 60 },
    { id: 'icu-b', source: 'intervals', sourceId: 'icu-b', type: 'kayak', startTime: '2026-11-10T09:04:00Z', duration: 60 }
];
assert.equal(importer.consolidateVisibleCrossSourceDuplicates(ambiguousIntervals), 0,
    'one Garmin activity matching multiple Intervals activities is not auto-merged');
assert.equal(ambiguousIntervals.length, 3, 'ambiguous Intervals matches remain separate');

const uniqueCrossSource = [
    { id: 'garmin-unique', source: 'garmin', sourceRefs: { garminActivityId: '987' }, type: 'kayak', startTime: '2026-11-10T10:00:00Z', duration: 60, name: 'Garmin canonical' },
    { id: 'icu-unique', source: 'intervals', sourceId: 'icu-unique', type: 'kayak', startTime: '2026-11-10T10:02:00Z', duration: 60, name: 'Intervals detail', tss: 42 }
];
assert.equal(importer.consolidateVisibleCrossSourceDuplicates(uniqueCrossSource), 1,
    'unique one-to-one Garmin and Intervals activities are consolidated');
assert.equal(uniqueCrossSource.length, 1, 'unique cross-source duplicate is removed');
assert.equal(uniqueCrossSource[0].id, 'garmin-unique', 'Garmin remains the canonical activity');
assert.equal(uniqueCrossSource[0].tss, 42, 'non-conflicting Intervals metrics are preserved');
assert.deepEqual(uniqueCrossSource[0].sources.sort(), ['garmin', 'intervals'], 'both source labels are retained');

const batchAmbiguousGarmin = {
    id: 'garmin-batch-ambiguous', source: 'garmin', type: 'kayak',
    startTime: '2026-11-10T11:00:00Z', duration: 60
};
const batchAmbiguousPair = [
    batchAmbiguousGarmin,
    { id: 'icu-batch-ambiguous', source: 'intervals', sourceId: 'icu-batch-ambiguous', type: 'kayak', startTime: '2026-11-10T11:02:00Z', duration: 60 }
];
assert.equal(importer.consolidateVisibleCrossSourceDuplicates(batchAmbiguousPair, new Set([batchAmbiguousGarmin])), 0,
    'activities marked ambiguous by the full import batch are excluded from cleanup');
assert.equal(batchAmbiguousPair.length, 2, 'batch-ambiguous source records remain separate');

storage.setUserLocalSetting('garmin_connected', 'true');
let intervalsFetchesWhileGarminConnected = 0;
globalThis.fetch = async () => {
    intervalsFetchesWhileGarminConnected++;
    return { ok: true, json: async () => [] };
};
document.getElementById('icu-load-activities').checked = true;
await importer.performIntervalsLiveSync();
assert.equal(intervalsFetchesWhileGarminConnected, 0, 'Intervals sync must pause while Garmin is connected');

state.rawActivities = [
    { id: 'icu-only-1', source: 'intervals', sourceId: 'icu-only-1', name: 'Intervals only' },
    { id: 'garmin-123456', source: 'garmin', sourceRefs: { garminActivityId: '123456', intervalsActivityId: 'icu-linked' }, name: 'Garmin canonical' },
    { id: 'manual-1', source: 'manual', name: 'Manual activity' }
];
state.disabledIntervalsActivities = [];
storage.setUserLocalSetting('garmin_connected', 'false');
const disabledSummary = importer.deactivateIntervalsActivities();
assert.equal(disabledSummary.deactivated, 1);
assert.equal(state.rawActivities.some(activity => activity.id === 'icu-only-1'), false);
assert.equal(state.rawActivities.some(activity => activity.id === 'garmin-123456'), true);
assert.equal(state.disabledIntervalsActivities[0].id, 'icu-only-1');
assert.equal(storage.getUserDataSnapshot().disabledIntervals[0].id, 'icu-only-1');
assert.equal(JSON.parse(store.get('endurance:user:smoke-test-user:disabledIntervals'))[0].id, 'icu-only-1');
globalThis.fetch = async url => url.includes('/activities')
    ? { ok: true, json: async () => [] }
    : { ok: true, json: async () => [{
        id: '2026-11-10', sleepSecs: 28800, weight: null, restingHR: 48, hrv: 72, respiration: 15.2
    }] };
document.getElementById('icu-athlete-id').value = 'test-athlete';
document.getElementById('icu-api-key').value = 'test-key';
document.getElementById('icu-load-wellness').checked = true;
await importer.performIntervalsLiveSync();
assert.equal(state.dailyCheckins['2026-11-10'].sleepQuality, 5);
assert.equal(state.dailyCheckins['2026-11-10'].sleepDuration, 8);
assert.equal(state.dailyCheckins['2026-11-10'].soreness, 3);
assert.equal(state.dailyCheckins['2026-11-10'].motivation, 4);
assert.equal(state.dailyCheckins['2026-11-10'].manualNote, 'keep');
assert.equal(state.dailyCheckins['2026-11-10'].rhr, 48);
assert.equal(state.dailyCheckins['2026-11-10'].hrv, 72);
assert.equal(state.dailyCheckins['2026-11-10'].respiration, 15.2);

state.rawActivities = [];
globalThis.fetch = async url => url.includes('/activities')
    ? { ok: true, json: async () => [{
        id: 'streamed-activity', start_date_local: todayKey + 'T08:00:00',
        moving_time: 600, distance: 5000, average_heartrate: 135,
        icu_training_load: 25, type: 'Kayak', stream_types: ['heartrate']
    }] }
    : url.includes('/streams.json')
        ? { ok: true, json: async () => [
            { type: 'time', data: [0, 1, 2] },
            { type: 'heartrate', data: [120, 130, 140] }
        ] }
        : { ok: true, json: async () => [] };
document.getElementById('icu-load-wellness').checked = false;
document.getElementById('icu-load-activities').checked = true;
document.getElementById('icu-load-streams').checked = true;
await importer.performIntervalsLiveSync();
const streamed = state.rawActivities.find(a => a.id === 'streamed-activity');
assert.deepEqual(streamed.telemetry.hr, [120, 130, 140]);
assert.deepEqual(streamed.telemetry.time, [0, 1, 2]);

// Numeric IDs from different providers are not interchangeable.
state.rawActivities = [{
    id: '12345', source: 'garmin', sourceRefs: { garminActivityId: '12345' },
    date: todayKey, startTime: todayKey + 'T06:00:00Z',
    type: 'kayak', duration: 60, name: 'Garmin Einheit'
}];
globalThis.fetch = async url => url.includes('/activities')
    ? { ok: true, json: async () => [
        {
            id: '12345', start_date_local: todayKey + 'T18:00:00',
            moving_time: 900, distance: 4000, average_heartrate: 120,
            icu_training_load: 0, type: 'Run', name: 'Intervals Lauf'
        },
        {
            id: '12346', start_date_local: todayKey + 'T19:00:00',
            moving_time: 900, distance: 4000, average_heartrate: 120,
            type: 'Run', name: 'Intervals ohne Load'
        }
    ] }
    : { ok: true, json: async () => [] };
document.getElementById('icu-load-activities').checked = true;
document.getElementById('icu-load-streams').checked = false;
document.getElementById('icu-load-wellness').checked = false;
await importer.performIntervalsLiveSync();
assert.equal(state.rawActivities.length, 3,
    'same numeric ID from Garmin and Intervals must not suppress a distinct activity');
assert.equal(state.rawActivities.find(a => a.source === 'garmin').name, 'Garmin Einheit');
const importedIntervals = state.rawActivities.find(a => a.source === 'intervals' && a.id === '12345');
assert.ok(importedIntervals, 'Intervals activity with colliding Garmin ID is imported separately');
assert.equal(importedIntervals.tss, 0, 'a valid zero training-load value is preserved');
const missingLoadActivity = state.rawActivities.find(a => a.id === '12346');
assert.equal(missingLoadActivity.tss, null, 'a missing training-load value remains missing, not zero');

assert.equal(state.dailyCheckins['2026-11-10'].weight, 65);

// Backup restoration validates, migrates, and restores the supported collections.
const backup = {
    activities: [{ id: 'restored-activity' }], planned: [],
    checkins: { '2026-01-01': { sleep: 6.5 } }, health: {}, races: [], strength: [], settings: { sports: { custom_row: { label: 'Rudern', color: '#123456' } }, categories: {}, heartRateZones: { Kayaking: [130, 150, 165, 180] } }
};
await storage.importDatabaseBackup({ text: async () => JSON.stringify(backup) });
assert.equal(state.rawActivities[0].id, 'restored-activity');
assert.equal(state.dailyCheckins['2026-01-01'].sleepDuration, 6.5);
assert.equal(state.settings.heartRateZones.Kayaking[3], 180);

const activities = await import('../js/activities.js');
const editable = { id: 'edit-me', name: 'Training', type: 'Kayaking', category: 'ga', duration: 60, distance: 10 };
state.selectedActivityForModal = editable;
state.rawActivities = [editable];
activities.updateActivityRPE(8);
assert.equal(editable.perceivedEffort, 8);
assert.equal(editable.sRpeLoad, 480);
// Garmin-Load: explicit zero is valid, but absent/null values must stay missing.
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
assert.ok(mainSource.includes('const nativeLoadValue = a.trainingLoad ?? a.activityTrainingLoad ?? a.aerobicTrainingLoad;'));
assert.ok(mainSource.includes("nativeLoadValue != null && nativeLoadValue !== ''"));
assert.ok(mainSource.includes('garminTrainingLoad: Number.isFinite(nativeLoad) && nativeLoad >= 0 ? nativeLoad : null,'));

// Garmin backend validation must use real digit classes, not a literal escaped \\d sequence.
const garminBackendSource = await readFile(new URL('../supabase/functions/garmin-personal/index.ts', import.meta.url), 'utf8');
assert.ok(garminBackendSource.includes('if (!/^\\d+$/.test(activityId))'),
    'Garmin activity IDs must be validated with a digit character class');
assert.ok(garminBackendSource.includes('const activityDate = /^\\d{4}-\\d{2}-\\d{2}/.test(localStart)'),
    'Garmin local activity dates must be recognized as YYYY-MM-DD');
assert.ok(garminBackendSource.includes('if (!activityDate || !/^\\d{4}-\\d{2}-\\d{2}$/.test(activityDate))'),
    'Garmin activity dates must be validated as YYYY-MM-DD');
assert.ok(!garminBackendSource.includes('\\\\d'),
    'Garmin backend must not contain double-escaped digit classes');
assert.ok(garminBackendSource.includes('function localDateForOffset(timezoneOffsetMinutes: unknown)'),
    'Garmin sync-range date validation must use the requested local timezone offset');
assert.ok(garminBackendSource.includes('const today = localDateForOffset(body.timezoneOffsetMinutes);'),
    'Garmin sync-range must compare the requested end date with the local calendar date');
assert.ok(garminBackendSource.includes('new Date().toISOString().slice(0, 10), true));'),
    'Garmin background sync must use server-side missing-day coverage rather than rescanning the entire 14-day window');
assert.ok(mainSource.includes('const today = getLocalCalendarDate();'),
    'Garmin range validation in the app must use the local calendar date');
assert.ok(mainSource.includes('scannedDays + skippedDays !== totalDays'),
    'Garmin coverage must only be recorded when the backend accounts for every requested day');


// Garmin sync audit history must record outcome, source and timezone without exposing it to clients.
const garminSyncMigration = await readFile(new URL('../supabase/migrations/20261118120000_garmin_sync_events.sql', import.meta.url), 'utf8');
const garminLeaseMigration = await readFile(new URL('../supabase/migrations/20261118130000_garmin_health_sync_lease.sql', import.meta.url), 'utf8');
assert.ok(garminBackendSource.includes('const lockToken = crypto.randomUUID();'), 'Each health-history invocation must have a unique lease owner token');
assert.ok(garminBackendSource.includes('lock_token.is.null,lock_expires_at.is.null,lock_expires_at.lt.'), 'Concurrent health-history requests must atomically claim only an unowned or expired lease');
assert.ok(garminBackendSource.includes('.eq("lock_token", lockToken)'), 'Cursor mutations must be restricted to the invocation that owns the lease');
assert.ok(garminBackendSource.includes('lock_expires_at: leaseExpiry()'), 'The health-history lease must be renewed during processing');
assert.ok(garminBackendSource.includes('Eine andere Gesundheitsdaten-Synchronisierung verarbeitet diesen Fortschritt derzeit.'), 'A concurrent health-history request must exit without modifying the active cursor');
assert.ok(garminBackendSource.includes('Die Sperre für die Garmin-Gesundheitssynchronisierung ist abgelaufen'), 'A worker that loses its lease must stop before advancing the cursor');
assert.ok(garminLeaseMigration.includes('add column if not exists lock_token uuid'), 'The lease migration must add an owner token');
assert.ok(garminLeaseMigration.includes('add column if not exists lock_expires_at timestamptz'), 'The lease migration must add an expiry timestamp');
assert.ok(garminBackendSource.includes('async function runTrackedGarminSync'), 'Garmin sync calls must be wrapped in event logging');
assert.ok(garminBackendSource.includes('.from("garmin_sync_events").insert({'), 'Garmin sync attempts must be recorded before the operation');
assert.ok(garminBackendSource.includes('status: "error", finished_at:'), 'Failed Garmin sync attempts must be recorded as errors');
assert.ok(garminBackendSource.includes('.order("started_at", { ascending: false }).limit(20)'), 'The status endpoint must return the latest sync events only');
assert.ok(garminBackendSource.includes('eventsAvailable: !eventsError'), 'A missing or unavailable event table must not hide the remaining Garmin status');
assert.ok(garminBackendSource.includes('events: eventsError ? [] : (events ?? [])'), 'Unavailable event history must return an empty list instead of failing the status response');
assert.ok(mainSource.includes("'Kein Abschluss protokolliert'"), 'Stale running events must not be presented as confirmed active or failed syncs');
assert.ok(mainSource.includes("Date.now() - startedAtMs > 15 * 60 * 1000"), 'A running event older than 15 minutes must be marked as lacking a recorded completion');
assert.ok(garminBackendSource.includes('timezoneBasis: "utc"'), 'Background sync events must explicitly use UTC');
assert.ok(garminBackendSource.includes('timezoneBasis: "client_offset"'), 'Manual range sync events must preserve the client UTC offset');
assert.ok(mainSource.includes("timezoneOffsetMinutes: new Date().getTimezoneOffset()"), 'Daily sync must pass the client timezone offset');
assert.ok(mainSource.includes('Letzte Synchronisierungsvorgänge'), 'The Garmin dialog must render recent sync events');
assert.ok(garminSyncMigration.includes('alter table public.garmin_sync_events enable row level security;'), 'The sync audit table must enable RLS');
assert.ok(garminSyncMigration.includes('revoke all on table public.garmin_sync_events from anon, authenticated;'), 'The sync audit table must not be directly accessible to browser roles');
assert.ok(garminSyncMigration.includes('grant all on table public.garmin_sync_events to service_role;'), 'Only the trusted service role should access the sync audit table');

console.log('Regression smoke tests passed: local dates, escaping, settings, CTL provisional flag, respiratory wellness, Intervals streams, RPE load and backup restore.');
