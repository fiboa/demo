/** The example fields: short flagged links in the map panel, and a card with its neighbourhood and its years. */
import be from 'flag-icons/flags/4x3/be.svg?url';
import dk from 'flag-icons/flags/4x3/dk.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';

import FACTS from '../data/examples.json' with { type: 'json' };
import { GROUP, cropName, series } from './crops.js';
import { EXAMPLES, FIRST_EXAMPLE, exampleHash } from './examples.js';

export { FIRST_EXAMPLE };

// Only the flags of countries with an example are bundled; add one here with a new country.
const FLAGS = { be, dk, nl };
const PICTURES = import.meta.glob('../examples/*.png', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

function flag(country) {
  return el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });
}

/** The field's years as a row of coloured cells, first and last year under it. */
function strip(facts) {
  const list = series(facts);
  return el(
    'span',
    { className: 'card-strip' },
    el(
      'span',
      { className: 'card-cells' },
      ...list.map((x) =>
        el('span', {
          className: x.group ? '' : 'is-none',
          style: x.group ? `background:${GROUP[x.group].colour}` : '',
          title: `${x.year}: ${x.group ? (cropName(x.code) ?? GROUP[x.group].name) : 'no crop registered'}`,
        }),
      ),
    ),
    el('span', { className: 'card-years' }, el('span', {}, String(list[0].year)), el('span', {}, String(list.at(-1).year))),
  );
}

/**
 * Fill the panel list and the cards. A click on either goes through the address, which the page already
 * follows; `onPick` runs as well, to bring the map into view from the cards.
 */
export function renderExamples(panel, cards, onPick) {
  panel.replaceChildren(...EXAMPLES.map((e) => el('a', { href: exampleHash(e), title: e.title }, flag(e.country), ' ', e.short)));
  cards.replaceChildren(
    ...EXAMPLES.map((e) => {
      const facts = FACTS[e.id];
      const picture = PICTURES[`../examples/${e.id}.png`];
      const card = el(
        'a',
        { className: 'example-card', href: exampleHash(e) },
        el(
          'span',
          { className: 'example-rotation' },
          picture && el('img', { src: picture, alt: `Fields around the example, coloured as on the map`, loading: 'lazy', width: facts?.width, height: facts?.height }),
          facts && strip(facts),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(onPick));
      return card;
    }),
  );
}
