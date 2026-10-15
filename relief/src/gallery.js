/** The example fields: short flagged links in the map panel, and a card with picture and text for each. */
import be from 'flag-icons/flags/4x3/be.svg?url';
import ch from 'flag-icons/flags/4x3/ch.svg?url';
import de from 'flag-icons/flags/4x3/de.svg?url';
import ee from 'flag-icons/flags/4x3/ee.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import it from 'flag-icons/flags/4x3/it.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';
import us from 'flag-icons/flags/4x3/us.svg?url';

import FACTS from '../data/examples.json' with { type: 'json' };
import { EXAMPLES } from './examples.js';

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { be, ch, de, ee, fr, it, nl, us };
const PICTURES = import.meta.glob('../examples/*.png', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

function flag(country) {
  return el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });
}

/** "39 cm" on flat land, "56.2 m" on a hillside, as in the panel. */
function spread({ spread: d }) {
  return d < 10 ? `${Math.round(d * 100)} cm` : `${oneDecimal.format(d)} m`;
}

const href = ({ lon, lat }) => `#${lon},${lat}`;

/**
 * Fill the panel list and the cards. A click on either goes through the address (#lon,lat), which the page
 * already follows; `onPick` runs as well, to bring the map into view from the cards.
 */
export function renderExamples(panel, cards, onPick) {
  panel.replaceChildren(
    ...EXAMPLES.filter((e) => e.panel).map((e) =>
      el('a', { href: href(e), title: e.title }, flag(e.country), ' ', e.short),
    ),
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
          picture &&
            el('img', {
              src: picture,
              alt: `Height map of the field, ${e.title.toLowerCase()}`,
              loading: 'lazy',
              width: facts?.width ?? '',
              height: facts?.height ?? '',
            }),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        facts &&
          el(
            'p',
            { className: 'example-facts' },
            `${facts.crop ? `${facts.crop}, ` : ''}${oneDecimal.format(facts.area / 1e4)} ha. `,
            el('strong', {}, spread(facts)),
            ` from the lowest to the highest part, ${facts.dem}.`,
          ),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}

export const FIRST_EXAMPLE = EXAMPLES[0];
