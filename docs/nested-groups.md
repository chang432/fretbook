# Groups within groups

## Goal

Let a group contain rows and other groups, in any order. For example, a Verse
could contain an Intro row, a Riff group, and an Ending row. This design allows
multiple levels; the existing `+ New group` still adds a top-level group.

## Behavior

- Add a **+ New group** button inside each expanded group. It creates an empty
  child at the end of that group. Empty children stay in their chosen position.
- Draw each child with the existing group bar and spine, indented inside its
  parent. Folding a group hides all descendants; its counts include descendant
  rows, bars and notes once. A child's fold state survives folding its parent.
- In edit mode, move a row using gaps labeled with their destination group;
  dropping on a bar appends it directly to that group. Swapping rows keeps the
  existing rule: membership belongs to the destination. Add moving a group and
  its entire subtree using the same pick-up-and-drop interaction. Disallow
  dropping a group into itself or any descendant. A gap identifies both its
  parent and position, including gaps next to empty groups.
- Deleting a group removes only its bar: promote its direct rows and child
  groups into its parent at the same position (or to the top level). Remove
  arrangement entries for the deleted group only. Undo restores the whole edit.
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
  and music together as one sheet update. Deleting the last row still leaves
  at least one row, as today.

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
JSON and published notes. Write version 13 with `structure` in place of
`members`. Explicitly read version 12 and convert its existing group runs into
top-level tree nodes; append its empty groups in their current displayed order.
Keep group IDs, arrangement, row order and music intact. Read version 13 only
after validating the tree. This migration is needed to keep existing autosaves,
exports and published notes usable; the next save writes version 13. Older app
versions will not read newly saved version 13 files. The CLI publisher uses
`fromJson`; the upload validator in `docker/app/backend/app/notes.py` also
checks the version and required fields, so update it for version 13. Deploy
the reader and upload validator together and keep version 12 readable for
existing published notes.

## Checks

Run `npm run lint` and `npm run build`. Add focused tests for migration and
round trips, malformed/duplicate/deep trees, subtree moves and cycle rejection,
row swaps and annotation preservation, promotion on deletion, and playback of
parent, child, repeated and empty groups. In the app, exercise nested creation,
gaps, folding, undo, reload and arrangement on desktop and a narrow screen.
