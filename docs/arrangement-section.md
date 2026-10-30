# Arrangement section

A collapsible section under the notes (memo) section where the sheet's groups are
laid out in playing order: group blocks with arrows between them, read left to
right, as the structure of a song.

## What it does

- Starts empty on every sheet. Empty means one dashed outline block with a `+`.
- Pressing `+` opens a picker listing the groups that exist on the sheet, by
  `groupLabel`, and the chosen one is appended to the order.
- A group may appear more than once: a chorus played twice is two blocks. The
  arrangement is a playing order, not a set.
- Each block carries the group's label, its `groupTone` colour, and an `×` that
  removes that one entry. Arrows (`→`) are drawn between blocks, never after the
  last one.
- The section folds like the notes section: closed when the arrangement is
  empty, open when the sheet arrives with one.

Out of scope for this change: reordering blocks after they are placed, playback
following the arrangement, and the text/PNG exports. Groups are still arranged
only by adding and removing entries.

## Data

One new sheet field:

| Field | Shape | Meaning |
| --- | --- | --- |
| `arrangement` | `number[]` | Group ids in playing order. Repeats allowed; `[]` for a sheet with no arrangement yet. Every id must name a group that exists. |

Entries are positional, so "remove" means remove at an index, not by id.

## Files to touch

- **`src/utils/tab.js`** — `createSheet` returns `arrangement: []`. New helpers
  beside the group helpers: `addToArrangement(arrangement, groupId)`,
  `removeFromArrangement(arrangement, at)`, and
  `clampArrangement(arrangement, groups)` which drops entries whose group has
  gone. `removeGroup` returns a cleaned `arrangement` along with `groups` and
  `members`, so deleting a group cannot leave a dangling block. `toJson` emits
  the field through `clampArrangement`; `fromJson` reads it through
  `readArrangement`, which takes a missing or non-array field as `[]` and drops
  ids no group answers to.
- **`src/App.jsx`** — `arrangement` state from `saved.arrangement`, a line in
  `applySheet`, the field in the two `toJson` calls, and
  `handleAddToArrangement` / `handleRemoveFromArrangement`, each taking a
  `remember(...)` snapshot so Undo covers them like any other edit.
- **`src/components/ArrangementSection.jsx`** — new. Owns only its own fold and
  picker-open state, the way `MemoSection` owns its fold and `GroupBar` owns its
  name draft. The picker is the existing `Popover`, anchored to the `+` block.
- **`src/components/TabEditor.jsx`** — render it directly under `MemoSection`,
  passing `groups`, `arrangement`, `editing` and the two callbacks. It takes no
  part in row edit mode: like the memo, there is nothing for it to swap with, so
  its controls are `disabled` while `editing`.
- **`src/styles.css`** — `.arrangement-*` rules: a wrapping flex row of blocks,
  the arrow between them, and the dashed add block, which is drawn the way
  `.group-add` draws somewhere to write rather than something written.
- **`docs/data-structures.md`** — a row for `arrangement` in the sheet model
  table and the field in the saved-JSON sample.

## File format

`SHEET_VERSION` stays at 12 and `arrangement` is the one optional field:
`fromJson` reads a file without it as a sheet nobody has arranged. A sheet
already autosaved in local storage, and every published note, therefore keeps
loading untouched, and `toJson` writes the field from then on. This is the one
place the project's forward-only rule is set aside, deliberately: the
alternative was emptying every reader's saved sheet for a field that means
"nothing yet" when it is missing.

## Checks

`npm run lint` and `npm run build`, then in the running app: add two groups, add
one of them twice to the arrangement, remove the middle entry, delete a group
and confirm its blocks go with it, Undo back through all of it, and reload to
confirm the arrangement survives the autosave round trip.
