import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlagId } from '../data/flags'
import { TABLES, rowGroup, type TableRef, type TableRow } from '../lib/signals'
import { isValueLetter } from '../lib/values'
import { ValueField } from './ValueField'

/** Buttons that open the tables a signal refers to. */
export function TableLinks({ tables, onOpen }: { tables: TableRef[]; onOpen: (ref: TableRef) => void }) {
  if (tables.length === 0) return null
  return (
    <div className="table-links">
      {tables.map((ref) => (
        <button type="button" key={ref.id} className="quiet" onClick={() => onOpen(ref)}>
          Show {TABLES[ref.id].title}
        </button>
      ))}
    </div>
  )
}

/** What choosing a row puts on the hoist. */
export interface Transfer {
  /** The group to hoist, e.g. "MBF12" or "K". */
  group: string
  /** The group as the code book writes it, e.g. "MBF 12". */
  label: string
  /**
   * Where the group goes: in place of the active hoist (a whole signal), added to the end of it,
   * or on a hoist of its own (a value such as a course or a date).
   */
  placement: 'replace' | 'append' | 'new'
  /** A single flag to hang as it is, for flags such as substitutes that are not a character. */
  flag?: FlagId
}

interface Props {
  open: TableRef | null
  onClose: () => void
  onTransfer: (transfer: Transfer) => void
}

/**
 * A sheet showing one referenced table. Rows can be selected, and the selected row
 * sent to the hoist as flags.
 */
export function TableSheet({ open, onClose, onTransfer }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const table = open ? TABLES[open.id] : undefined
  const [selected, setSelected] = useState<string | null>(null)
  /** The figures entered for a single-letter signal that carries a value. */
  const [value, setValue] = useState<string | null>(null)
  const onValue = useCallback((v: string | null) => setValue(v), [])

  useEffect(() => {
    const el = dialog.current
    if (!el || !open) return
    setSelected(open.row ?? null)
    if (!el.open) el.showModal()
    el.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [open])

  if (!open || !table) return null

  const transferFor = (row: TableRow): Transfer | null => {
    const group = rowGroup(open, row)
    if (!group) return null
    const complement = open.code !== undefined && group !== row.n
    return { group, label: complement ? `${open.code} ${row.n}` : group, placement: complement ? 'replace' : 'append' }
  }
  const rows = table.groups.flatMap((g) => g.rows)
  const selectable = rows.length > 0 && transferFor(rows[0]) !== null
  const chosenRow = selected === null ? undefined : rows.find((r) => r.n === selected)
  // Single letters with numerals need their value before they mean anything.
  const valueLetter = open.id === 'LETTERS' && chosenRow && isValueLetter(chosenRow.n) ? chosenRow.n : null
  const chosen: Transfer | null = valueLetter
    ? value
      ? { group: valueLetter + value, label: valueLetter + value, placement: 'new' }
      : null
    : chosenRow
      ? transferFor(chosenRow)
      : null

  const close = () => dialog.current?.close()
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialog.current) close()
      }}
    >
      <header className="sheet-head">
        <div>
          <h2 id="sheet-title">{table.title}</h2>
          {table.subtitle && <p>{table.subtitle}</p>}
        </div>
        <button type="button" onClick={close}>
          Close
        </button>
      </header>
      <div className="sheet-body">
        {table.note && <p className="sheet-note">{table.note}</p>}
        {table.groups.map((group, i) => (
          <section key={i}>
            {group.title && <h3>{group.title}</h3>}
            <ol className="table-rows" data-keys={table.keys}>
              {group.rows.map((row) => {
                const content = (
                  <>
                    <strong className="group">
                      {row.n}
                      {row.star && '*'}
                    </strong>
                    <span className="row-text">
                      <span>{row.text}</span>
                      {row.detail && <span className="row-detail">{row.detail}</span>}
                      {row.caution && <span className="reading-error">{row.caution}</span>}
                    </span>
                  </>
                )
                return (
                  <li key={row.n} data-selected={row.n === selected}>
                    {selectable ? (
                      <button
                        type="button"
                        className="row-pick"
                        aria-pressed={row.n === selected}
                        onClick={() => setSelected(row.n === selected ? null : row.n)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="row-pick">{content}</div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
        <p className="sheet-source">{table.credit ?? `International Code of Signals, ${table.source}.`}</p>
      </div>
      {selectable && (
        <footer className="sheet-foot">
          {valueLetter && <ValueField key={valueLetter} letter={valueLetter} onChange={onValue} />}
          <button
            type="button"
            className="primary"
            disabled={!chosen}
            onClick={() => {
              if (chosen) onTransfer(chosen)
              close()
            }}
          >
            {chosen
              ? chosen.placement === 'replace'
                ? `Put ${chosen.label} on the hoist`
                : chosen.placement === 'new'
                  ? `Add ${chosen.label} as a new hoist`
                  : `Add ${chosen.label} to the hoist`
              : valueLetter
                ? 'Fill in the value to add it'
                : 'Select a row to hoist it'}
          </button>
        </footer>
      )}
    </dialog>
  )
}
