import groupsCreate from './images/groups-create.png'
import groupsReuse from './images/groups-reuse.png'
import { selectMiddleCell } from './spotlight.js'

/*
 * The tutorial's steps, in order. The overlay shows one at a time and counts
 * them from this list, so adding a step here is all it takes to extend it.
 *
 * `spotlight` names the `data-tutorial` keys on the page: the overlay cuts a
 * rounded window around every element carrying any of them. A step without
 * one dims the whole page.
 *
 * `prepare`, if a step has one, runs as the step opens to put the page in the
 * state the step talks about, and returns how to undo that as it closes.
 *
 * `image` shows a screenshot (from ./images) above the step's text, in a
 * wider popup; `alt` describes it.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    body: "Welcome to Fretbook! A website for making guitar sheet music with an emphasis on simplicity and avoiding duplicate notes. This tutorial will walk you through the site's main features...",
  },
  {
    id: 'file-controls',
    spotlight: ['file-controls'],
    body: "Clicking the title creates a new sheet. The 'Import' button allows you to import previously exported sheets. The 'Export' button allows you to export the current sheet into a json file. Enabling the volume icon allows you to hear any note you write/click on. The presentation mode plays the current sheet arrangement in a close-up view.",
  },
  {
    id: 'account-controls',
    spotlight: ['account-controls'],
    body: 'Login to be able to save sheets on our servers. The list icon will display a list of currently saved sheets.',
  },
  {
    id: 'row',
    // The first two keys' menu is only up while a position is being edited.
    spotlight: ['first-row', 'cell-menu'],
    prepare: () => selectMiddleCell('e'),
    body: "This is a single row of your sheet. Click inside to specify values 1-24 or 'x'. when editing a note, you will notice a menu tab of additional buttons above the row. The first two are group related buttons that we will get to in the next step. The third button allows you to copy/paste a chunk of notes. The fourth button deletes the column currently selected. The fifth button inserts a new column to the right of the current one.",
  },
  {
    id: 'groups-reuse',
    image: groupsReuse,
    alt: "Two rows: group 'A' is written in the first row and played twice at the start of the second.",
    body: "Groups allow you to re-use previously written tabs to avoid duplicates! In the example, you can see group 'A' from the first row was used at the start of the second row twice.",
  },
  {
    id: 'groups-create',
    image: groupsCreate,
    alt: "The note menu with its 'start a new group' button circled, above a row whose notes have been made into a group.",
    body: 'A group is created by clicking this button on the notes menu tab and then clicking the end column of the desired section of notes you want to make a group.',
  },
]
