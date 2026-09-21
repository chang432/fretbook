# Fretboard Notebook

A small static React app for writing guitar tab the way you would in a notebook:
six string lines, and you type fret numbers onto them to record a chord shape or
a run of fingerings.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/ (relative paths, host it anywhere)
npm run lint
```

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
  An empty row goes straight away, one with notes asks first, and the sheet
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

### Groups and song structure

Each row is a **group** — a chunk of tab meant to be played more than once. The
**Groups** strip above the staves is the running order: press a slot, pick a
group from the list that appears, and it takes that group's number.

- Writing `1 1 2 1 3 1` there says to play the first row twice, then the
  second, then the first, then the third, then the first again — without
  writing any of it out twice.
- Pressing a slot that already holds a group reopens the list with that group
  marked, plus **Clear** to empty the slot. <kbd>esc</kbd> or a press anywhere
  else closes the list without changing anything.
- There is always one free slot past the end, so the strip grows as you fill it.
- Removing a row removes the group, so any slot calling for it is emptied. A
  new row is given a number past every one handed out so far, so a slot left
  over from a group that has gone never quietly picks up its replacement — which
  is why the numbers can end up 1, 2, 4 rather than always running on.

### Reordering the sheet

The **two rows and an arrow** in the toolbar turn on edit mode, which is where
the sheet is rearranged rather than written in. Press a row, then press
another, and the two exchange places. The same two presses work on the Groups
strip, where they exchange two positions of the running order.

- The first press picks something up and holds it, drawn in the accent colour.
  The second says what to swap it with. Pressing the same one again, or
  <kbd>esc</kbd>, puts it back down without moving anything.
- A row and a group slot are different things with nothing to trade, so
  reaching for one lets go of the other rather than swapping across them.
- **Everything in a row travels with it** — the notes, the arcs, the symbols,
  and the bars it is however many of. Two rows of different lengths swap just
  as readily as two of the same length; the rows between them slide by the
  difference.
- **A row's number goes with it.** The circle at the left of a row is its
  group, and a group is a name rather than a place: swap the first and third
  rows and their circles read 3 and 1. The rows are no longer numbered down the
  page, because what is written in them has moved.
- **The two orders are independent.** Swapping rows does not touch the Groups
  strip, and swapping slots does not touch the rows. A strip reading `1 1 2 1`
  still reads `1 1 2 1` after rows 1 and 2 have changed places, and still plays
  the same music — group 1 is wherever group 1 now sits. Rearranging the page
  and changing the running order are two separate things, and each is done in
  one place.
- **Writing is off while the mode is on.** A press anywhere on a row means
  *this row* rather than *this position*, so the cells stop taking type and the
  per-row bar buttons stand down. Turning the mode back off gives all of it
  back, with the cursor where you left it.

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

The **two sheets** in the toolbar turn on copy mode, which puts two strips above
every staff: a row of circles to pick a stretch out with, and under them one
paste button per position saying *start it here*.

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
- Copy mode and reordering both take the sheet over, so turning one on puts the
  other away. Writing stays on underneath copy mode: the strips sit above the
  staff and nothing they do competes with the cursor.
- **Shifting a row is off while copy mode is on.** A shift's anchors and copy
  mode's circles are the same control above the same staff for two different
  errands, which is one strip too many to tell apart — so copy mode closes any
  shift that was out, and the row's **↔** stands down until it is turned off.

### Playing it live

The **screen** button in the toolbar asks for a tempo and then plays the song
full screen: a
playhead standing fixed on the page, with the tab sliding leftwards underneath
it, the way a DAW moves a track past its play position.

- One position is one beat, so a bar is four of them. At 90 BPM the playhead
  crosses a position every two thirds of a second.
- The song played is the **Groups** running order, expanded — writing `1 1 2`
  there plays the first row, then the first row again, then the second, one
  continuous line of tab. A sheet with an empty running order plays its rows
  once each, top to bottom.
- A silent bar leads in, so there is a bar's worth of tempo to pick up before
  the first note is due.
- With sound on, every note standing on the position the playhead reaches
  sounds together, as a chord.
- <kbd>space</kbd> pauses and resumes, <kbd>←</kbd> / <kbd>→</kbd> move a bar at
  a time, <kbd>↑</kbd> / <kbd>↓</kbd> change the tempo by 5 without stopping,
  and <kbd>esc</kbd> leaves. The transport buttons along the top do the same.
- The tempo popup's **Simple mode** leaves the moving tab and an **Exit** button
  only, for a clean audience-facing display.
- The staff is zoomed to fit the space it has, measured rather than guessed —
  a phone, or a window with the toolbar wrapped onto two lines, gets a smaller
  staff rather than one with its top string cut off. The zoom is capped so
  there are always beats visible ahead of the playhead to read.
- The tempo is saved with the song, so a sheet is reopened at the speed it was
  last played at.

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

## Layout

```
src/
  App.jsx                  state, toolbar, rows, exports, autosave
  components/TabEditor.jsx  the writable staves, keyboard nav, tie arming
  components/GroupSection.jsx the running order above the staves, and its picker
  components/StaffOverlay.jsx the SVG arcs and symbols over one staff line
  components/MarkBar.jsx    the rewind, tie and symbol buttons floating over the selected position
  components/PositionStrip.jsx one control per position above a staff, shared by the shift anchors and copy mode
  components/LiveMode.jsx   the full-screen player: playhead, scrolling tab, transport
  components/Popover.jsx    the anchored panel behind the export, group and tempo menus
  components/icons.jsx      the drawn symbols on the buttons that carry no words
  utils/tab.js              grid, tie and mark model; ASCII/JSON; downloads
  utils/live.js             the running order as a flat run of beats, and its timing
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

Live mode reads that same grid rather than a copy of it: `songRuns` turns the
running order into the list of stretches to play, each holding the column its
row starts at. A group played three times is three runs pointing at the same
columns, which is why a repeat costs nothing and why its arcs and symbols —
kept in absolute columns — draw correctly every time round.

Group ids live in a parallel `groups` array — one per staff row, in row order —
and are what `structure` refers to. They are zero-based, which is exactly what
the running order held back when a slot named a row by its index, so a file
written before ids existed reads back unchanged: `readGroups` hands its rows
identity ids and every slot in it still resolves. `songRuns` looks each slot up
with `rowOfGroup` rather than indexing `rows` directly, which is the whole
mechanism — reordering rows moves the tab and its name together, and the song
is unaffected.

Row lengths live in a parallel `rows` array — one bar count per staff line —
while the grid stays one flat run of columns. Adding a bar therefore inserts
columns *mid-grid*, which is why `addBar` also shifts every tie and mark past
the insertion point. Files record `rows`; ones written before it existed
(version 3) are read back as rows of 8 bars, the 32-position line they used.
Version 6 added `bpm`; a file without one opens at 90. Version 7 added per-slot
repeat counts, and version 8 `groups`.

The running order is a parallel `structure` array — one slot per position in
the song, holding the index of the row played there or `null`. Because slots
point at rows by index, dropping a row has to blank the slots that named it,
which is what `clampStructure` does. Files written before groups existed
(version 4 and earlier) simply load with an empty running order.

Swapping two rows is the same bookkeeping run the other way. `swapRows` rebuilds
the grid with each row's run of columns standing where the other's did — the
rows caught between them slide by the difference in the two widths — and remaps
every tie and mark through the same function, since both are held in absolute
columns. `structure` is handed straight back untouched, which is what keeps the
two orders apart: a slot names a group by index, so leaving the indices alone
leaves the strip saying what it said, and the row that moved into a position is
the one now played there. `swapGroupSlots` is the other half, reordering the
strip without reaching into the grid at all.
