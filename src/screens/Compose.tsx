import {
  useEffect, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent, type SetStateAction,
} from 'react'
import type { Message } from '../App'
import { Flag } from '../components/Flag'
import { PositionSheet } from '../components/PositionSheet'
import { TableLinks } from '../components/TableSheet'
import { FLAGS, FLAG_BY_ID, type Flag as FlagData, type FlagId } from '../data/flags'
import { decodeHoist, encodeGroup, resolveHoist, type Decoded, type TableRef } from '../lib/signals'
import { useStored } from '../lib/useStored'

const KEY_LABEL: Partial<Record<FlagId, string>> = { SUB1: '1st', SUB2: '2nd', SUB3: '3rd', CODE: 'Code' }
const LETTER_KEYS = FLAGS.filter((f) => f.kind === 'letter')
/** The letter flags in the rows of a typing keyboard. */
const QWERTY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row) => [...row].map((c) => FLAG_BY_ID[c as FlagId]))
type KeyLayout = 'qwerty' | 'alphabet'
const PENNANT_KEYS = FLAGS.filter((f) => f.kind !== 'letter')

/** Where a dragged flag came from: a place on a halyard, or the flag keyboard. */
type DragSource = { from: 'hoist'; hoist: number; index: number } | { from: 'key' }

interface Drag {
  source: DragSource
  id: FlagId
  x: number
  y: number
  /** The hoist and position the flag would drop into, if it is over the mast. */
  target: { hoist: number; gap: number } | null
  /** A flag taken off a halyard and held over the keyboard is removed on drop. */
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
  /** Index of the flag picked on the active halyard, for moving or removing it. */
  const [picked, setPicked] = useState<number | null>(null)
  const pickedValid = picked !== null && picked < hoist.length ? picked : null
  /** Index of the flag just added to the active hoist, so only it animates in. */
  const [justAdded, setJustAdded] = useState<number | null>(null)
  const [keysHidden, setKeysHidden] = useStored('keys-hidden', false, (r) => r === true)
  const [pickingPosition, setPickingPosition] = useState(false)
  const [layout, setLayout] = useStored<KeyLayout>('key-layout', 'qwerty', (r) => (r === 'alphabet' ? 'alphabet' : 'qwerty'))

  const [drag, setDrag] = useState<Drag | null>(null)
  const pending = useRef<{ source: DragSource; id: FlagId; x0: number; y0: number } | null>(null)
  const suppressClick = useRef(false)
  const mastRef = useRef<HTMLDivElement>(null)
  const keyboardRef = useRef<HTMLElement>(null)

  // Keep the active hoist in view when the mast scrolls sideways.
  useEffect(() => {
    mastRef.current?.querySelector('.halyard[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, hoists.length])

  const setHoist = (flags: FlagId[]) =>
    setMessage((m) => ({ ...m, hoists: m.hoists.map((h, i) => (i === m.active ? flags : h)) }))

  const add = (id: FlagId) => {
    setHoist([...hoist, id])
    setJustAdded(hoist.length)
    setPicked(null)
  }
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
  const selectHoist = (index: number, pick: number | null = null) => {
    setMessage((m) => ({ ...m, active: index }))
    setPicked(pick)
    setJustAdded(null)
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
  /** Append the latitude and longitude groups as two hoists. */
  const addPosition = (groups: [string, string]) => {
    setMessage((m) => {
      const kept = m.hoists.filter((h) => h.length > 0)
      const next = [...kept, ...groups.map((g) => encodeGroup(g).flags)]
      return { hoists: next, active: kept.length }
    })
    setPicked(null)
  }
  const clearAll = () => {
    setMessage({ hoists: [[]], active: 0 })
    setPicked(null)
  }

  /** Work out what the pointer is over while dragging. */
  const locate = (x: number, y: number, source: DragSource): Pick<Drag, 'target' | 'overKeys'> => {
    const mast = mastRef.current?.getBoundingClientRect()
    const keys = keyboardRef.current?.getBoundingClientRect()
    if (!mast || !keys) return { target: null, overKeys: false }
    const overKeys = x >= keys.left && x <= keys.right && y >= keys.top && y <= keys.bottom
    if (overKeys || x < mast.left || x > mast.right || y < mast.top || y > mast.bottom) {
      return { target: null, overKeys }
    }
    // The nearest halyard sideways; a little slack so the flag need not be exactly on it.
    const columns = [...mastRef.current!.querySelectorAll<HTMLElement>('.halyard')]
    let nearest = -1
    let distance = Infinity
    columns.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      if (d < distance) {
        distance = d
        nearest = i
      }
    })
    if (nearest < 0 || distance > 40) return { target: null, overKeys }
    let gap = 0
    columns[nearest].querySelectorAll('.hung').forEach((el, i) => {
      if (source.from === 'hoist' && source.hoist === nearest && i === source.index) return
      const r = el.getBoundingClientRect()
      if (y > r.top + r.height / 2) gap++
    })
    return { target: { hoist: nearest, gap }, overKeys }
  }

  const drop = (d: Drag) => {
    const { source, target, id } = d
    if (target) {
      setMessage((m) => {
        const next = m.hoists.map((h) => h.slice())
        if (source.from === 'hoist') next[source.hoist].splice(source.index, 1)
        next[target.hoist].splice(target.gap, 0, id)
        return { hoists: next, active: target.hoist }
      })
    } else if (source.from === 'hoist' && d.overKeys) {
      setMessage((m) => ({
        ...m,
        hoists: m.hoists.map((h, i) => (i === source.hoist ? h.filter((_, j) => j !== source.index) : h)),
      }))
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
  const renderKey = (f: FlagData) => (
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
  )
  const dragFrom = drag?.source.from === 'hoist' ? drag.source : null
  const removing = dragFrom !== null && drag!.overKeys

  const typed = resolveHoist(hoist).text.replaceAll('?', '')
  const isEmpty = hoists.every((h) => h.length === 0)
  const longest = Math.max(1, ...hoists.map((h) => h.length))

  return (
    <div className="compose">
      <section className="deck" aria-label="Message">
        <div className="mast" ref={mastRef} style={{ '--n': longest } as CSSProperties}>
          {hoists.map((flags, h) => {
            const fromHere = dragFrom?.hoist === h ? dragFrom.index : null
            const gapHere = drag?.target?.hoist === h ? drag.target.gap : null
            return (
              <div className="halyard" key={h} data-active={h === active} onClick={() => selectHoist(h)}>
                <button
                  type="button"
                  className="hoist-tab"
                  aria-pressed={h === active}
                  aria-label={`Hoist ${h + 1}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectHoist(h)
                  }}
                >
                  {h + 1}
                </button>
                <div className="rope">
                  {flags.length === 0 && gapHere === null && <span className="hung-placeholder" />}
                  {flags.map((id, i) => {
                    const dragged = fromHere === i
                    // Position among the flags that stay put, so the drop mark lands between the right two.
                    const slot = fromHere !== null && fromHere < i ? i - 1 : i
                    return (
                      <div className="hung-slot" key={`${i}-${id}`}>
                        {!dragged && gapHere === slot && <span className="drop-mark" />}
                        <button
                          type="button"
                          className="hung"
                          data-new={h === active && justAdded === i}
                          data-dragging={dragged}
                          aria-pressed={h === active && pickedValid === i}
                          onClick={(e) => {
                            e.stopPropagation()
                            tap(() => selectHoist(h, h === active && pickedValid === i ? null : i))()
                          }}
                          {...draggable({ from: 'hoist', hoist: h, index: i }, id)}
                        >
                          <Flag id={id} />
                        </button>
                      </div>
                    )
                  })}
                  {gapHere !== null && gapHere === flags.length - (fromHere !== null ? 1 : 0) && (
                    <div className="hung-slot">
                      <span className="drop-mark" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {hoists[hoists.length - 1].length > 0 && (
            <button type="button" className="add-hoist" onClick={addHoist}>
              <span aria-hidden="true">+</span>
              Add hoist
            </button>
          )}
        </div>

        <div className="readings">
          {isEmpty ? (
            <div className="reading-empty">
              <h1>Build a hoist</h1>
              <p>Tap flags to hang them on the halyard. A hoist reads from the top down; hoists read left to right.</p>
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
          <div className="message-actions">
            <button type="button" className="quiet" onClick={() => setPickingPosition(true)}>
              Add position
            </button>
            {!isEmpty && (
              <button type="button" className="quiet" onClick={clearAll}>
                Clear message
              </button>
            )}
          </div>
        </div>
      </section>

      <section
        className="keyboard"
        aria-label="Flags"
        ref={keyboardRef}
        data-removing={removing}
        data-hidden={keysHidden}
      >
        {removing && <p className="remove-hint">Drop to remove</p>}
        <button
          type="button"
          className="keys-toggle"
          aria-expanded={!keysHidden}
          aria-controls="flag-keys"
          onClick={() => setKeysHidden(!keysHidden)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
            <path d={keysHidden ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
          </svg>
          {keysHidden ? 'Show flags' : 'Hide flags'}
        </button>

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
              aria-label={`Type a group for hoist ${active + 1}`}
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

        <div id="flag-keys" className="keys-panel">
          {layout === 'qwerty' ? (
            <div className="keys-qwerty">
              {QWERTY_ROWS.map((row, i) => (
                <div className="key-row" key={i}>
                  {row.map(renderKey)}
                </div>
              ))}
            </div>
          ) : (
            <div className="keys">{LETTER_KEYS.map(renderKey)}</div>
          )}
          <div className="keys keys-pennants">{PENNANT_KEYS.map(renderKey)}</div>
          <button
            type="button"
            className="quiet layout-switch"
            onClick={() => setLayout(layout === 'qwerty' ? 'alphabet' : 'qwerty')}
          >
            {layout === 'qwerty' ? 'Switch to A–Z order' : 'Switch to QWERTY order'}
          </button>
        </div>
      </section>

      <PositionSheet open={pickingPosition} onClose={() => setPickingPosition(false)} onAdd={addPosition} />

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
