import { useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { Message } from '../App'
import { Flag } from '../components/Flag'
import { TableLinks } from '../components/TableSheet'
import { FLAGS, type FlagId } from '../data/flags'
import { decodeHoist, encodeGroup, resolveHoist, type Decoded, type TableRef } from '../lib/signals'

const KEY_LABEL: Partial<Record<FlagId, string>> = { SUB1: '1st', SUB2: '2nd', SUB3: '3rd', CODE: 'Code' }
const LETTER_KEYS = FLAGS.filter((f) => f.kind === 'letter')
const PENNANT_KEYS = FLAGS.filter((f) => f.kind !== 'letter')

/** Where a dragged flag came from: a place on the halyard, or the flag keyboard. */
type DragSource = { from: 'hoist'; index: number } | { from: 'key' }

interface Drag {
  source: DragSource
  id: FlagId
  x: number
  y: number
  /** Position on the halyard the flag would drop into, if it is over the halyard. */
  gap: number | null
  /** A flag taken off the halyard and held over the keyboard is removed on drop. */
  overKeys: boolean
}

const DRAG_THRESHOLD = 8

interface Props {
  message: Message
  setMessage: Dispatch<SetStateAction<Message>>
  onOpenTable: (ref: TableRef) => void
}

export function Compose({ message, setMessage, onOpenTable }: Props) {
  const { hoists, active } = message
  const hoist = hoists[active]
  /** Index of the flag picked on the halyard, for moving or removing it. */
  const [picked, setPicked] = useState<number | null>(null)
  const pickedValid = picked !== null && picked < hoist.length ? picked : null
  /** Index of the flag that was just added, so only it animates in. */
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const [drag, setDrag] = useState<Drag | null>(null)
  const pending = useRef<{ source: DragSource; id: FlagId; x0: number; y0: number } | null>(null)
  const suppressClick = useRef(false)
  const deckRef = useRef<HTMLElement>(null)
  const halyardRef = useRef<HTMLDivElement>(null)
  const keyboardRef = useRef<HTMLElement>(null)

  const setHoist = (flags: FlagId[]) =>
    setMessage((m) => ({ ...m, hoists: m.hoists.map((h, i) => (i === m.active ? flags : h)) }))

  const add = (id: FlagId) => {
    setHoist([...hoist, id])
    setJustAdded(hoist.length)
    setPicked(null)
  }

  /** Work out what the pointer is over while dragging. */
  const locate = (x: number, y: number, source: DragSource): Pick<Drag, 'gap' | 'overKeys'> => {
    const deck = deckRef.current?.getBoundingClientRect()
    const halyard = halyardRef.current?.getBoundingClientRect()
    const keys = keyboardRef.current?.getBoundingClientRect()
    if (!deck || !halyard || !keys) return { gap: null, overKeys: false }
    const overKeys = x >= keys.left && x <= keys.right && y >= keys.top && y <= keys.bottom
    if (overKeys || x < deck.left || x > halyard.right + 56 || y < deck.top || y > deck.bottom) {
      return { gap: null, overKeys }
    }
    let gap = 0
    halyardRef.current!.querySelectorAll('.hung').forEach((el, i) => {
      if (source.from === 'hoist' && i === source.index) return
      const r = el.getBoundingClientRect()
      if (y > r.top + r.height / 2) gap++
    })
    return { gap, overKeys }
  }

  const drop = (d: Drag) => {
    if (d.gap !== null) {
      const next = d.source.from === 'hoist' ? hoist.filter((_, i) => i !== (d.source as { index: number }).index) : hoist.slice()
      next.splice(d.gap, 0, d.id)
      setHoist(next)
    } else if (d.source.from === 'hoist' && d.overKeys) {
      setHoist(hoist.filter((_, i) => i !== (d.source as { index: number }).index))
    }
  }

  /** Pointer handlers that make a flag draggable; a press without movement stays a tap. */
  const draggable = (source: DragSource, id: FlagId) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Capture is a convenience; the drag still works over the element without it.
      }
      pending.current = { source, id, x0: e.clientX, y0: e.clientY }
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const p = pending.current
      if (!p) return
      if (!drag && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_THRESHOLD) return
      if (!drag) {
        setPicked(null)
        setJustAdded(null)
      }
      setDrag({ source: p.source, id: p.id, x: e.clientX, y: e.clientY, ...locate(e.clientX, e.clientY, p.source) })
    },
    onPointerUp: () => {
      pending.current = null
      if (!drag) return
      // The browser still sends a click after a drag; ignore that one.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 50)
      drop(drag)
      setDrag(null)
    },
    onPointerCancel: () => {
      pending.current = null
      setDrag(null)
    },
  })
  const tap = (action: () => void) => () => {
    if (suppressClick.current) suppressClick.current = false
    else action()
  }
  const dragIndex = drag?.source.from === 'hoist' ? drag.source.index : null
  const removing = dragIndex !== null && drag!.overKeys
  const move = (from: number, by: number) => {
    const to = from + by
    if (to < 0 || to >= hoist.length) return
    const next = hoist.slice()
    ;[next[from], next[to]] = [next[to], next[from]]
    setHoist(next)
    setPicked(to)
  }
  const remove = (index: number) => {
    setHoist(hoist.filter((_, i) => i !== index))
    setPicked(null)
  }
  const selectHoist = (index: number) => {
    setMessage((m) => ({ ...m, active: index }))
    setPicked(null)
  }
  const addHoist = () => {
    setMessage((m) => ({ hoists: [...m.hoists, []], active: m.hoists.length }))
    setPicked(null)
  }
  const removeHoist = (index: number) => {
    setMessage((m) => {
      const rest = m.hoists.filter((_, i) => i !== index)
      const next = rest.length ? rest : [[]]
      return { hoists: next, active: Math.min(m.active > index ? m.active - 1 : m.active, next.length - 1) }
    })
    setPicked(null)
  }
  const clearAll = () => {
    setMessage({ hoists: [[]], active: 0 })
    setPicked(null)
  }

  const typed = resolveHoist(hoist).text.replaceAll('?', '')
  const isEmpty = hoists.every((h) => h.length === 0)

  return (
    <div className="compose">
      <section className="deck" aria-label="Message" ref={deckRef}>
        <div className="halyard" aria-label={`Hoist ${active + 1}, read from the top`} ref={halyardRef}>
          {hoist.length === 0 && !drag && <p className="halyard-empty">Top of the hoist</p>}
          {hoist.map((id, i) => {
            const dragged = dragIndex === i
            // Position among the flags that stay put, so the drop mark lands between the right two.
            const slot = dragIndex !== null && dragIndex < i ? i - 1 : i
            return (
              <div className="hung-slot" key={`${i}-${id}`}>
                {!dragged && drag?.gap === slot && <span className="drop-mark" />}
                <button
                  type="button"
                  className="hung"
                  data-new={justAdded === i}
                  data-dragging={dragged}
                  aria-pressed={pickedValid === i}
                  onClick={tap(() => setPicked(pickedValid === i ? null : i))}
                  {...draggable({ from: 'hoist', index: i }, id)}
                >
                  <Flag id={id} />
                </button>
              </div>
            )
          })}
          {drag && drag.gap === hoist.length - (dragIndex !== null ? 1 : 0) && (
            <div className="hung-slot">
              <span className="drop-mark" />
            </div>
          )}
        </div>

        <div className="readings">
          {isEmpty ? (
            <div className="reading-empty">
              <h1>Build a hoist</h1>
              <p>Tap flags below. They hang in the order you add them and read from the top down.</p>
            </div>
          ) : (
            <ol className="reading-list">
              {hoists.map((h, i) => (
                <Reading
                  key={i}
                  index={i}
                  decoded={decodeHoist(h)}
                  active={i === active}
                  showIndex={hoists.length > 1}
                  onSelect={() => selectHoist(i)}
                  onOpenTable={onOpenTable}
                  onRemove={hoists.length > 1 ? () => removeHoist(i) : undefined}
                />
              ))}
            </ol>
          )}
          {!isEmpty && (
            <div className="message-actions">
              {hoists[hoists.length - 1].length > 0 && (
                <button type="button" className="quiet" onClick={addHoist}>
                  Add hoist
                </button>
              )}
              <button type="button" className="quiet" onClick={clearAll}>
                Clear message
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="keyboard" aria-label="Flags" ref={keyboardRef} data-removing={removing}>
        {removing && <p className="remove-hint">Drop to remove</p>}
        {pickedValid !== null ? (
          <div className="toolbar">
            <button type="button" onClick={() => move(pickedValid, -1)} disabled={pickedValid === 0}>
              Move up
            </button>
            <button type="button" onClick={() => move(pickedValid, 1)} disabled={pickedValid === hoist.length - 1}>
              Move down
            </button>
            <button type="button" onClick={() => remove(pickedValid)}>
              Remove
            </button>
            <button type="button" className="quiet" onClick={() => setPicked(null)}>
              Done
            </button>
          </div>
        ) : (
          <div className="toolbar">
            <input
              className="type-in"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Or type a group, like NC or AE1"
              aria-label="Type a group"
              value={typed}
              onChange={(e) => setHoist(encodeGroup(e.target.value).flags)}
            />
            <button
              type="button"
              onClick={() => setHoist(hoist.slice(0, -1))}
              disabled={hoist.length === 0}
              aria-label="Remove last flag"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
                <path d="M9 5h11v14H9l-6-7z" />
                <path d="m12 9 5 6m0-6-5 6" />
              </svg>
            </button>
          </div>
        )}

        <div className="keys">
          {LETTER_KEYS.map((f) => (
            <button
              type="button"
              key={f.id}
              className="key"
              onClick={tap(() => add(f.id))}
              aria-label={f.name}
              {...draggable({ from: 'key' }, f.id)}
            >
              <Flag id={f.id} />
              <span aria-hidden="true">{f.id}</span>
            </button>
          ))}
        </div>
        <div className="keys keys-pennants">
          {PENNANT_KEYS.map((f) => (
            <button
              type="button"
              key={f.id}
              className="key"
              onClick={tap(() => add(f.id))}
              aria-label={f.name}
              {...draggable({ from: 'key' }, f.id)}
            >
              <Flag id={f.id} />
              <span aria-hidden="true">{KEY_LABEL[f.id] ?? f.id}</span>
            </button>
          ))}
        </div>
      </section>

      {drag && (
        <div className="ghost" style={{ left: drag.x, top: drag.y }} data-removing={removing} aria-hidden="true">
          <Flag id={drag.id} />
        </div>
      )}
    </div>
  )
}

function Reading(props: {
  index: number
  decoded: Decoded
  active: boolean
  showIndex: boolean
  onSelect: () => void
  onOpenTable: (ref: TableRef) => void
  onRemove?: () => void
}) {
  const { decoded: d, active } = props
  const empty = d.kind === 'empty'
  return (
    <li className="reading" data-active={active}>
      <button type="button" className="reading-body" onClick={props.onSelect} aria-current={active}>
        {props.showIndex && <span className="reading-index">Hoist {props.index + 1}</span>}
        {empty ? (
          <span className="reading-meaning muted">Empty. Tap flags to fill it.</span>
        ) : (
          <>
            <span className="reading-head">
              {d.text && <strong className="group">{d.text}</strong>}
              <span className="reading-title">{d.title}</span>
            </span>
            <span className="reading-meaning">{d.meaning}</span>
            {d.notes.map((n) => (
              <span className="reading-note" key={n}>
                {n}
              </span>
            ))}
            {d.errors.map((e) => (
              <span className="reading-error" key={e}>
                {e}
              </span>
            ))}
          </>
        )}
      </button>
      {active && <TableLinks tables={d.tables} onOpen={props.onOpenTable} />}
      {props.onRemove && active && (
        <button type="button" className="quiet reading-remove" onClick={props.onRemove}>
          Remove hoist
        </button>
      )}
    </li>
  )
}
