/** Map saved positions to visible positions, inserting expanded reference notes. */
export function staffDisplay(row, groups, rows, expanded) {
  const entries = []
  const positions = []
  const previews = []
  row.columns.forEach((column, col) => {
    positions[col] = entries.length
    const source = column.isGroupRef && expanded.has(column)
      ? groups.find((group) => group.name === column.name)
      : null
    if (!source) {
      entries.push({ column, col })
      return
    }
    const start = entries.length
    for (let at = source.start; at <= source.end; at += 1) {
      entries.push({ column: rows[source.row].column(at), preview: true, sourceCol: at, refCol: col })
    }
    previews.push({ source, start, span: source.end - source.start + 1, reference: column })
  })
  return { entries, positions, previews }
}
