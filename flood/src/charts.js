/**
 * The year of a field in two charts on one time axis: the share of the field under water in each radar image,
 * and the rain of each day. One crosshair runs through both; a click picks the nearest image.
 */
const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;
const MARGIN = { left: 44, right: 16 };
const HEIGHTS = { water: 190, rain: 110 };
const PAD = { top: 10, bottom: 22 };

const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthText = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** "Nice" round steps for an axis from 0 to `max`. */
export function niceTicks(max, count = 3) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step - 1e-9);
  return Array.from({ length: top + 1 }, (_, i) => +(i * step).toFixed(10));
}

export class FloodCharts {
  constructor({ water, rain, tooltip, onPick }) {
    this.svgs = { water, rain };
    this.tooltip = tooltip;
    this.onPick = onPick;
    this.model = null;
    this.hoverDay = null;
    for (const svg of Object.values(this.svgs)) {
      svg.addEventListener('pointermove', (e) => this.hover(e, svg));
      svg.addEventListener('pointerleave', () => this.hover(null));
      svg.addEventListener('click', (e) => this.click(e, svg));
    }
    new ResizeObserver(() => this.draw()).observe(water);
  }

  /** model: { start (Date), days, points, selected (point|null), rain (null | [mm per day]) } */
  set(model) {
    this.model = model;
    this.draw();
  }

  get width() {
    return Math.max(280, Math.round(this.svgs.water.getBoundingClientRect().width));
  }

  x(d) {
    return MARGIN.left + (d / this.model.days) * (this.width - MARGIN.left - MARGIN.right);
  }

  dayAt(event, svg) {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * this.width;
    const d = ((px - MARGIN.left) / (this.width - MARGIN.left - MARGIN.right)) * this.model.days;
    return Math.max(0, Math.min(this.model.days - 1, d));
  }

  dayOf(date) {
    return (date - this.model.start) / DAY;
  }

  draw() {
    if (!this.model) return;
    this.drawWater();
    this.drawRain();
    this.drawCrosshair();
  }

  /** Frame of one chart: horizontal grid with labels, month ticks along the bottom. */
  frame(svg, height, ticks, y, label) {
    const width = this.width;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.height = `${height}px`;
    const g = svgEl('g');
    for (const t of ticks) {
      g.append(svgEl('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(t), y2: y(t), class: t === ticks[0] ? 'baseline' : 'grid' }));
      const text = svgEl('text', { x: MARGIN.left - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' });
      text.textContent = label(t);
      g.append(text);
    }
    const bottom = height - PAD.bottom;
    for (let m = 0; m < 12; m++) {
      const first = new Date(Date.UTC(this.model.start.getUTCFullYear(), m, 1));
      const d = this.dayOf(first);
      g.append(svgEl('line', { x1: this.x(d), x2: this.x(d), y1: bottom, y2: bottom + 4, class: 'baseline' }));
      const text = svgEl('text', { x: this.x(d + 15), y: bottom + 16, class: 'tick', 'text-anchor': 'middle' });
      text.textContent = monthText.format(first);
      g.append(text);
    }
    return g;
  }

  drawWater() {
    const svg = this.svgs.water;
    const height = HEIGHTS.water;
    const { points, selected } = this.model;
    const y = (v) => PAD.top + (1 - v) * (height - PAD.top - PAD.bottom);
    const g = this.frame(svg, height, [0, 0.25, 0.5, 0.75, 1], y, (v) => pct.format(v));
    // Water stands for days: a stem from the baseline for each image, so a flood reads as a block of them.
    for (const p of points) {
      const cx = this.x(this.dayOf(p.scene.date));
      g.append(svgEl('line', { x1: cx, x2: cx, y1: y(0), y2: y(p.water), class: 'water-stem' }));
    }
    for (const p of points) {
      const cx = this.x(this.dayOf(p.scene.date));
      if (p === selected) g.append(svgEl('circle', { cx, cy: y(p.water), r: 8, class: 'water-selected' }));
      g.append(svgEl('circle', { cx, cy: y(p.water), r: p.water >= 0.05 ? 3.5 : 2, class: 'water-point' }));
    }
    this.layout ??= {};
    this.layout.water = { height };
    svg.replaceChildren(g);
  }

  drawRain() {
    const svg = this.svgs.rain;
    const height = HEIGHTS.rain;
    const rain = this.model.rain ?? [];
    const ticks = niceTicks(Math.max(10, ...rain.filter((v) => v != null)), 2);
    const top = ticks.at(-1);
    const y = (v) => PAD.top + (1 - v / top) * (height - PAD.top - PAD.bottom);
    const g = this.frame(svg, height, ticks, y, (v) => whole.format(v));
    const w = Math.max(1, this.x(1) - this.x(0) - 0.5);
    rain.forEach((v, d) => {
      if (!(v > 0)) return;
      g.append(svgEl('rect', { x: this.x(d) + 0.25, y: y(v), width: w, height: y(0) - y(v), class: 'rain-bar' }));
    });
    this.layout.rain = { height };
    svg.replaceChildren(g);
  }

  hover(event, svg) {
    this.hoverDay = event && this.model ? this.dayAt(event, svg) : null;
    this.drawCrosshair(event);
  }

  /** The image nearest to day `d`, within four days, or null. */
  nearest(d) {
    let best = null;
    for (const p of this.model?.points ?? []) {
      const dist = Math.abs(this.dayOf(p.scene.date) - d);
      if (dist <= 4 && (!best || dist < best.dist)) best = { p, dist };
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
      const { height } = this.layout?.[key] ?? { height: HEIGHTS[key] };
      svg.append(svgEl('line', { x1: x, x2: x, y1: PAD.top, y2: height - PAD.bottom, class: 'crosshair' }));
    }
    const lines = [];
    if (near) {
      lines.push(`<strong>${dateText.format(near.scene.date)}</strong>: ${pct.format(near.water)} of the field under water`);
      lines.push(`radar ${oneDecimal.format(near.vv)} dB (median), ${near.scene.orbit} pass; click to see the map`);
    } else {
      lines.push(`<strong>${dateText.format(new Date(this.model.start.getTime() + d * DAY))}</strong>`);
    }
    const rain = this.model.rain?.[d];
    if (rain != null) {
      const week = this.model.rain.slice(Math.max(0, d - 6), d + 1).reduce((a, b) => a + (b ?? 0), 0);
      lines.push(`Rain that day ${oneDecimal.format(rain)} mm, the week up to it ${whole.format(week)} mm`);
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
    if (!this.model) return;
    const near = this.nearest(this.dayAt(event, svg));
    if (near) this.onPick(near);
  }
}
