/**
 * The swipe line: a handle over the map that splits it, and clipping of layers to the part left of it or to
 * an outline. Clips are canvas paths set in the layer's `prerender` and undone in its `postrender`.
 */
import { getRenderPixel } from 'ol/render.js';

/** Clip the drawing of `layer` to the polygon given by `pixels()` (map pixels, a list of rings). */
function clipTo(layer, pixels) {
  layer.on('prerender', (event) => {
    const ctx = event.context;
    ctx.save();
    ctx.beginPath();
    for (const ring of pixels()) {
      ring.forEach((p, i) => {
        const [x, y] = getRenderPixel(event, p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
    ctx.clip('evenodd');
  });
  layer.on('postrender', (event) => event.context.restore());
}

/** Clip `layer` to the outline `rings` (in view coordinates), e.g. an aerial photo to its region. */
export function clipToOutline(map, layer, rings) {
  clipTo(layer, () => rings.map((ring) => ring.map((c) => map.getPixelFromCoordinate(c))));
}

/**
 * The handle in `element`, over `map`: drag it, or focus it and use the arrow keys. Layers passed to `clip`
 * are drawn left of the line only. `split` is the share of the width left of the line.
 */
export class Swipe {
  constructor(map, element, { split = 0.5 } = {}) {
    this.map = map;
    this.element = element;
    this.split = split;
    this.touched = false; // moved by someone
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.touched = true;
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
      this.drag(event);
    });
    element.addEventListener('pointermove', (event) => {
      if (element.hasPointerCapture(event.pointerId)) this.drag(event);
    });
    const stop = (event) => {
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      element.classList.remove('is-dragging');
    };
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
    element.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.02;
      const next = { ArrowLeft: this.split - step, ArrowRight: this.split + step, Home: 0, End: 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      this.touched = true;
      this.set(next);
    });
    this.set(split);
  }

  drag(event) {
    const box = this.map.getTargetElement().getBoundingClientRect();
    this.set((event.clientX - box.left) / box.width);
  }

  set(split) {
    this.split = Math.max(0, Math.min(1, split));
    const pct = Math.round(this.split * 100);
    this.element.style.left = `${this.split * 100}%`;
    this.element.setAttribute('aria-valuenow', String(pct));
    this.element.setAttribute('aria-valuetext', `Old map on the left ${pct} %`);
    this.element.classList.toggle('at-left', this.split < 0.2);
    this.element.classList.toggle('at-right', this.split > 0.8);
    this.map.render();
  }

  /** Draw `layer` left of the line only. */
  clip(layer) {
    clipTo(layer, () => {
      const [width, height] = this.map.getSize();
      const x = width * this.split;
      return [
        [
          [0, 0],
          [x, 0],
          [x, height],
          [0, height],
        ],
      ];
    });
  }
}
