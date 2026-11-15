import { useEffect, useRef } from 'react'
import { TABLES, type TableRef } from '../lib/signals'

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

/** A sheet showing one referenced table, with the selected row marked. */
export function TableSheet({ open, onClose }: { open: TableRef | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const table = open ? TABLES[open.id] : undefined

  useEffect(() => {
    const el = dialog.current
    if (!el || !open) return
    if (!el.open) el.showModal()
    el.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [open])

  if (!open || !table) return null
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialog.current) dialog.current?.close()
      }}
    >
      <header className="sheet-head">
        <div>
          <h2 id="sheet-title">{table.title}</h2>
          {table.subtitle && <p>{table.subtitle}</p>}
        </div>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </header>
      <div className="sheet-body">
        {table.note && <p className="sheet-note">{table.note}</p>}
        {table.groups.map((group, i) => (
          <section key={i}>
            {group.title && <h3>{group.title}</h3>}
            <ol className="table-rows">
              {group.rows.map((row) => (
                <li key={row.n} data-selected={row.n === open.row}>
                  <strong className="group">
                    {row.n}
                    {row.star && '*'}
                  </strong>
                  <div>
                    <span>{row.text}</span>
                    {row.detail && <span className="row-detail">{row.detail}</span>}
                    {row.caution && <span className="reading-error">{row.caution}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <p className="sheet-source">International Code of Signals, {table.source}.</p>
      </div>
    </dialog>
  )
}
