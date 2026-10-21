/** The example fields: short flagged links in the map panel, and a card with the year in pictures and its curve. */
import es from 'flag-icons/flags/4x3/es.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';
import us from 'flag-icons/flags/4x3/us.svg?url';

import FACTS from '../data/examples.json' with { type: 'json' };
import { EXAMPLES } from './examples.js';

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { es, nl, us };
// Twelve squares of 40 px with 2 px gaps, as scripts/season/examples.mjs draws them.
const STRIP = { width: 12 * 40 + 11 * 2, height: 40 };
const PICTURES = import.meta.glob('../examples/*.png', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });
const NS = 'http://www.w3.org/2000/svg';

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

function flag(country) {
  return el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });
}

/** The NDVI curve of a card: points [day of the season, ndvi], 0–1 over the year. */
function curve(points) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 365 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const y = (v) => 96 - Math.max(0, v) * 88;
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', points.map(([d, v], i) => `${i ? 'L' : 'M'}${d.toFixed(1)},${y(v).toFixed(1)}`).join(''));
  path.setAttribute('class', 'ndvi-line');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

const href = ({ lon, lat, year }) => `#${lon},${lat},${year}`;

/**
 * Fill the panel list and the cards. A click on either goes through the address (#lon,lat,year), which the
 * page already follows; `onPick` runs as well, to bring the map into view from the cards.
 */
export function renderExamples(panel, cards, onPick) {
  panel.replaceChildren(
    ...EXAMPLES.filter((e) => e.panel).map((e) => el('a', { href: href(e), title: e.title }, flag(e.country), ' ', e.short)),
  );
  cards.replaceChildren(
    ...EXAMPLES.map((e) => {
      const facts = FACTS[e.id];
      const picture = PICTURES[`../examples/${e.id}.png`];
      const card = el(
        'a',
        { className: 'example-card', href: href(e) },
        el(
          'span',
          { className: 'example-curve' },
          picture && el('img', { src: picture, alt: `The field once a month through ${e.year}`, loading: 'lazy', ...STRIP }),
          facts && curve(facts.curve),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        facts && el('p', { className: 'example-facts' }, `${facts.crop ? `${facts.crop}, ` : ''}${e.year}. ${facts.clear} clear images of ${facts.scenes}.`),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}

export const FIRST_EXAMPLE = EXAMPLES[0];
