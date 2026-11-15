/** Shared compact chart readout: one value or a grouped multi-series summary. */
function getReadout(canvas) {
  if (!canvas) return null;
  const anchor = canvas.parentElement;
  let node = anchor?.nextElementSibling;
  if (!node?.classList.contains('kajo-chart-point-readout')) {
    node = document.createElement('div');
    node.className = 'kajo-chart-point-readout';
    node.setAttribute('aria-live', 'polite');
    anchor?.insertAdjacentElement('afterend', node);
  }
  return node;
}
export function showChartSummaryReadout(canvas, options = {}) {
  const node = getReadout(canvas);
  if (!node) return;
  node.replaceChildren();
  const heading = document.createElement('span');
  heading.className = 'kajo-chart-point-label';
  heading.textContent = options.title || '';
  node.appendChild(heading);
  (options.items || []).filter(item => item && item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value))).forEach(item => {
    const value = document.createElement('strong');
    value.className = 'kajo-chart-point-value';
    value.textContent = (item.label ? item.label + ' ' : '') + (item.format ? item.format(item.value) : Number(item.value).toLocaleString('de-DE',{maximumFractionDigits:2})) + (item.unit ? ' ' + item.unit : '');
    if (item.color) value.style.setProperty('--readout-series-color', item.color);
    node.appendChild(value);
  });
  (options.details || []).filter(Boolean).forEach(detail => {
    const span = document.createElement('span');
    span.className = 'kajo-chart-point-detail';
    span.textContent = detail;
    node.appendChild(span);
  });
  const time = document.createElement('span');
  time.className = 'kajo-chart-point-time';
  time.textContent = options.time || '';
  node.appendChild(time);
  node.hidden = false;
}
export function showChartPointReadout(canvas, chart, index, options = {}) {
  const datasetIndex = options.datasetIndex ?? 0;
  const dataset = chart?.data?.datasets?.[datasetIndex];
  const raw = dataset?.data?.[index];
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) return;
  showChartSummaryReadout(canvas, {
    title: options.title || dataset?.label || 'Messwert',
    time: chart.data.labels?.[index] ?? ('Messpunkt ' + (index + 1)),
    items: [{value:raw,unit:options.unit,format:options.formatValue}]
  });
}
