import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();

Chart.defaults.font.family = token('--font');
Chart.defaults.font.size = 13;
Chart.defaults.color = token('--ink-muted');

export const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
export const pct = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A single-series bar chart with hover tooltips, plus a table view in `details` for readers who
 * cannot use the chart.
 */
export function barChart(canvas, { labels, values, colors, unit = 'ha', horizontal = false, details }) {
  const valueAxis = {
    grid: { color: token('--grid'), drawTicks: false },
    border: { display: false },
    ticks: { callback: (v) => fmt.format(v), padding: 8 },
  };
  const categoryAxis = { grid: { display: false }, border: { color: token('--baseline') } };
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: 'start',
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
      plugins: {
        tooltip: {
          backgroundColor: token('--ink'),
          padding: 10,
          displayColors: false,
          callbacks: { label: (item) => `${fmt.format(item.raw)} ${unit}` },
        },
      },
    },
  });
  if (details) {
    tableInto(details, [horizontal ? '' : 'Year', unit === 'ha' ? 'Hectares' : unit], labels.map((l, i) => [l, fmt.format(values[i])]));
  }
  return chart;
}

/**
 * 100 % stacked bars: per label, the share of each series. `series` is [{ label, color, values }] in
 * hectares; the tooltip shows share and hectares, the table in `details` the hectares.
 */
export function shareChart(canvas, { labels, series, details }) {
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values.map((v, i) => (totals[i] ? v / totals[i] : 0)),
        backgroundColor: s.color,
        borderColor: token('--paper'),
        borderWidth: { top: 2 },
        borderSkipped: false,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      })),
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { color: token('--baseline') } },
        y: {
          stacked: true,
          max: 1,
          grid: { color: token('--grid'), drawTicks: false },
          border: { display: false },
          ticks: { callback: (v) => pct.format(v).replace('.0', ''), padding: 8, stepSize: 0.25 },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: token('--ink'),
          padding: 10,
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            label: (item) =>
              `${item.dataset.label}: ${pct.format(item.raw)} (${fmt.format(series[item.datasetIndex].values[item.dataIndex])} ha)`,
          },
        },
      },
    },
  });
  if (details) {
    tableInto(details, ['', ...series.map((s) => s.label)], labels.map((l, i) => [l, ...series.map((s) => fmt.format(s.values[i]))]));
  }
  return chart;
}

export function tableInto(details, headers, rows) {
  const table = document.createElement('table');
  const row = (cells, tag) => {
    const tr = document.createElement('tr');
    for (const text of cells) tr.appendChild(document.createElement(tag)).textContent = text;
    return tr;
  };
  table.createTHead().append(row(headers, 'th'));
  table.createTBody().append(...rows.map((r) => row(r, 'td')));
  details.append(table);
}
