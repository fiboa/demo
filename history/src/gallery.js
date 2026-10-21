/** The examples: short flagged links in the map panel, and a card with the split picture and text for each. */
import be from 'flag-icons/flags/4x3/be.svg?url';
import ch from 'flag-icons/flags/4x3/ch.svg?url';
import de from 'flag-icons/flags/4x3/de.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';

import { EXAMPLES, hashOf } from './examples.js';
import { mapById, mapLabel } from './maps.js';

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { be, ch, de, fr, nl };
const PICTURES = import.meta.glob('../examples/*.jpg', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

function flag(country) {
  return el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });
}

/**
 * Fill the panel list and the cards. A click on either goes through the address, which the page already
 * follows; `onPick` runs as well, to bring the map into view from the cards.
 */
export function renderExamples(panel, cards, onPick) {
  panel.replaceChildren(
    ...EXAMPLES.map((e) => el('a', { href: hashOf(e), title: e.title }, flag(e.country), ' ', e.short)),
  );
  cards.replaceChildren(
    ...EXAMPLES.map((e) => {
      const picture = PICTURES[`../examples/${e.id}.jpg`];
      const old = mapById(e.map);
      const card = el(
        'a',
        { className: 'example-card', href: hashOf(e) },
        el(
          'span',
          { className: 'example-split' },
          picture && el('img', { src: picture, alt: `${e.title}: ${mapLabel(old, e.year)} on the left, today on the right`, loading: 'lazy', width: 640, height: 400 }),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        el('p', { className: 'example-facts' }, `${mapLabel(old, e.year)}, against today.`),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}

export const FIRST_EXAMPLE = EXAMPLES[0];
