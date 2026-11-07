import { normalizeGroupName } from '../utils/tabV2.js'

/**
 * The sheet laid over a group while it is open, and the name standing in
 * the middle of it.
 *
 * The cover is as wide as the group and as tall as the staff is ruled, from
 * the top string line to the bottom one. It is paper, nearly but not quite
 * solid, so what is written under it is still there to see but stands well
 * back from the name.
 *
 * Nothing in it takes a press but the name: the cover itself lets presses
 * through to the cells beneath, which is what leaves either end of the
 * group able to close it again.
 *
 * A name is one capital letter and nothing more, so the box is one
 * character wide and what is typed goes through `normalizeGroupName`,
 * which keeps the last letter and refuses the rest.
 *
 * It is laid over the staff rather than drawn by a cell, because a group's
 * middle falls wherever it falls — between two positions as often as on
 * one. `from` and `span` are the group's own columns, and the staff's fixed
 * pitch is what turns them back into a place on the page.
 */
export default function GroupCover({ name, from, span, onChange }) {
  return (
    <span className="group-cover" style={{ '--from': from, '--span': span }}>
      <input
        className="group-name"
        value={name}
        maxLength={1}
        autoComplete="off"
        spellCheck="false"
        aria-label={`Name of the group, currently ${name}`}
        onChange={(event) => onChange(normalizeGroupName(event.target.value, name))}
        onFocus={(event) => event.target.select()}
      />
    </span>
  )
}
