# Fretbook

A small static React app for writing guitar tab the way you would in a notebook:
six string lines, and you type fret numbers onto them to record a chord shape or
a run of fingerings.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
npm run preview  # serve dist/ the way the server does
npm run lint

npm run stack       # the whole thing in Docker, as the VPS runs it
npm run stack:logs  # follow both containers
npm run stack:down  # stop them

npm run deploy:local  # the full deploy: verify, start, smoke-test, then watch
```

`deploy:local` runs the phases [the CI workflow](.github/workflows/deploy.yml)
runs against the VPS — lint and build, then the images, then a smoke test of
`/api/health`, `/api/notes`, `/notes` and one note — and then stays, tailing
both containers: errors highlighted and counted, healthcheck probes hidden, and
a banner whenever a container restarts or a healthcheck turns. Ctrl-C leaves
the stack running. `--no-verify` skips the first phase, `--all` keeps the
probes, `--down-on-exit` tears it down when you stop watching.

The published notes come from a private R2 bucket rather than from the repo,
read by the backend over the S3 API — so `/notes` is empty under a bare
`npm run dev` until something is serving `/api`. `npm run stack` brings that up
in Docker on :8080 and the dev server proxies to it; the script checks the
credentials first and tells you how many notes came back, since a stack without
them comes up perfectly well and simply shows nothing. Those credentials live
in `docker/app/.env` — copied from
[`docker/app/.env.example`](docker/app/.env.example), which says what each
value is for, and git-ignored once it holds real ones. Everything else — which
is most of the app — works without any of it.

## Writing tab

- Click any position on a string and type a fret number (`0`–`24`).
- `x` marks a muted / unplayed string.
- Arrow keys move between strings and positions; **space**, **enter**, or **tab**
  step to the next position on the same string.
- **Backspace** in an empty cell clears the position to its left.
- Strings run high **e** (top) to low **E** (bottom), the standard tab layout.
- Rows are measured in **bars** — the 4 positions between two heavier guide
  lines. A row starts at 4 bars, and the **+** at its right-hand end adds
  another, so rows can be different lengths.
- The **−** below it takes the last bar back off. An empty bar goes straight
  away; one with notes in it warns you what would be lost and waits for a
  second press. The warning, and the arming, lapse after a few seconds. A row
  never drops below one bar.
- The **↔** above them slides the row's notes along — see *Shifting a row*
  below.
- **Each row scrolls on its own.** Reading the end of a long row leaves every
  other row exactly where it was. A row only scrolls once it is too long for
  the page — a short one takes just the width it needs, keeping its **+** and
  **−** against its own end. Arrow keys drag the row along with them, so
  keyboard navigation never runs off the edge.
- Every row is its own section, ruled off from the one above it, with its
  number in a circle at the far left.
- The sheet is one continuous run of rows — no pages. **+ New row** below it
  appends another and scrolls down to it; **− Remove row** drops the last one.
  A row goes on the press that asks for it, notes and all — **Undo** is what
  takes it back, so a whole row is not worth stopping to confirm. The sheet
  never drops below a single row. A new sheet starts with four.

### Shifting a row

The **↔** at the end of a row opens the two arrows that slide its notes one
position, so a row carries one button rather than four. They stay out until the
**×** above them puts them away — it is ringed in red so the way out is obvious
among the arrows it sits beside. Writing elsewhere, or opening another row's
arrows, leaves them alone, and <kbd>esc</kbd> closes them too.

Opening them also puts a row of empty circles above that staff, one per
position. Pressing one anchors the shift there, and **the circles from it
rightwards fill in** — a shift always carries the anchor and everything to its
right, and that is what they are showing you.

- **→** moves that stretch one position right, leaving an empty position where
  the anchor stood and pushing the end of the row off past its edge. Anchoring
  the `5` on the low E and pressing **→** opens a gap in front of that `5` and
  carries it, and the rest of the row, along.
- **←** moves the same stretch one position left, writing over whatever stood
  in front of the anchor and leaving the end of the row empty.
- Either way one position's worth of notes goes — written over, or pushed off
  the end. The status line says which, and how many.
- Arcs and symbols travel with their notes. A tie with only one end in the
  moving stretch is dropped — its two notes no longer belong together — and so
  is one hanging on a note that has been written over.
- The anchor follows the note it marked, so pressing the same arrow again
  carries it further along. Pressing its circle again takes the anchor off, and
  the arrows go back to moving the whole row — which is the same thing anchored
  at its first position.

### A note on the sheet

At the top of the sheet is **Notes**, a box for what the staves cannot say —
a tuning, a capo, who it is by, what to listen for.

- It is **folded away** until you press the heading, so an empty box is never
  in the way of the writing it is there to support. A sheet that already
  carries a note opens with it in view, and a folded one shows its first line
  beside the heading, so nothing is quietly lost behind a closed word.
- Pressing the heading open puts the cursor in the box; <kbd>esc</kbd> folds it
  away again. The note is kept as it is typed — there is nothing to save.
- It travels with the sheet: it is kept between visits, written into the JSON
  export and read back out of it. The text and image exports are the tab
  itself, so they leave it out.
- A whole run of typing is **one step of Undo**, the same bargain writing a
  fret makes, so taking back a note you did not mean to write is one press.

### Groups

A **group** is a run of rows that belong together — a verse, a chorus, the four
bars that come back later. A group is drawn where its rows are: one **bar
across the full width of the sheet**, with the rows it holds indented under it
behind a vertical spine in the group's own colour, so the bar and the spine
read as one bracket around the group.

- **Name a group by typing in its bar.** <kbd>enter</kbd> writes the name down,
  <kbd>esc</kbd> abandons what was typed. A group nobody has named answers to
  where it stands — *Group 2* — so there is always something to call it.
- **Fold a group away** with the caret at the left of its bar. The rows go,
  the bar stays and says what has been put aside — *3 rows · 6 bars · 14
  notes* — so a long sheet can be read as its sections. A fold is a way of
  handling the page rather than part of the song, so it is not saved.
- **Delete a group with the × at the right of its bar.** The rows it held are
  not touched: they stay exactly where they stand and are in no group
  afterwards. It goes on one press and **Undo** takes it back, the same
  bargain the bin at the end of a row makes.
- **Rows join and leave groups in edit mode** — see below. There is nothing on
  a row's own line to press, since the bar above it already says which group
  it is in.
- **A group's rows are always next to each other**, since the bar brackets
  them. Putting a row in a group therefore moves it: it joins the end of that
  group's run, and leaving a group drops it just past the rows that group still
  holds. The row keeps its name, its notes, its arcs and its symbols — only its
  number changes, because the number is where it stands.
- A row in no group stands on its own, flush left, with no bar over it.
- **+ New group** at the end of the sheet adds one. It holds no rows yet, so it
  waits there as a bar until a row is sent to it — and the next group made
  takes the next colour, four of them before they come round again.
- Deleting a row takes it out of its group with it. A group that loses its
  last row that way stays on the sheet, waiting at the end as an empty bar.

### Reordering the sheet

The **pencil** in the toolbar turns on edit mode, which is where the sheet is
worked on rather than written in — the one mode it has. Everything that
rearranges a sheet lives there: swapping rows, moving a row between groups,
deleting a row, and copying a stretch of notes from one place to another.

Press a row, then press another, and the two exchange places. A row can also
be moved rather than traded: while one is held, **the places between the rows
light up as dashed lines**, and pressing one takes the held row there, with
everything in between closing up behind it.

It is also the one place a row joins or leaves a group. A line inside a
group's bracket puts the row in that group; a line between two blocks leaves
it in none. **Every group's bar is somewhere to put it too** — *Put here* on
the groups it could join, *Take out* on the one it is already in.

- The first press picks something up and holds it, drawn in the accent colour.
  The second says what to swap it with, or where to move it to. Pressing the
  same row again, or <kbd>esc</kbd>, puts it back down without moving
  anything.
- **The lines are there for as long as the mode is**, empty until something is
  held, so picking a row up lights the places it could go rather than moving
  the whole sheet about. The two lines either side of the held row stay unlit:
  they are where it already is.
- Each line says where it would land — *into Chorus, after row 3*, *between
  rows 2 and 3, in no group* — so the line under a group's bar and the line
  just above it read as the two different offers they are.
- **Everything in a row travels with it** — the notes, the arcs, the symbols,
  and the bars it is however many of. Two rows of different lengths swap just
  as readily as two of the same length; the rows between them slide by the
  difference.
- **A row is numbered by where it stands**, so swapping two rows swaps their
  numbers with them. The name a row carries travels with the music instead,
  since it is kept against the row rather than against the line it happens to
  be written on.
- **Rows can be swapped across groups.** Which group a row is in belongs to
  the place it stands rather than to the row, so a row swapped into the middle
  of a group joins it and the row it changed places with takes the group it
  has left. A swap therefore never leaves a bar drawn over a row that is not
  in it.
- **Pressing a group's bar moves the held row to the end of that group**,
  which is how a group grows or empties — a swap alone could only ever trade
  one row for another. The row is put back down afterwards, since it is
  somewhere else now.
- **Writing is off while the mode is on.** A press anywhere on a row means
  *this row* rather than *this position*, so the cells stop taking type and the
  per-row bar buttons stand down. Turning the mode back off gives all of it
  back, with the cursor where you left it.
- **The bin at the end of a row deletes that row**, which is the only place a
  row other than the last can be taken off. It stands where the bar buttons
  stand the rest of the time. The row goes on one press, notes and all, and
  **Undo** puts it back — unlike the bar **−**, which still asks twice, since
  taking a bar off is a smaller thing to mean and a harder one to see. The
  sheet never drops below a single row. Everything below the deleted row
  slides up and is renumbered, and the group it was in simply holds one row
  fewer.

### Ties

Click a written note, press the **arc** button that appears over it, then press
one of the highlighted positions. The two are joined by an arc — the note held
across everything in between.

- The highlight runs outwards in both directions over every free position and
  on to the next written note, where it stops; the end of the staff line stops
  it too, so a tie never runs off the end of a line.
- An empty position takes the selected note's fret. A position that already
  holds a note keeps its own — the arc just joins the two, so it never
  overwrites what you wrote.
- **A note carries at most two arcs**: one back to the note before it and one
  on to the note after it. That is what lets a note be held right through a run
  of positions — each arc picks up where the last one left off.
- Drawing a new arc replaces only the one hanging off the same side of the
  note. The arc on its other side is left alone.
- Pressing a position that is already tied to the selected note removes that
  arc. Erasing either note removes it too.
- <kbd>t</kbd> arms the tie from the keyboard, <kbd>←</kbd> / <kbd>→</kbd> aim
  it, <kbd>enter</kbd> draws it and <kbd>esc</kbd> cancels. Hovering aims the
  same cursor, and a dashed preview shows what a press would draw.

### Hearing what you wrote

The **speaker** in the toolbar turns on note preview: pressing a written note
sounds it at the pitch that string and fret actually give you. It shows itself
crossed through while sound is off, and fills in once it is on.

- Notes are synthesised, not sampled — a Karplus-Strong plucked string rendered
  into a buffer per note, so the app still ships no audio assets.
- Walking the staff with the arrow keys plays each note you land on, so a line
  can be checked by ear. Empty positions and muted (`x`) strings are silent.
- Pressing the same note again replays it.
- The setting is not remembered between sessions: a page shouldn't be able to
  start making noise before you've asked it to. Browsers also only allow audio
  to start from a click, which is exactly what the toggle is.

### Moving a note to another string

The same note can be played in several places on a fretboard, and a note
written in one of them can be sent to another. Select it, and the bar above it
grows two arrows; <kbd>shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> does the same
from the keyboard.

- Either sends the note to the next string along, at **the lowest fret there
  that sounds it**. A G at the tenth fret of the A string becomes the G at the
  fifth fret of the D, and the G at the third fret of the low E — never the
  fifteenth, which is the same pitch but a fingering nobody wants.
- So a move holds the note and lets the octave fall where the hand is: carried
  far enough, a note written high up ends up sounding an octave or two below
  what it started as. The button says which note it will leave you with —
  `fret 0 — B3` — so the drop is visible before it lands.
- The note's symbol travels with it. An arc does not: both ends of one live on
  the same string. A string already holding a note in that position is stepped
  over rather than written on.
- Only the outer strings have nowhere to go, and any string in the way can take
  the last free one with it. The button for a direction that leads nowhere is
  simply not there, and the keyboard says why rather than appearing to do
  nothing.

### Copying a stretch of notes

Edit mode puts two strips above every staff: a row of circles to pick a stretch
out with, and under them one paste button per position saying *start it here*.
They stand above the sheet that covers each row, so the strip band takes its
own presses and the staff under it still picks the row up.

- Press two circles on the same row and everything between them highlights —
  the two ends solid, the positions they carry weaker. Pressing a third circle
  starts a new stretch from there rather than making you clear the old one
  first, and pressing the one open end again puts it away.
- **A stretch never spans two rows.** Pressing a circle in a different row is
  taken as the start of a new stretch there. The sheet is one continuous run of
  columns underneath, so a stretch across a row break would read as joined-up
  here while looking like two unrelated fragments on the page.
- Press any paste button and the stretch is written down starting at that
  position — on any row, including the one it came from. The paste buttons stay
  greyed until there is something to paste.
- **Symbols and arcs travel with the notes.** An arc comes only when both of its
  ends are inside the stretch: one running out of it has lost the note at its
  far end, and an arc drawn between two notes that were never joined is not what
  was copied.
- A position that was empty in the stretch empties the one it lands on, so what
  you get is the stretch and nothing else — the same rule the single-position
  rewind already follows.
- **A stretch that will not fit is refused** rather than landing clipped. Rows
  are independent lengths, so a 6-position stretch has nowhere to go in the last
  4 positions of a row; the toolbar says so and nothing is written. Add a bar to
  the row, or paste it further left.
- **Overwriting asks first.** A paste that would land on written notes counts
  them and waits — `Pasting here writes over 5 notes — press again to paste` —
  and goes through on the second press. The arming lapses when you look away,
  the same as the bar-removal button.
- **Writing is off while the mode is on**, as it is for everything else edit
  mode does: a press on a row means *this row*, not *this position*. Nothing
  here needs the cursor — a stretch is picked out and written down with
  presses alone.
- A stretch picked out is forgotten when the mode is turned off. It belongs to
  the mode rather than to the sheet, the same as a row left held.
- **Shifting a row happens outside the mode.** A shift's anchors and the
  mode's circles are the same control above the same staff for two different
  errands, which is one strip too many to tell apart — so the row's **↔**,
  like the rest of its bar controls, stands down for as long as the mode is
  on, and any shift that was out closes on the way in.

### Playing a chord again

Selecting any position puts a **rewind** button above it, which fills that
position with the last one written before it — the same chord played again,
taken from where it stands rather than typed out a second time.

- The whole position comes across at once: every string, and the symbols above
  them. Strings silent in the copied chord fall silent here too, so what you
  get is that chord and not a mixture of it and whatever was here.
- An arc cannot be copied — one needs a note at each end — so an arc ending on
  the position goes, the same as if that note had been erased.
- It looks leftwards past the start of a row into the one above it. The sheet
  is one continuous run of positions, and a row break is not a gap in the song.
- <kbd>r</kbd> does the same from the keyboard, so a repeated chord can be
  written without leaving the row: <kbd>space</kbd>, <kbd>r</kbd>,
  <kbd>space</kbd>, <kbd>r</kbd>.
- The chord sounds as it lands, if sound is on.
- The button is there whether or not anything is written where you are — filling
  an empty position is what it is for — and stays away at the very start of a
  sheet, where nothing has been written yet to copy.

### The zigzag above a note

Click a written note and a **zigzag** button appears beside the arc. It draws
that symbol above the number, and the button keeps the note selected.

- Pressing it again clears the symbol.
- <kbd>w</kbd> does the same from the keyboard, which is how you reach it
  without a mouse.
- Erasing the note erases its symbol.
- Everything is saved to `localStorage`, so a refresh keeps your work.

## Exporting

**Export** in the toolbar opens a menu of the four ways out:

| Choice | Output |
| --- | --- |
| Text file | ASCII tab (`.txt`), the usual `e\|--4---7--\|` format. A tie fills the gap between its notes with `~`; a zigzag becomes a `w` on the note — `7w` |
| Image | PNG of the staves including arcs and symbols, rendered on a canvas at 2× |
| JSON file | `.json` you can re-open with **Import JSON**, which stays its own button |
| Copy | ASCII tab straight to the clipboard |

Text and image exports stop at the last row you wrote in, so trailing blank
staves are never included. A JSON export keeps every row, blank ones and all —
rows are yours to add, so a file records the sheet exactly as you left it.

**Publish**, beside it, is the same JSON sent somewhere instead of saved: it
puts the sheet in the published notes, at a URL anyone can open — and a
published note carries **Update** and **Delete** there instead, both of which
want the password. See below.

## Publishing notes

A published note is a read-only note with a URL of its own, and `/notes` lists
them all. They live in a **private Cloudflare R2 bucket, one per environment**,
and the app reads them from its own origin through the backend, which is the
one thing holding a credential for that bucket.

**Publish** in the toolbar is the short way: it asks for a name — prefilled
from the title, which is already a publishable name — and uploads the sheet to
this environment's bucket. It is live at `/notes/<name>` as soon as the press
finishes, and `/notes` lists it. Nothing is rebuilt, nothing is merged, and
there is no file in between.

**It cannot publish over a note**, deliberately: a name that is taken is
refused and you are asked for another. R2 keeps no versions, so a write over a
note destroys it, and that refusal is the one guard that matters on a route
anyone can reach.

Changing a note, and taking one down, are the two buttons a **published note**
carries instead — and the two that ask for a password:

| On `/notes/<name>` | What it does |
| --- | --- |
| **Update** | Writes the sheet in front of you over that note, title and all. Dead until something has actually changed |
| **Delete** | Takes the note down: the object and its line in the index. The link stops working |

Both are final — nothing else holds a copy — so each panel says what it is
about to do before it asks for anything. The only way back from a delete is
**Export → JSON file** and `notes:publish` again.

The password is one secret per environment, `FRETBOOK_PUBLISH_PASSWORD` on the
backend, sent in a header and stored nowhere in the browser. Without it set,
both buttons answer 503 and the rest of the site is unaffected — so an
environment opts into being editable.

[docs/notes-upload-from-app.md](docs/notes-upload-from-app.md) is what these
routes give up, and who can reach them: publishing is open to **anyone who can
open the site**, changing and removing are not.

The commands are the other way in, and still the only one that can replace or
remove:

```bash
cp .env.example .env.local      # once: the R2 endpoint and the token's profile

npm run notes:publish   -- notes/tie_that_binds_by_drake.json
npm run notes:unpublish -- tie_that_binds_by_drake
npm run notes:manifest                               # rebuild the index only
npm run notes:pull                                   # refresh the local cache
```

**A bare command means the dev bucket.** Local work is dev work, so that is the
default; production has to be named, either for one command or for a shell:

```bash
npm run notes:publish -- --bucket fretbook-notes-prod notes/*.json
export FRETBOOK_NOTES_BUCKET=fretbook-notes-prod
```

Every command prints the bucket it acted on as its first line, with `(default)`
when nothing asked for one — so a forgotten override shows up in the output
rather than in the consequences.

```
notes/tie_that_binds_by_drake.json   →   /notes/tie_that_binds_by_drake
```

To publish from a file: **Export → JSON file**, then publish the file. An
export is named after its title with underscores between the words, which is
already a publishable name — rename it only if you want the URL to read
differently, keeping to lowercase letters and digits joined by single dashes or
underscores.

**The bucket is the only place a note lives.** A reader can open one and play
with it, but nothing they do is saved anywhere, and publishing — the button or
the command — is the only thing that changes what everyone sees. Nothing in
this repo is authoritative about a note: `notes/` is git-ignored, and nothing
under it is tracked.

`notes:pull` is how you get the notes onto a machine. It **mirrors** the
bucket: it fetches what you do not have and deletes what the bucket no longer
has, because a file the bucket does not have is not a note. A second pull in a
row fetches nothing, so it costs nothing to run before reaching for anything
else. An export you have not published yet does not belong in `notes/` —
publish it from wherever the browser saved it, since `notes:publish` takes any
path.

That leaves no second copy anywhere, and **R2 has no object versioning**, so
republishing over a note or unpublishing one is final. That is the deliberate
cost of one source of truth; [docs/notes-pull-from-r2.md](docs/notes-pull-from-r2.md)
is where it is argued, and what to do if it ever bites.

`scripts/notes.mjs` is the whole of publishing from a terminal. It refuses a
file the editor could not open, so a broken note never reaches a reader, and
afterwards it rebuilds `notes.json` — the manifest `/notes` lists — from what
is actually in the bucket, so there is no list to keep in step. The button
takes the same two cares at the other end: the backend checks the export's
envelope before it writes, and adds the note's own line to the manifest rather
than leaving it unlisted. `npm run notes:manifest` remains the repair for a
manifest that has drifted either way.

**Nothing about a note is baked into the build.** The browser asks
`/api/notes` and `/api/notes/<name>` on its own origin — and `PUT`s to the
second of those to publish; Caddy hands them to Flask, and
`docker/app/backend/app/notes.py` fetches the object from R2 with boto3, or
writes it. Which bucket that means is the backend's runtime setting, so the dev and
prod web images are identical — see
[docs/notes-via-s3-client.md](docs/notes-via-s3-client.md).

Everything speaks the S3 API, in other words: publishing is the ordinary `aws`
CLI pointed at the account's R2 endpoint, and reading is boto3 pointed at the
same place. Nothing reads the bucket over HTTP, and the bucket is not public.

**The buckets themselves are not created by this repo.** The API tokens — one
for your laptop and one for the server, both **Object Read & Write** now that
the server publishes too — and the costs are in
[docs/notes-r2-storage.md](docs/notes-r2-storage.md).

## Layout

```
src/
  App.jsx                  state, toolbar, rows, exports, autosave
  components/TabEditor.jsx  the writable staves, keyboard nav, tie arming
  components/GroupBar.jsx   one group's bar across the sheet, and the name typed into it
  components/StaffOverlay.jsx the SVG arcs and symbols over one staff line
  components/MarkBar.jsx    the rewind, tie and symbol buttons floating over the selected position
  components/PositionStrip.jsx one control per position above a staff, shared by the shift anchors and edit mode's strips
  components/Popover.jsx    the anchored panel behind the export and publish menus
  components/PublishMenu.jsx the name a sheet is published under or the password it is changed with, and the press that writes it
  components/icons.jsx      the drawn symbols on the buttons that carry no words
  utils/tab.js              grid, tie and mark model; ASCII/JSON; downloads
  utils/notes.js            the published notes: the /api calls that fetch them, and the three that change one
  utils/audio.js            fret-to-pitch both ways, and the plucked-string synthesis
  utils/popover.js          where an anchored panel sits, kept inside the window
  utils/layout.js           staff geometry and the arc/symbol maths, shared by
                            the SVG overlay, the buttons, and the canvas
  utils/renderPng.js        canvas rendering for the image export
```

The grid is stored column-major (`grid[position][string]`) so one chord is one
contiguous slice — that is how it is edited and how every export walks it. Ties
(`{ string, from, to }`) and marks (`{ string, col, symbol }`) are kept beside
it in absolute grid positions: that is what lets one arc be clipped across a
staff wrap, and it keeps a cell's value a plain string.

Groups are kept the other way round from how they are drawn. The sheet holds a
list of them — `{ id, name }`, ids handed out in turn and never reused — and
`members` maps a **row id** to the group that row is in, so membership travels
with the row exactly as its name does. Nothing records where a group stands:
a group is drawn as one bar over the rows it holds, so it stands where they
do, and `groupRuns` reads that layout back off the order of the rows. The one
thing this asks of that order is that **a group's rows are adjacent**:
`putRowInGroup` is what keeps them so, moving the row as it changes what it
belongs to.

Row lengths live in a parallel `rows` array — one bar count per staff line —
while the grid stays one flat run of columns. Adding a bar therefore inserts
columns *mid-grid*, which is why `addBar` also shifts every tie and mark past
the insertion point. Imports accept the current version 12 sheet format only;
older exports and browser saves are not loaded.

Rearranging the rows is the same bookkeeping run the other way, and all of it
goes through one function. `reorderRows` takes the new order — one entry per
place on the page, naming the row that now stands there — rebuilds the grid run
by run in that order, and carries every tie and mark by the distance its own
row moved, since both are held in absolute columns. Rows can differ in length,
so the rows caught between two that trade places slide by the difference in
their widths. `swapRows` is that function given a two-row order, and
`putRowInGroup` and `collectGroups` are the same function given the order a
group's bracket needs.

`removeRow` takes the same view of a row as `removeBar` does of a bar, a whole
row wide: it cuts that row's run of columns out of the grid, so everything
below slides up by its width, drops any tie or symbol anchored inside it, and
remaps the rest through the same shift. It defaults to the last row, which is
what **− Remove row** asks for; edit mode's per-row bin names one.


TODO:
- Groups need refactor so that rows can be grouped into sub groups 
- Mb create new arrangement section, that arranges certain groups, and groups section exist purely for grouping rows. 
- Once undo button is added, disable remove section confirmation 
- Add guitar fretboard popup where you can play notes on the fretboard and it plays out loud. 