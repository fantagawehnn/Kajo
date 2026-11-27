/* Chart background bands for the training-load time series. */
const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export function buildRelativeLoadZones(timeline = []) {
  const values = [];
  (Array.isArray(timeline) ? timeline : []).forEach(row => {
    if (valid(row?.ctl)) values.push(Number(row.ctl));
    if (valid(row?.atl)) values.push(Number(row.atl));
  });
  if (!values.length) return [];
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const span = Math.max(1, max - min);
  const first = min + span / 3;
  const second = min + span * 2 / 3;
  return [
    { min, max: first, label: 'Niedrig', color: 'rgba(109,168,247,.10)', textColor: 'rgba(166,202,255,.78)' },
    { min: first, max: second, label: 'Mittel', color: 'rgba(85,182,164,.10)', textColor: 'rgba(142,224,205,.78)' },
    { min: second, max, label: 'Hoch', color: 'rgba(167,139,250,.10)', textColor: 'rgba(202,181,255,.78)' }
  ];
}

export function buildTsbZones(timeline = []) {
  const values = (Array.isArray(timeline) ? timeline : [])
    .map(row => row?.tsb).filter(valid).map(Number);
  // Keep chart bands aligned with the shared KAJO TSB orientation ranges:
  // < -30, -30 to -10, -10 to +5, +5 to +25, and > +25.
  const min = Math.min(-30, ...values);
  const max = Math.max(25, ...values);
  return {
    min,
    max: max > min ? max : min + 1,
    zones: [
      { min, max: -30, label: 'Stark negativer Saldo', color: 'rgba(217,106,120,.13)', textColor: 'rgba(255,165,174,.82)' },
      { min: -30, max: -10, label: 'Erhöhte modellierte Ermüdung', color: 'rgba(229,154,85,.13)', textColor: 'rgba(255,198,150,.84)' },
      { min: -10, max: 5, label: 'Ausgeglichen', color: 'rgba(85,182,164,.13)', textColor: 'rgba(142,224,205,.82)' },
      { min: 5, max: 25, label: 'Positiver Saldo', color: 'rgba(109,168,247,.13)', textColor: 'rgba(166,202,255,.84)' },
      { min: 25, max, label: 'Sehr positiver Saldo', color: 'rgba(167,139,250,.13)', textColor: 'rgba(202,181,255,.84)' }
    ]
  };
}

export function createZoneBackgroundPlugin(zones = []) {
  return {
    id: 'kajo-training-load-zones',
    beforeDraw(chart) {
      const area = chart.chartArea;
      const scale = chart.scales?.y;
      if (!area || !scale || !Array.isArray(zones) || !zones.length) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      zones.forEach(zone => {
        const top = scale.getPixelForValue(zone.max);
        const bottom = scale.getPixelForValue(zone.min);
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
        const y = Math.max(area.top, Math.min(top, bottom));
        const height = Math.min(area.bottom, Math.max(top, bottom)) - y;
        if (height <= 0) return;
        ctx.fillStyle = zone.color;
        ctx.fillRect(area.left, y, area.right - area.left, height);
        if (height >= 20 && zone.label) {
          ctx.fillStyle = zone.textColor || 'rgba(226,232,240,.55)';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(zone.label, area.right - 7, y + height / 2, Math.max(20, area.right - area.left - 14));
        }
      });
      ctx.restore();
    }
  };
}


/* Preserve the distinction between a measured zero and an unavailable zone model. */
export function hasZoneModelData(coverage = {}, key = 'kajo') {
  const count = Number(coverage?.[key === 'kajo' ? 'activitiesWithKajoZones' : 'activitiesWithEdwards']);
  return Number.isFinite(count) && count > 0;
}

export function getZoneChartValues(seconds, mode = 'minutes', hasData = true) {
  if (!hasData || !Array.isArray(seconds) || seconds.length < 5 || !seconds.slice(0, 5).every(valid)) return [null, null, null, null, null];
  const values = seconds.slice(0, 5).map(Number);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (mode === 'percent') return total > 0 ? values.map(value => Number((value / total * 100).toFixed(1))) : [null, null, null, null, null];
  return values.map(value => Number((value / 60).toFixed(1)));
}
