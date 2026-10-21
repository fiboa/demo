/** The example fields: short flagged links in the map panel, and a card with the water map and the curve. */
import de from 'flag-icons/flags/4x3/de.svg?url';
import es from 'flag-icons/flags/4x3/es.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import pl from 'flag-icons/flags/4x3/pl.svg?url';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import FACTS from '../data/examples.json' with { type: 'json' };
import { EXAMPLES, FIRST_EXAMPLE } from './examples.js';

export { FIRST_EXAMPLE };

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { de, es, fr, pl };
const PICTURES = import.meta.glob('../examples/*.png', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const NS = 'http://www.w3.org/2000/svg';

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

function flag(country) {
  return el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });
}

/** The water share through the year: a stem per image, [day of the year, share]. */
function curve(points, days) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${days} 100`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, w] of points) {
    if (w < 0.02) continue;
    const line = document.createElementNS(NS, 'line');
    Object.entries({ x1: d, x2: d, y1: 100, y2: 100 - w * 96, class: 'water-stem', 'vector-effect': 'non-scaling-stroke' }).forEach(([k, v]) =>
      line.setAttribute(k, String(v)),
    );
    svg.append(line);
  }
  return svg;
}

/** "Maize, " or, when the collection's crops are of another year, "Maize (the crop of 2024), ". */
function cropText(facts, year) {
  if (!facts.crop) return '';
  const edition = COLLECTIONS[facts.collection]?.year;
  return edition && edition !== year ? `${facts.crop} (the crop of ${edition}), ` : `${facts.crop}, `;
}

const href = ({ lon, lat, year }) => `#${lon},${lat},${year}`;

/**
 * Fill the panel list and the cards. A click on either goes through the address (#lon,lat,year), which the
 * page already follows; `onPick` runs as well, to bring the map into view from the cards.
 */
export function renderExamples(panel, cards, onPick) {
  panel.replaceChildren(...EXAMPLES.map((e) => el('a', { href: href(e), title: e.title }, flag(e.country), ' ', e.short)));
  cards.replaceChildren(
    ...EXAMPLES.map((e) => {
      const facts = FACTS[e.id];
      const picture = PICTURES[`../examples/${e.id}.png`];
      const card = el(
        'a',
        { className: 'example-card', href: href(e) },
        el(
          'span',
          { className: 'example-water' },
          picture && el('img', { src: picture, alt: facts ? `Water around the field on ${dateText.format(new Date(facts.date))} ${e.year}` : '', loading: 'lazy', width: facts?.width, height: facts?.height }),
          facts && curve(facts.curve, facts.days),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        facts &&
          el(
            'p',
            { className: 'example-facts' },
            `${cropText(facts, e.year)}${e.year}. ${facts.images} radar images; the picture is ${dateText.format(new Date(facts.date))}, ${pct.format(facts.water)} of the field under water.`,
          ),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}
