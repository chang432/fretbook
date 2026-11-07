import { normalizeGroupName } from '../utils/tabV2.js'

/**
 * What a group is called, standing in the middle of it while it is open.
 *
 * A name is one capital letter and nothing more, so this is one character
 * wide and takes nothing else: what is typed goes through
 * `normalizeGroupName`, which keeps the last letter and refuses the rest.
 *
 * It is laid over the staff rather than drawn by a cell, because the middle
 * of a group falls wherever it falls — between two positions as often as on
 * one. `from` and `span` are the group's own columns, and the staff's fixed
 * pitch is what turns them back into a place on the page.
 */
export default function GroupLabel({ name, from, span, onChange }) {
  return (
    <span className="group-label" style={{ '--from': from, '--span': span }}>
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
