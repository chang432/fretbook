/*
 * The tutorial's steps, in order. The overlay shows one at a time and counts
 * them from this list, so adding a step here is all it takes to extend it.
 *
 * `spotlight` names a `data-tutorial` key on the page: the overlay cuts a
 * rounded window around every element carrying it. A step without one dims
 * the whole page.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    body: "Welcome to Fretbook! A website for making guitar sheet music with an emphasis on simplicity and avoiding duplicate notes. This tutorial will walk you through the site's main features...",
  },
  {
    id: 'file-controls',
    spotlight: 'file-controls',
    body: "Clicking the title creates a new sheet. The 'Import' button allows you to import previously exported sheets. The 'Export' button allows you to export the current sheet into a json file. Enabling the volume icon allows you to hear any note you write/click on. The presentation mode plays the current sheet arrangement in a close-up view.",
  },
  // Placeholders until the rest of the tour is written.
  { id: 'step-3', body: 'Step 3 — coming soon.' },
  { id: 'step-4', body: 'Step 4 — coming soon.' },
  { id: 'step-5', body: 'Step 5 — coming soon.' },
  { id: 'step-6', body: 'Step 6 — coming soon.' },
]
