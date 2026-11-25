import '../../shared/base.css';
import '../../shared/map-page.css';

import { addPromptButton } from '../../shared/prompt.js';
import { legend, story } from '../../shared/story.js';
import PROMPT from './prompt.js';
import { STEPS } from './steps.js';

addPromptButton(PROMPT);
story(document.getElementById('story'), STEPS);
for (const slot of document.querySelectorAll('[data-legend]')) slot.replaceWith(legend());
