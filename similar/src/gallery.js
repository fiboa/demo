/** The example fields: short flagged links in the map panel, and a card with picture and counts for each. */
import es from 'flag-icons/flags/4x3/es.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';
import pl from 'flag-icons/flags/4x3/pl.svg?url';
import us from 'flag-icons/flags/4x3/us.svg?url';

import FACTS from '../data/examples.json' with { type: 'json' };
import { EXAMPLES } from './examples.js';

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { es, fr, nl, pl, us };
const PICTURES = import.meta.glob('../examples/*.png', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

const flag = (country) =>
  el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });

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
          { className: 'example-picture' },
          picture && el('img', { src: picture, alt: `The fields around it, the more alike the brighter: ${e.title.toLowerCase()}`, loading: 'lazy', width: 480, height: 480 }),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        facts?.top &&
          el(
            'p',
            { className: 'example-facts' },
            el('strong', {}, `${facts.hits} of the ${facts.top}`),
            ` most alike grow ${facts.crop.toLowerCase()}, against ${facts.base} of all ${facts.fields} fields around it. Embeddings of ${facts.year}.`,
          ),
      );
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}
