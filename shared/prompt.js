import './prompt.css';

/**
 * Adds a "Built with a prompt" button to the page header that opens a dialog with the prompt that builds the page
 * and the conversation it came from.
 *
 * @param {{prompt: string, conversation: {you: string, claude?: string}[], tips?: string[]}} story
 */
export function addPromptButton(story) {
  const dialog = promptDialog(story);
  const button = element('button', { type: 'button', class: 'prompt-button', 'aria-haspopup': 'dialog' }, 'Built with a prompt');
  button.addEventListener('click', () => dialog.showModal());
  document.querySelector('.site-header').append(button);
  document.body.append(dialog);
}

function promptDialog({ prompt, conversation, tips = [] }) {
  const dialog = element('dialog', { class: 'prompt-dialog', 'aria-labelledby': 'prompt-title' });
  const close = element('button', { type: 'button', class: 'prompt-close', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog itself, outside its content.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  const copy = element('button', { type: 'button', class: 'prompt-copy' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select the text to copy it';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });

  const turns = element('ol', { class: 'prompt-turns' });
  for (const turn of conversation) {
    const item = element('li');
    item.append(element('p', { class: 'prompt-you' }, turn.you));
    if (turn.claude) item.append(element('p', { class: 'prompt-claude' }, turn.claude));
    turns.append(item);
  }

  const content = element('div', { class: 'prompt-content' });
  content.append(
    close,
    element('h2', { id: 'prompt-title' }, 'Built with a prompt'),
    element(
      'p',
      { class: 'prompt-lede' },
      'This page was built with Claude Code, an AI coding agent, by describing it in plain language. Paste the ' +
        'prompt into Claude Code or another coding agent to build something like it.',
    ),
    element('div', { class: 'prompt-heading' }, element('h3', {}, 'The prompt'), copy),
    element('pre', { class: 'prompt-text' }, prompt),
    element('h3', {}, 'How the conversation went'),
    element(
      'p',
      { class: 'prompt-note' },
      'The page grew in a conversation, not from one message. These are the requests in order, rewritten in ' +
        'English, with what the agent did in reply.',
    ),
    turns,
  );
  if (tips.length) {
    const list = element('ul', { class: 'prompt-tips' });
    for (const tip of tips) list.append(element('li', {}, tip));
    content.append(element('h3', {}, 'What made it work'), list);
  }
  content.append(
    element(
      'p',
      { class: 'prompt-note' },
      'What the agent learned along the way is kept in the repository, in AGENTS.md, which it reads at the start ' +
        'of every session.',
    ),
  );
  dialog.append(content);
  return dialog;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}
