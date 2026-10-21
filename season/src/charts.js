/**
 * The three charts of a season on one time axis: NDVI per image, rain and degree days summed since the start
 * of the season, each with its normal. One crosshair runs through all three; a click picks the nearest image.
 */
const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;
const DAYS = 365;
const MARGIN = { left: 40, right: 64 };
const HEIGHTS = { ndvi: 190, rain: 120, gdd: 120 };
const PAD = { top: 10, bottom: 22 };

const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthText = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const signed = (v) => (v < 0 ? `−${Math.abs(v)}` : `${v}`);

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** "Nice" round steps for an axis from 0 to `max`. */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step - 1e-9);
  return Array.from({ length: top + 1 }, (_, i) => +(i * step).toFixed(10));
}

export class SeasonCharts {
  constructor({ ndvi, rain, gdd, tooltip, onPick }) {
    this.svgs = { ndvi, rain, gdd };
    this.tooltip = tooltip;
    this.onPick = onPick;
    this.model = null;
    this.hoverDay = null;
    for (const svg of Object.values(this.svgs)) {
      svg.addEventListener('pointermove', (e) => this.hover(e, svg));
      svg.addEventListener('pointerleave', () => this.hover(null));
      svg.addEventListener('click', (e) => this.click(e, svg));
    }
    new ResizeObserver(() => this.draw()).observe(ndvi);
  }

  /** model: { start (Date), points, selected (point|null), weather (null | {season, normal, days}) } */
  set(model) {
    this.model = model;
    this.draw();
  }

  get width() {
    return Math.max(280, Math.round(this.svgs.ndvi.getBoundingClientRect().width));
  }

  /** Map x of day `d` of the season. */
  x(d) {
    return MARGIN.left + (d / DAYS) * (this.width - MARGIN.left - MARGIN.right);
  }

  dayAt(event, svg) {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * this.width;
    return Math.max(0, Math.min(DAYS - 1, ((px - MARGIN.left) / (this.width - MARGIN.left - MARGIN.right)) * DAYS));
  }

  dayOf(date) {
    return (date - this.model.start) / DAY;
  }

  draw() {
    if (!this.model) return;
    this.drawNdvi();
    this.drawSum('rain', 'mm', (v) => whole.format(v));
    this.drawSum('gdd', '°C·d', (v) => whole.format(v));
    this.drawCrosshair();
  }

  /** Frame of one chart: horizontal grid with labels, month ticks along the bottom. */
  frame(svg, height, ticks, y, label) {
    const width = this.width;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.height = `${height}px`;
    const g = svgEl('g', { class: 'frame' });
    for (const t of ticks) {
      g.append(svgEl('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(t), y2: y(t), class: t === ticks[0] ? 'baseline' : 'grid' }));
      const text = svgEl('text', { x: MARGIN.left - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' });
      text.textContent = label(t);
      g.append(text);
    }
    const bottom = height - PAD.bottom;
    for (let m = 0; m < 12; m++) {
      const first = new Date(Date.UTC(this.model.start.getUTCFullYear(), this.model.start.getUTCMonth() + m, 1));
      const d = this.dayOf(first);
      g.append(svgEl('line', { x1: this.x(d), x2: this.x(d), y1: bottom, y2: bottom + 4, class: 'baseline' }));
      const text = svgEl('text', { x: this.x(d + 15), y: bottom + 16, class: 'tick', 'text-anchor': 'middle' });
      text.textContent = monthText.format(first);
      g.append(text);
    }
    return g;
  }

  drawNdvi() {
    const svg = this.svgs.ndvi;
    const height = HEIGHTS.ndvi;
    const { points, selected } = this.model;
    const lowest = Math.min(0, ...points.map((p) => p.ndvi.median));
    const lo = lowest < 0 ? Math.floor(lowest * 4) / 4 : 0;
    const y = (v) => PAD.top + ((1 - v) / (1 - lo)) * (height - PAD.top - PAD.bottom);
    const ticks = [];
    for (let v = lo; v <= 1 + 1e-9; v += 0.25) ticks.push(+v.toFixed(2));
    const g = this.frame(svg, height, ticks, y, (v) => signed(v));

    const good = points.filter((p) => !p.dip);
    if (good.length > 1) {
      const d = good.map((p, i) => `${i ? 'L' : 'M'}${this.x(this.dayOf(p.scene.date)).toFixed(1)},${y(p.ndvi.median).toFixed(1)}`).join('');
      g.append(svgEl('path', { d, class: 'ndvi-line' }));
    }
    for (const p of points) {
      const cx = this.x(this.dayOf(p.scene.date));
      const cy = y(p.ndvi.median);
      if (p === selected) g.append(svgEl('circle', { cx, cy, r: 8, class: 'ndvi-selected' }));
      g.append(svgEl('circle', { cx, cy, r: 4, class: p.dip ? 'ndvi-dip' : 'ndvi-point' }));
    }
    this.crosshairs ??= {};
    this.crosshairs.ndvi = { y, height };
    svg.replaceChildren(g);
  }

  drawSum(key, unit, format) {
    const svg = this.svgs[key];
    const height = HEIGHTS[key];
    const weather = this.model.weather;
    const values = weather?.season[key] ?? [];
    const normal = weather?.normal[key] ?? [];
    const max = Math.max(1, ...values, ...normal);
    const ticks = niceTicks(max, 3);
    const top = ticks.at(-1);
    const y = (v) => PAD.top + (1 - v / top) * (height - PAD.top - PAD.bottom);
    const g = this.frame(svg, height, ticks, y, format);
    const path = (series) => series.map((v, i) => `${i ? 'L' : 'M'}${this.x(i + 0.5).toFixed(1)},${y(v).toFixed(1)}`).join('');
    if (normal.length) {
      g.append(svgEl('path', { d: path(normal), class: 'normal-line' }));
      const end = svgEl('text', { x: this.width - MARGIN.right + 6, y: y(normal.at(-1)) + 4, class: 'end-label muted' });
      end.textContent = `${format(normal.at(-1))} normal`;
      g.append(end);
    }
    if (values.length) {
      g.append(svgEl('path', { d: path(values), class: `${key}-line` }));
      const last = values.length - 1;
      const end = svgEl('text', { x: this.x(last + 0.5) + 6, y: y(values[last]) - 6, class: 'end-label' });
      end.textContent = `${format(values[last])} ${unit}`;
      if (last < DAYS - 1) g.append(end);
      else {
        end.setAttribute('x', this.width - MARGIN.right + 6);
        end.setAttribute('y', y(values[last]) + 4);
        // Keep the two end labels apart.
        const gap = Math.abs(y(values[last]) - y(normal.at(-1) ?? -1e9));
        if (gap < 14) end.setAttribute('y', y(values[last]) + (values[last] > (normal.at(-1) ?? 0) ? -8 : 16));
        g.append(end);
      }
    }
    this.crosshairs[key] = { y, height };
    svg.replaceChildren(g);
  }

  hover(event, svg) {
    this.hoverDay = event ? this.dayAt(event, svg) : null;
    this.drawCrosshair(event);
  }

  /** The image nearest to day `d`, within a week, or null. */
  nearest(d) {
    let best = null;
    for (const p of this.model?.points ?? []) {
      const dist = Math.abs(this.dayOf(p.scene.date) - d);
      if (dist <= 7 && (!best || dist < best.dist)) best = { p, dist };
    }
    return best?.p ?? null;
  }

  drawCrosshair(event) {
    for (const svg of Object.values(this.svgs)) svg.querySelector('.crosshair')?.remove();
    if (this.hoverDay == null || !this.model) {
      this.tooltip.hidden = true;
      return;
    }
    const d = Math.floor(this.hoverDay);
    const near = this.nearest(this.hoverDay);
    const x = near ? this.x(this.dayOf(near.scene.date)) : this.x(d + 0.5);
    for (const [key, svg] of Object.entries(this.svgs)) {
      const { height } = this.crosshairs?.[key] ?? { height: HEIGHTS[key] };
      svg.append(svgEl('line', { x1: x, x2: x, y1: PAD.top, y2: height - PAD.bottom, class: 'crosshair' }));
    }
    const date = new Date(this.model.start.getTime() + d * DAY);
    const lines = [];
    if (near) {
      lines.push(`<strong>${dateText.format(near.scene.date)}</strong>: NDVI ${twoDecimals.format(near.ndvi.median)}${near.dip ? ' (probably haze)' : ''}`);
      lines.push(`half the field between ${twoDecimals.format(near.ndvi.p25)} and ${twoDecimals.format(near.ndvi.p75)}; click to see the image`);
    } else {
      lines.push(`<strong>${dateText.format(date)}</strong>`);
    }
    const w = this.model.weather;
    if (w && d < w.days) {
      const rain = w.season.rain[d];
      const gdd = w.season.gdd[d];
      lines.push(`Rain so far ${whole.format(rain)} mm (normal ${whole.format(w.normal.rain[d])}), ${oneDecimal.format(w.season.temp[d])} °C that day`);
      lines.push(`Degree days ${whole.format(gdd)} (normal ${whole.format(w.normal.gdd[d])})`);
    }
    this.tooltip.innerHTML = lines.map((l) => `<span>${l}</span>`).join('');
    this.tooltip.hidden = false;
    if (event) {
      const parent = this.tooltip.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1e9 };
      const left = Math.min(event.clientX - parent.left + 14, parent.width - this.tooltip.offsetWidth - 8);
      this.tooltip.style.transform = `translate(${Math.max(8, left)}px, ${event.clientY - parent.top + 14}px)`;
    }
  }

  click(event, svg) {
    const near = this.nearest(this.dayAt(event, svg));
    if (near) this.onPick(near);
  }
}
