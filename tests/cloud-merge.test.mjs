import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const sourcePath = fileURLToPath(new URL('../js/cloud-merge.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8')
    .replace(/export function/g, 'function')
    + '\nmodule.exports = { mergeCloudSnapshots, cloudSnapshotsEqual, withCloudActivityIds, createCloudSnapshotPatch };';

const moduleSandbox = { module: { exports: {} } };
vm.runInNewContext(source, moduleSandbox, { filename: 'cloud-merge.js' });
const { mergeCloudSnapshots, cloudSnapshotsEqual, withCloudActivityIds, createCloudSnapshotPatch } = moduleSandbox.module.exports;

function merge(base, local, cloud) {
    return mergeCloudSnapshots(base, local, cloud);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test('führt unabhängige Änderungen in unterschiedlichen Bereichen zusammen', () => {
    const result = merge(
        { checkins: {}, planned: [] },
        { checkins: { '2026-11-23': { sleepQuality: 80 } }, planned: [] },
        { checkins: {}, planned: [{ id: 'plan-1', title: 'Training' }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot), {
        checkins: { '2026-11-23': { sleepQuality: 80 } },
        planned: [{ id: 'plan-1', title: 'Training' }]
    });
});

test('führt Ergänzungen beider Geräte in derselben Liste zusammen', () => {
    const result = merge(
        { planned: [{ id: 'existing', title: 'Alt' }] },
        { planned: [{ id: 'existing', title: 'Alt' }, { id: 'phone', title: 'Telefon' }] },
        { planned: [{ id: 'existing', title: 'Alt' }, { id: 'desktop', title: 'Computer' }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.planned).map(item => item.id), ['existing', 'phone', 'desktop']);
});

test('kombiniert Änderungen an unterschiedlichen Feldern desselben Eintrags', () => {
    const result = merge(
        { planned: [{ id: 'p1', title: 'Alt', duration: 60 }] },
        { planned: [{ id: 'p1', title: 'Neu', duration: 60 }] },
        { planned: [{ id: 'p1', title: 'Alt', duration: 75 }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.planned), [{ id: 'p1', title: 'Neu', duration: 75 }]);
});

test('blockiert widersprüchliche Änderungen am selben Feld', () => {
    const result = merge(
        { profile: { displayName: 'Alt' } },
        { profile: { displayName: 'Telefon' } },
        { profile: { displayName: 'Computer' } }
    );
    assert.ok(result.conflicts.some(path => path.includes('displayName')));
});

test('wendet eine explizite lokale oder zentrale Konfliktentscheidung auf das betroffene Feld an', () => {
    const base = { profile: { displayName: 'Alt' } };
    const local = { profile: { displayName: 'Telefon' } };
    const cloud = { profile: { displayName: 'Computer' } };
    const path = 'profile.displayName';
    const localChoice = mergeCloudSnapshots(base, local, cloud, { [path]: 'local' });
    const cloudChoice = mergeCloudSnapshots(base, local, cloud, { [path]: 'cloud' });
    assert.deepEqual(plain(localChoice.conflicts), []);
    assert.deepEqual(plain(cloudChoice.conflicts), []);
    assert.equal(localChoice.snapshot.profile.displayName, 'Telefon');
    assert.equal(cloudChoice.snapshot.profile.displayName, 'Computer');
});

test('blockiert Löschen auf einem Gerät gegen Bearbeiten auf dem anderen', () => {
    const result = merge(
        { planned: [{ id: 'p1', title: 'Alt' }] },
        { planned: [] },
        { planned: [{ id: 'p1', title: 'Geändert' }] }
    );
    assert.ok(result.conflicts.some(path => path.includes('Löschung gegen Änderung')));
});

test('überträgt eine Löschung, wenn die Gegenseite den Eintrag nicht geändert hat', () => {
    const result = merge(
        { planned: [{ id: 'p1', title: 'Alt' }, { id: 'p2', title: 'Bleibt' }] },
        { planned: [{ id: 'p2', title: 'Bleibt' }] },
        { planned: [{ id: 'p1', title: 'Alt' }, { id: 'p2', title: 'Bleibt' }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.planned), [{ id: 'p2', title: 'Bleibt' }]);
});

test('behandelt null ohne Basisstand nicht als sichere Löschung', () => {
    const result = merge(
        null,
        { seasonPlan: null },
        { seasonPlan: { focus: 'Classic' } }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot), { seasonPlan: { focus: 'Classic' } });
});

test('führt unabhängige Ergänzungen in primitiven Listen zusammen', () => {
    const result = merge(
        { symptoms: ['fatigue'] },
        { symptoms: ['fatigue', 'headache'] },
        { symptoms: ['fatigue', 'soreness'] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.symptoms).sort(), ['fatigue', 'headache', 'soreness']);
});

test('erhält doppelte Eintragsidentitäten, statt sie still zu überschreiben', () => {
    const result = merge(
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] },
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] },
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.equal(result.snapshot.planned.length, 2);
});

test('führt unabhängige Änderungen derselben Aktivität konfliktfrei zusammen', () => {
    const result = merge(
        { activities: [{ id: 'garmin-25171453189', name: 'Paddeln', duration: 60, distance: 8000 }] },
        { activities: [{ id: 'garmin-25171453189', name: 'Paddeln', duration: 65, distance: 8000 }] },
        { activities: [{ id: 'garmin-25171453189', name: 'Paddeln', duration: 60, distance: 8200 }] }
    );
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.activities), [
        { id: 'garmin-25171453189', name: 'Paddeln', duration: 65, distance: 8200 }
    ]);
});

test('rekonstruiert abgeleitete activityIds vor dem Abgleich statt eine lokale Löschung zu melden', () => {
    const base = {
        activityIds: ['activity-1'],
        activities: [{ id: 'activity-1', duration: 60 }]
    };
    const localStorageSnapshot = {
        activities: [{ id: 'activity-1', duration: 60 }]
    };
    const local = {
        ...localStorageSnapshot,
        activityIds: localStorageSnapshot.activities.map(activity => activity.id)
    };
    const cloud = {
        activityIds: ['activity-1', 'activity-2'],
        activities: [
            { id: 'activity-1', duration: 60 },
            { id: 'activity-2', duration: 45 }
        ]
    };
    const result = merge(base, local, cloud);
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.activityIds), ['activity-1', 'activity-2']);
});

test('erkennt weiterhin das tatsächliche Löschen einer geänderten Aktivität', () => {
    const result = merge(
        { activities: [{ id: 'activity-1', duration: 60 }] },
        { activities: [] },
        { activities: [{ id: 'activity-1', duration: 75 }] }
    );
    assert.ok(result.conflicts.some(path => path.includes('Löschung gegen Änderung')));
});

test('überträgt eine bestätigte Aktivitätslöschung über das Cloud-Aktivitätsmanifest', () => {
    const base = {
        activityIds: ['activity-1', 'activity-2'],
        activities: [
            { id: 'activity-1', duration: 60 },
            { id: 'activity-2', duration: 45 }
        ]
    };
    const local = {
        activityIds: ['activity-2'],
        activities: [{ id: 'activity-2', duration: 45 }]
    };
    // Das Manifest des Cloud-Snapshots enthält activity-1 nicht mehr.
    // Die separate activities-Tabelle kann den alten Payload noch enthalten;
    // mergeCloudActivities filtert ihn anhand des Manifests vor diesem Merge.
    const cloud = {
        activityIds: ['activity-2'],
        activities: [{ id: 'activity-2', duration: 45 }]
    };
    const result = merge(base, local, cloud);
    assert.deepEqual(plain(result.conflicts), []);
    assert.deepEqual(plain(result.snapshot.activityIds), ['activity-2']);
    assert.deepEqual(plain(result.snapshot.activities), [{ id: 'activity-2', duration: 45 }]);
});

test('erkennt identische Snapshots unabhängig von Objektschlüssel-Reihenfolge', () => {
    assert.equal(cloudSnapshotsEqual({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 }), true);
});

test('normalisiert lokale Snapshots vor dem Vergleich mit abgeleiteten activityIds', () => {
    const localStorageSnapshot = { activities: [{ id: 'activity-1', duration: 60 }] };
    const cloudComparableSnapshot = {
        activities: [{ id: 'activity-1', duration: 60 }],
        activityIds: ['activity-1']
    };
    const normalizedLocal = withCloudActivityIds(localStorageSnapshot, ['activity-1']);
    assert.deepEqual(plain(normalizedLocal), cloudComparableSnapshot);
    assert.equal(cloudSnapshotsEqual(normalizedLocal, cloudComparableSnapshot), true);
});


test('erstellt einen minimalen Patch nur für geänderte Snapshot-Bereiche', () => {
    const current = {
        planned: [{ id: 'p1', title: 'Alt' }],
        checkins: { '2026-11-25': { sleep: 8 } },
        profile: { displayName: 'Athletin' },
        activityIds: ['a1']
    };
    const target = {
        planned: [{ id: 'p1', title: 'Neu' }],
        checkins: { '2026-11-25': { sleep: 8 } },
        profile: { displayName: 'Athletin' },
        activityIds: ['a1', 'a2']
    };
    const patch = createCloudSnapshotPatch(target, current);
    assert.deepEqual(plain(patch), {
        planned: [{ id: 'p1', title: 'Neu' }],
        activityIds: ['a1', 'a2']
    });
});

test('leerer Patch bei unveränderten Snapshot-Bereichen', () => {
    const snapshot = { planned: [], checkins: {}, profile: {} };
    assert.deepEqual(plain(createCloudSnapshotPatch(snapshot, snapshot)), {});
});
