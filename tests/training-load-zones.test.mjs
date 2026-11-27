import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRelativeLoadZones, buildTsbZones, createZoneBackgroundPlugin, hasZoneModelData, getZoneChartValues } from '../js/training-load-zones.js';

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

test('TSB chart follows the observed model scale without universal traffic-light bands', () => {
  const result = buildTsbZones([{ tsb: -32 }, { tsb: -10 }, { tsb: 2 }, { tsb: 14 }]);
  assert.equal(result.min, -35.68);
  assert.equal(result.max, 17.68);
  assert.deepEqual(result.zones, []);
  assert.equal(result.hasUniversalBands, false);
});

test('TSB chart adapts its range to narrow values and leaves universal zones disabled', () => {
  const result = buildTsbZones([{ tsb: null }, { tsb: -8 }]);
  assert.equal(result.min, -8.64);
  assert.equal(result.max, 0.64);
  assert.equal(result.zones.length, 0);
  assert.equal(result.hasUniversalBands, false);
});

test('background plugin safely skips charts without a chart area or y scale', () => {
  const plugin = createZoneBackgroundPlugin(buildRelativeLoadZones([{ ctl: 1, atl: 2 }]));
  assert.doesNotThrow(() => plugin.beforeDraw({ chartArea: null, scales: {}, ctx: {} }));
});


test('unavailable heart-rate zone model stays distinct from measured zero minutes', () => {
  assert.equal(hasZoneModelData({ activitiesWithKajoZones: 0 }, 'kajo'), false);
  assert.deepEqual(getZoneChartValues([0, 0, 0, 0, 0], 'minutes', false), [null, null, null, null, null]);
  assert.deepEqual(getZoneChartValues([0, 60, 0, 0, 0], 'minutes', true), [0, 1, 0, 0, 0]);
});

test('zone percentages require complete values and a positive measured total', () => {
  assert.deepEqual(getZoneChartValues([60, 60, 0, 0, 0], 'percent', true), [50, 50, 0, 0, 0]);
  assert.deepEqual(getZoneChartValues([0, 0, 0, 0, 0], 'percent', true), [null, null, null, null, null]);
  assert.deepEqual(getZoneChartValues([60, null, 0, 0, 0], 'minutes', true), [null, null, null, null, null]);
});
