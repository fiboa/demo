import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import LANDING from '../prompt.js';
import { demos } from '../vite.config.js';

const stories = {
  landing: LANDING,
  ...Object.fromEntries(
    await Promise.all(demos.map(async (d) => [d, (await import(`../${d}/src/prompt.js`)).default])),
  ),
};

test('every page has a prompt and a conversation that starts with a request', () => {
  for (const [page, { prompt, conversation, tips = [] }] of Object.entries(stories)) {
    assert.ok(prompt.trim().length > 100, page);
    assert.ok(conversation.length > 0, page);
    for (const turn of conversation) {
      assert.ok(turn.you.trim(), page);
      if ('claude' in turn) assert.ok(turn.claude.trim(), page);
    }
    for (const tip of tips) assert.ok(tip.trim(), page);
  }
});

test('every demo shows its prompt button', async () => {
  for (const d of demos) {
    const main = await readFile(new URL(`../${d}/src/main.js`, import.meta.url), 'utf8');
    assert.match(main, /addPromptButton\(PROMPT\)/, d);
  }
});
