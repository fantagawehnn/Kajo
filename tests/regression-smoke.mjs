import assert from 'node:assert/strict';

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
globalThis.alert = () => {};
globalThis.setTimeout = () => 0;

const { state, setRefreshHandler } = await import('../js/state.js');
const storage = await import('../js/storage.js?v=8');
const { escapeHtml, toLocalDateString, formatKm, getSportsCatalog } = await import('../js/utils.js');
const { computePerformanceTimeline } = await import('../js/calculations.js');
const { getRacePriorityMeta, migrateLegacyRacePriorities } = await import('../js/competitions.js');
const { mergeProfileSnapshots } = await import('../js/profile-merge.js');

// Profile sync merges cloud-only fields without replacing non-empty local values.
const cloudProfile = { name: 'Cloud name', maxHr: 190, club: 'Club', country: 'GER', nested: { b: 2, a: 1 } };
const localProfile = { name: 'Local name', maxHr: 190, club: '', nested: { a: 1, b: 2 } };
const mergedProfileResult = mergeProfileSnapshots(localProfile, cloudProfile);
assert.equal(mergedProfileResult.profile.name, 'Local name');
assert.equal(mergedProfileResult.profile.club, 'Club');
assert.equal(mergedProfileResult.profile.country, 'GER');
assert.deepEqual(mergedProfileResult.conflicts, ['name']);
assert.equal(mergedProfileResult.cloudNeedsUpdate, true);
const cloudSupersetResult = mergeProfileSnapshots({ name: 'Same', maxHr: 190 }, { name: 'Same', maxHr: 190, country: 'GER' });
assert.deepEqual(cloudSupersetResult.conflicts, []);
assert.equal(cloudSupersetResult.profile.country, 'GER');
assert.equal(cloudSupersetResult.cloudNeedsUpdate, false);

// Local date must not shift to the previous/next day through UTC conversion.
assert.equal(toLocalDateString(new Date(2026, 10, 10, 0, 15)), '2026-11-10');
assert.equal(escapeHtml(`<script>alert('x')</script>`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
assert.equal(formatKm(12.3456), '12.35');
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
assert.equal(loadedDay.load, null);
assert.equal(loadedDay.dataStatus, 'incomplete-activity-load');
assert.equal(loadedDay.ctl, null);
const unavailableSourceDay = computePerformanceTimeline([{ date: todayKey, tss: 80 }], state.settings, state.profile)
    .find(day => day.date === todayKey);
assert.ok(unavailableSourceDay);
assert.equal(unavailableSourceDay.load, null);
assert.equal(unavailableSourceDay.dataStatus, 'incomplete-activity-load');

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
await storage.loadDeferredStateForUser('smoke-test-user');

// Season planning is stored independently per user and survives a reload.
state.seasonPlan = {
    schemaVersion: 1, id: 'smoke-season', planningMode: 'hybrid',
    planningHorizon: 'season', startDate: '2027-01-01',
    endDate: '2027-12-31', primaryGoal: 'Season planning persistence test',
    phases: []
};
assert.equal(storage.saveDataToLocalStorage(), true);
assert.deepEqual(
    JSON.parse(store.get('endurance:user:smoke-test-user:seasonPlan')),
    state.seasonPlan
);
await storage.loadStateForUser('smoke-test-user');
await storage.loadDeferredStateForUser('smoke-test-user');
assert.equal(state.seasonPlan.id, 'smoke-season');

// Saving a sickness/injury entry must finish locally without waiting for a cloud request.
setRefreshHandler(() => {});
const healthModule = await import('../js/health.js?v=81');
document.getElementById('health-log-date-from').value = '2026-11-12';
document.getElementById('health-log-date-to').value = '2026-11-13';
document.getElementById('health-log-status').value = 'sick';
document.getElementById('health-log-diagnosis').value = 'Smoke test infection';
state.healthLogs = {};
await healthModule.saveRetroactiveHealthLog();
assert.equal(state.healthLogs['2026-11-12'].status, 'sick');
assert.equal(state.healthLogs['2026-11-13'].diagnosis, 'Smoke test infection');
assert.deepEqual(JSON.parse(store.get('endurance:user:smoke-test-user:health')), state.healthLogs);



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
console.log('Regression smoke tests passed: local dates, escaping, settings, CTL provisional flag, respiratory wellness, Intervals streams, RPE load and backup restore.');
