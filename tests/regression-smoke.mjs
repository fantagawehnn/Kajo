import assert from 'node:assert/strict';

const store = new Map();
const elements = {};
globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value)
};
globalThis.document = {
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
const storage = await import('../js/storage.js');
const { escapeHtml, toLocalDateString, formatKm, getSportsCatalog } = await import('../js/utils.js');
const { computePerformanceTimeline } = await import('../js/calculations.js');
const { getRacePriorityMeta, migrateLegacyRacePriorities } = await import('../js/competitions.js');

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
await import('./athlete-context.test.mjs');
console.log('Regression smoke tests passed: local dates, escaping, settings, CTL provisional flag, respiratory wellness, Intervals streams, RPE load, backup restore and athlete context.');
