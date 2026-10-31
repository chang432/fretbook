# Groups within groups

## Goal

Let a group contain rows and other groups, in any order. For example, a Verse
could contain an Intro row, a Riff group, and an Ending row. This design allows
multiple levels; the existing `+ New group` still adds a top-level group.

## Behavior

- The only **+ New group** button is at the bottom of the page; it creates an
  empty top-level group. To nest it, pick it up in edit mode and move it into
  another group. Empty groups stay in their chosen position.
- Draw each child with the existing group bar and spine, indented inside its
  parent. Folding a group hides all descendants; its counts include descendant
  rows, bars and notes once. A child's fold state survives folding its parent.
- In edit mode, move a row using gaps labeled with their destination group;
  dropping on a bar appends it directly to that group. Swapping rows keeps the
  existing rule: membership belongs to the destination. Add moving a group and
  its entire subtree using the same pick-up-and-drop interaction. Disallow
  dropping a group into itself or any descendant. A gap identifies both its
  parent and position, including gaps next to empty groups.
- Deleting a group removes the group, all descendant groups and rows, and the
  music in those rows. Remove arrangement entries for every deleted group.
  Undo restores the entire subtree and its arrangement entries in one step.
  If no rows remain, create one blank, ungrouped row so the sheet stays usable;
  a sheet can then have no groups until another is added.
- The arrangement picker offers any group containing descendant rows. An
  arranged parent plays all its descendant rows once in sheet order; an
  arranged child plays only its own subtree. Arranging both plays each selected
  block in turn, including intentional repeats. Empty arranged groups are skipped.

## Data and changes

Today `src/utils/tab.js` stores a flat `groups` list and `members` mapping,
with each group's rows contiguous. `groupRuns` derives the display from rows;
it cannot place an empty child between siblings. Replace `members` with an
ordered tree of references, while retaining `groups` for names and IDs and
`rowIds` / `rows` / `grid` for the music:

```js
// Sheet field: order is significant, including empty groups.
structure: [
  { groupId: 0, children: [
    { rowId: 10 },
    { groupId: 1, children: [{ rowId: 11 }] },
    { rowId: 12 },
  ] },
]
```

Each row and group appears exactly once in the tree. A row outside groups is a
root-level row node. Flattening row nodes must equal `rowIds` in order; all
subtrees are therefore contiguous. Limit nesting depth (for example, 8) and
validate node shapes, unique and existing IDs, coverage, and depth on import.
Reject invalid trees rather than silently dropping music. The limit also keeps
the editor usable on narrow screens.

- **`src/utils/tab.js`**: add tree traversal, insertion, removal and validation
  helpers; replace `groupRuns`, `emptyGroups`, `rowsInGroup` and membership
  operations with tree-based equivalents. Tree edits that change row order must
  call the existing row reordering machinery so grid slices, ties and marks
  travel with their rows. Add, delete, move and swap rows must update the tree
  and music together as one sheet update. Subtree deletion removes its grid
  slices, names, ties and marks, adjusts remaining annotations, and creates a
  blank ungrouped row if needed. Update sheet validation to allow zero groups
  while retaining the requirement for at least one row.

```js
// Sketch: playback and counts share this traversal.
function descendantRowIds(node) {
  return 'rowId' in node
    ? [node.rowId]
    : node.children.flatMap(descendantRowIds)
}
// For a move, remove the node, insert it at { parentId, childIndex },
// then reorder the music to match the resulting flattened row IDs.
```

- **`src/App.jsx`**: put `structure` in sheet state, `applySheet`, history
  snapshots, autosave and import/export; pass parent and insertion position to
  add/move handlers. Each structural operation takes one `remember` snapshot.
- **`src/components/TabEditor.jsx`, `GroupBar.jsx`, `src/styles.css`**:
  render tree nodes recursively, reuse the bar and row controls, and scope gaps
  to the containing node. Provide accessible destination labels and keyboard
  cancellation, and check deep indentation at mobile widths.
- **`src/utils/live.js` and `ArrangementSection.jsx`**: derive playable groups
  and row indices from descendant rows; preserve the arranged group's label
  and colour for its whole playback block.
- **`docs/data-structures.md` and `README.md`**: update the model and user
  instructions after implementation.

## Saved sheets

`toJson` / `fromJson` currently use version 12 for local storage, downloaded
JSON and published notes. Write and accept only version 13, with `structure` in
place of `members`, and validate the tree on read. The CLI publisher uses
`fromJson`; update the upload validator in `docker/app/backend/app/notes.py`
to require the same version and fields. Remove existing old-format fallbacks
throughout the repository, including the missing `arrangement` fallback and
any obsolete readers, validators and tests. Search the app, backend, scripts
and tests for legacy sheet versions and fields to verify this.

As part of implementation, migrate both `fretbook-notes-dev` and
`fretbook-notes-prod`:

1. Pull and preserve a backup of every note and manifest from each bucket.
   Inventory all note objects, including any absent from the manifest.
2. Use a temporary, one-off converter outside the repository to turn each
   version 12 group run into a top-level tree node, appending empty groups in
   their displayed order. Preserve IDs, arrangement, row order, music, titles
   and annotations. Stop on invalid input; validate every result with the new
   reader and compare it with its source.
3. Publish the converted notes back to their respective buckets, preserving
   slugs and manifest entries. Coordinate each bucket's cutover with deployment
   of its new frontend and backend: old and new formats cannot be read by the
   other release, so there may be a brief interruption. Verify every published
   object and manifest afterwards. Retain the backups for recovery, then remove
   the temporary converter; no compatibility logic remains in the repository.

Old browser autosaves and downloaded JSON files will not open in the new app.
An unrecognized autosave must not be silently overwritten; surface the failure
so its existing data can be recovered separately. Older app versions cannot
open the converted notes; rollback requires restoring the corresponding bucket
backup alongside the old app.

## Checks

Run `npm run lint` and `npm run build`. Check the one-off conversion against
every pulled note and verify that old-format imports are rejected. Add focused
tests for round trips, malformed/duplicate/deep trees, subtree moves and cycle rejection,
row swaps and annotation preservation, subtree deletion and undo (including
deleting all rows), and playback of parent, child, repeated and empty groups.
In the app, exercise creating a group at the bottom and moving it inside
another, gaps, folding, undo, reload and arrangement on desktop and a narrow
screen.
