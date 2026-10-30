# Group layout mockup

**Implemented.** The editor works this way now — see `src/components/GroupBar.jsx`,
`groupRuns`/`putRowInGroup` in `src/utils/tab.js`, and the `.group*` rules in
`src/styles.css`. This folder is kept as the sketch the refactor was agreed from. The editor has
moved on from it since: a group's bar also folds its rows away and carries a ×
that deletes the group, and a row joins or leaves a group in edit mode rather
than from a chip on its own line.

A standalone mockup of a refactor of the group layout. Open
`mockups/group-layout/index.html` in a browser — no build, no dependencies.

## What it shows

- The `Groups` section above the staves is **gone**. A group is drawn where its
  rows are, not in a strip of chips at the top of the sheet.
- One group is a **thick bar across the full width of the sheet**, carrying the
  group's name, typed straight into the bar.
- A row in a group is **indented** and carries a **vertical spine** down its
  left side, the same width and colour as the bar above it, so the bar and the
  spine read as one bracket around the group.
- **Each group has its own colour**, handed out in order from `--group-1` …
  `--group-4`, and tinted at 4% behind the group's rows.
- Two groups, two distinct rows in each.

## What you can press

- Type in a group's bar to rename it.
- Hover a row, press its chip, and move the row to the other group or out of
  every group — the sheet re-lays-out underneath.
- `+ New group` adds another bar, in the next colour.
- Escape closes an open group list.

## The decision this layout forced

Today a group is a collection and not a place: `GroupSection.jsx` says its rows
"need be neither next to each other nor in any particular order". A bar with a
spine under it can only bracket rows that are adjacent, so in this mockup
**grouping a row moves it next to its group** — a group stands where its first
member stands and collects the rest. An ungrouped row renders as a plain staff
in sheet order, with no spine or indent.

The editor took this route: `putRowInGroup` moves the row as it changes what
it belongs to, and `collectGroups` gathers any older sheet whose groups were
written scattered down the page.
