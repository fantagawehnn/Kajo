import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const sourcePath = fileURLToPath(new URL('../js/cloud-merge.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8')
    .replace(/export function/g, 'function')
    + '\nmodule.exports = { mergeCloudSnapshots, cloudSnapshotsEqual };';

const moduleSandbox = { module: { exports: {} } };
vm.runInNewContext(source, moduleSandbox, { filename: 'cloud-merge.js' });
const { mergeCloudSnapshots, cloudSnapshotsEqual } = moduleSandbox.module.exports;

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
    assert.deepEqual(result.conflicts, []);
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
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(plain(result.snapshot.planned).map(item => item.id), ['existing', 'phone', 'desktop']);
});

test('kombiniert Änderungen an unterschiedlichen Feldern desselben Eintrags', () => {
    const result = merge(
        { planned: [{ id: 'p1', title: 'Alt', duration: 60 }] },
        { planned: [{ id: 'p1', title: 'Neu', duration: 60 }] },
        { planned: [{ id: 'p1', title: 'Alt', duration: 75 }] }
    );
    assert.deepEqual(result.conflicts, []);
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
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(plain(result.snapshot.planned), [{ id: 'p2', title: 'Bleibt' }]);
});

test('behandelt null ohne Basisstand nicht als sichere Löschung', () => {
    const result = merge(
        null,
        { seasonPlan: null },
        { seasonPlan: { focus: 'Classic' } }
    );
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(plain(result.snapshot), { seasonPlan: { focus: 'Classic' } });
});

test('führt unabhängige Ergänzungen in primitiven Listen zusammen', () => {
    const result = merge(
        { symptoms: ['fatigue'] },
        { symptoms: ['fatigue', 'headache'] },
        { symptoms: ['fatigue', 'soreness'] }
    );
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(plain(result.snapshot.symptoms).sort(), ['headache', 'soreness']);
});

test('erhält doppelte Eintragsidentitäten, statt sie still zu überschreiben', () => {
    const result = merge(
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] },
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] },
        { planned: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] }
    );
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.snapshot.planned.length, 2);
});

test('erkennt identische Snapshots unabhängig von Objektschlüssel-Reihenfolge', () => {
    assert.equal(cloudSnapshotsEqual({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 }), true);
});
