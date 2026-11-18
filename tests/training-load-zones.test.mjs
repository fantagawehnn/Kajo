import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRelativeLoadZones, buildTsbZones, createZoneBackgroundPlugin } from '../js/training-load-zones.js';

test('CTL/ATL bands use a shared scale and divide the selected period into thirds', () => {
  const zones = buildRelativeLoadZones([
    { ctl: 10, atl: 40 }, { ctl: 20, atl: 50 }, { ctl: null, atl: null }
  ]);
  assert.equal(zones.length, 3);
  assert.equal(zones[0].min, 0);
  assert.equal(zones[2].max, 50);
  assert.equal(zones[0].label, 'Niedrig');
  assert.equal(zones[1].label, 'Mittel');
  assert.equal(zones[2].label, 'Hoch');
  assert.ok(Math.abs(zones[1].min - 50 / 3) < 1e-9);
});

test('CTL/ATL bands are absent when there are no valid model values', () => {
  assert.deepEqual(buildRelativeLoadZones([{ ctl: null, atl: undefined }]), []);
});

test('TSB bands preserve the phase-aware winter orientation thresholds', () => {
  const result = buildTsbZones([{ tsb: -32 }, { tsb: -10 }, { tsb: 2 }, { tsb: 14 }]);
  assert.equal(result.min, -32);
  assert.equal(result.max, 14);
  assert.deepEqual(result.zones.map(zone => [zone.min, zone.max]), [
    [-32, -20], [-20, -5], [-5, 5], [5, 14]
  ]);
  assert.deepEqual(result.zones.map(zone => zone.label), [
    'Hohe Ermüdung', 'Aufbau', 'Geringe Belastung', 'Geringe akute Belastung'
  ]);
});

test('TSB chart keeps all orientation zones visible when values are missing or narrow', () => {
  const result = buildTsbZones([{ tsb: null }, { tsb: -8 }]);
  assert.equal(result.min, -20);
  assert.equal(result.max, 6);
  assert.equal(result.zones.length, 4);
});

test('background plugin safely skips charts without a chart area or y scale', () => {
  const plugin = createZoneBackgroundPlugin(buildRelativeLoadZones([{ ctl: 1, atl: 2 }]));
  assert.doesNotThrow(() => plugin.beforeDraw({ chartArea: null, scales: {}, ctx: {} }));
});
