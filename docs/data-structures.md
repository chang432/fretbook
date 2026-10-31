# Data structures

This inventory describes the application-owned structures in the current source tree, including the editor, serialized files, published-note API, and important transient structures. Ordinary library objects, primitive UI flags, build configuration, and DOM events are omitted. The code is authoritative: [tab.js](../src/utils/tab.js) defines the sheet model and JSON reader/writer.

## Sheet model

The editor holds a sheet as `{ grid, rows, rowIds, names, groups, structure, arrangement, ties, marks }`. The title and memo are separate React state but are included in storage and exports. Helpers sometimes return a partial sheet containing only changed fields; `applySheet` merges those fields into state. New sheets start with one four-bar row, one unnamed group containing that row, and an empty grid.

| Structure | Shape | Meaning and invariants |
| --- | --- | --- |
| Grid | `string[][]` | Column-major: `grid[absoluteColumn][stringIndex]`. Each column has six cells, high E through low E. A cell is `''`, `'x'`, or a normalized fret string `'0'`–`'24'`. A column represents a chord/position. |
| Rows | `number[]` | Bar count for each staff row, in displayed order. A bar is four columns; a row's starting column is the sum of preceding row widths. At least one row is required. |
| Row IDs | `number[]` | Unique nonnegative integers parallel to `rows`; identify the music in a row as it moves. New IDs are chosen above the current maximum. |
| Row names | `{ [rowId]: string }` | Sparse object keyed by row ID (JSON object keys are strings). Empty names are absent; names are whitespace-normalized and limited to 24 characters. |
| Groups | `{ id: number, name: string }[]` | Unique nonnegative group IDs and names; empty groups may exist. Editor-entered names are normalized and limited to 24 characters. |
| Structure | `{ rowId }` or `{ groupId, children }` nodes | Ordered tree; each row and group occurs once, depth is at most eight, and flattened row IDs match `rowIds`. Root rows are ungrouped. |
| Arrangement | `number[]` | The order the groups are played in, as group ids. Repeats are allowed — a group may appear more than once or not at all — and a block is addressed by its position, not by the group it names. Every id must name an existing group; `[]` means nothing has been arranged. |
| Ties | `{ string: number, from: number, to: number }[]` | Arc between two occupied cells on one string, with ordered absolute column endpoints (`from < to`). A note can have at most one tie on each side. Import drops invalid endpoints and conflicting ties. |
| Marks | `{ string: number, col: number, symbol: string }[]` | Symbol on an occupied cell, addressed by absolute column and string; currently `symbol` is `'zigzag'`. The editor toggles at most one mark per cell; import filters unsupported symbols and empty cells. |
| Memo | `string` | Sheet-wide prose, limited to 4,000 characters on reading and export. |
| Tuning | `string[]` | Export metadata, normally `['e', 'B', 'G', 'D', 'A', 'E']`. The editor and audio use standard tuning; `fromJson` requires an array but does not return or apply its contents. |

Deleting a group deletes its descendant rows and groups and their arrangement blocks. Row reordering moves grid slices, IDs, ties and marks together; names are keyed by ID. Swapping rows assigns group membership according to the destination places. Moving a row into or out of a group changes membership and position. Ties and marks use absolute columns, so operations that add, remove, move, shift, or paste columns also adjust or remove affected annotations.

## Saved and published JSON

`toJson` produces the same versioned object for JSON downloads, browser local storage (`fretboard-notebook:v1`), and published notes:

```json
{
  "format": "fretboard-notebook",
  "version": 13,
  "title": "Example",
  "tuning": ["e", "B", "G", "D", "A", "E"],
  "memo": "",
  "rows": [4],
  "rowIds": [0],
  "names": {"0": "Intro"},
  "groups": [{"id": 0, "name": "Verse"}],
  "structure": [{"groupId": 0, "children": [{"rowId": 0}]}],
  "arrangement": [0, 0],
  "columns": [["0", "", "", "", "", ""]],
  "ties": [],
  "marks": []
}
```

This illustrates the field shapes; a valid four-bar row needs **16** six-cell columns. `columns` is called `grid` in memory. `fromJson` accepts only version 13, requires at least one row, validates the tree and arrangement, and requires the number of columns to match the row widths. Zero groups are allowed. Imports are bounded to 10,000 columns and 1,000 rows; malformed sheets return `null`. An unreadable autosave is retained and blocks autosaving over it.

The published manifest at `notes.json` is an array of `{ slug, title }`; its slug identifies `notes/<slug>.json` and `/notes/<slug>`. Slugs match `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`. The publisher sorts the manifest by title and then slug. The backend checks that the manifest is a JSON array; the frontend filters entries without a slug. A note endpoint serves JSON bytes, and the frontend applies the full sheet parser. Backend error responses are `{ error: string }`.

## Editing and view state

These structures are transient and are not part of the saved sheet. See [App.jsx](../src/App.jsx), [TabEditor.jsx](../src/components/TabEditor.jsx), [live.js](../src/utils/live.js), and [history.js](../src/utils/history.js).

| Structure | Shape | Purpose |
| --- | --- | --- |
| Undo history | `{ label, token, state }[]` | Oldest-first snapshots, capped at five. `state` contains sheet fields and may also contain `title` or `memo`. Repeated non-null tokens coalesce consecutive typing actions. |
| Focus | `{ col, string, element }` or `null` | Selected cell, with its absolute column, string index and DOM element. |
| Selection range | `{ row, from, to }` or `null` | Copy selection by row index and absolute columns. `to` is `null` until the second endpoint is selected; completed ranges have ordered inclusive endpoints. |
| Paste target | `{ row, start, end, at, last, fits }` | Derived target row, inclusive row bounds, starting and last absolute columns, and whether the selection fits. Pending paste confirmation stores an absolute column or `null`. |
| Shift rows | `Map<rowIndex, columnIndex \| null>` | Rows with shift controls open and their optional anchor. |
| Folded groups / rows | `Set<groupId>`, `Set<rowId>` | Collapsed view state, not persisted. |
| Cell references | `Map<string, HTMLElement>` | Input elements indexed by `"col:string"` for focus and keyboard navigation. |
| Song runs | `{ at, block, groupId, row, rowId, opens, gridStart, cols, beat }[]` | What live mode plays, derived from the arrangement by `songRuns`: one entry per row of each arranged block, in playing order. `at` is the block's index in `arrangement`; `block` is its ordinal among the blocks that have rows to play; `opens` marks the first row of a block; `gridStart` and `cols` are absolute grid columns, and `beat` is the song position the entry starts at. One grid column is one beat. A block whose group holds no rows produces no entries, so an arrangement of only-empty groups yields none at all. |
| Playback tempo | `number` (BPM) | Session state in `App.jsx`, bounded by `clampBpm` to 20–300 and defaulting to 90. Not part of the sheet or the saved file: the player's prompt asks for it per launch. |
| Row order / offsets | `number[]`, `Map<rowIndex, number>` | Reordering uses an array of previous row indices and a map of column displacement to move annotations. Row-start arrays map row indices to absolute columns. |
| Other selections | row index, tie target column, pending removal row index, or `null` | Track a selected row, tie cursor and confirmation for bar removal. |

## Routing, rendering, audio and publishing

- Routes are discriminated objects: `{ name: 'editor' }`, `{ name: 'index' }`, or `{ name: 'note', slug }` ([route.js](../src/utils/route.js)). A published-note page has `{ status: 'loading' }`, `{ status: 'missing' }`, or `{ status: 'ready', sheet }`.
- Rendering derives tie segments `{ x1, x2, y }`, curve controls `{ cx, cy }`, mark points `{ cx, cy }`, and zigzag paths `{ start: [x, y], parts: [[x, y], ...] }` ([layout.js](../src/utils/layout.js)). Popovers use `{ x, y, below }` placement ([popover.js](../src/utils/popover.js)).
- Audio uses a six-element array of open-string MIDI pitches and derives a note-move destination `{ string, fret, midi }` when available ([audio.js](../src/utils/audio.js)).
- The publishing script builds a `Map<objectKey, etag>` from S3 listing records `{ Key, ETag }`, a `Set` of desired local filenames during pull, and upload records `{ file, slug }` ([notes.mjs](../scripts/notes.mjs)).
- The Flask backend caches objects per process in `dict[str, tuple[float, bytes | None]]`: object key to monotonic expiration time and body, with `None` representing a cached miss. The TTL is 60 seconds ([notes.py](../docker/app/backend/app/notes.py)).
