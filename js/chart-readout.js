/** Einheitliche, kompakte Datenpunktanzeige unter Chart.js-Diagrammen. */
export function showChartPointReadout(canvas, chart, index, options = {}) {
  if (!canvas || !chart || !Number.isInteger(index)) return;
  const label = chart.data.labels?.[index] ?? ('Messpunkt ' + (index + 1));
  const datasetIndex = options.datasetIndex ?? 0;
  const dataset = chart.data.datasets?.[datasetIndex];
  const raw = dataset?.data?.[index];
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) return;
  let readout = canvas.parentElement?.nextElementSibling;
  if (!readout?.classList.contains('kajo-chart-point-readout')) {
    readout = document.createElement('div');
    readout.className = 'kajo-chart-point-readout';
    readout.setAttribute('aria-live', 'polite');
    canvas.parentElement?.insertAdjacentElement('afterend', readout);
  }
  const value = options.formatValue ? options.formatValue(raw) : Number(raw).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const title = options.title || dataset?.label || 'Messwert';
  readout.innerHTML = '<span class="kajo-chart-point-label"></span><strong class="kajo-chart-point-value"></strong><span class="kajo-chart-point-time"></span>';
  readout.querySelector('.kajo-chart-point-label').textContent = title;
  readout.querySelector('.kajo-chart-point-value').textContent = value + (options.unit ? ' ' + options.unit : '');
  readout.querySelector('.kajo-chart-point-time').textContent = label;
  readout.hidden = false;
}
