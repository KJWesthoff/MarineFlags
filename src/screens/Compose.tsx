import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Message } from '../App'
import { Flag } from '../components/Flag'
import { FLAGS, type FlagId } from '../data/flags'
import { decodeHoist, encodeGroup, resolveHoist, type Decoded } from '../lib/signals'

const KEY_LABEL: Partial<Record<FlagId, string>> = { SUB1: '1st', SUB2: '2nd', SUB3: '3rd', CODE: 'Code' }
const LETTER_KEYS = FLAGS.filter((f) => f.kind === 'letter')
const PENNANT_KEYS = FLAGS.filter((f) => f.kind !== 'letter')

interface Props {
  message: Message
  setMessage: Dispatch<SetStateAction<Message>>
}

export function Compose({ message, setMessage }: Props) {
  const { hoists, active } = message
  const hoist = hoists[active]
  /** Index of the flag picked on the halyard, for moving or removing it. */
  const [picked, setPicked] = useState<number | null>(null)
  const pickedValid = picked !== null && picked < hoist.length ? picked : null

  const setHoist = (flags: FlagId[]) =>
    setMessage((m) => ({ ...m, hoists: m.hoists.map((h, i) => (i === m.active ? flags : h)) }))

  const add = (id: FlagId) => {
    setHoist([...hoist, id])
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
      <section className="deck" aria-label="Message">
        <div className="halyard" aria-label={`Hoist ${active + 1}, read from the top`}>
          {hoist.length === 0 && <p className="halyard-empty">Top of the hoist</p>}
          {hoist.map((id, i) => (
            <button
              type="button"
              key={`${i}-${id}`}
              className="hung"
              aria-pressed={pickedValid === i}
              onClick={() => setPicked(pickedValid === i ? null : i)}
            >
              <Flag id={id} />
            </button>
          ))}
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

      <section className="keyboard" aria-label="Flags">
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
            <button type="button" key={f.id} className="key" onClick={() => add(f.id)} aria-label={f.name}>
              <Flag id={f.id} />
              <span aria-hidden="true">{f.id}</span>
            </button>
          ))}
        </div>
        <div className="keys keys-pennants">
          {PENNANT_KEYS.map((f) => (
            <button type="button" key={f.id} className="key" onClick={() => add(f.id)} aria-label={f.name}>
              <Flag id={f.id} />
              <span aria-hidden="true">{KEY_LABEL[f.id] ?? f.id}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Reading(props: {
  index: number
  decoded: Decoded
  active: boolean
  showIndex: boolean
  onSelect: () => void
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
      {props.onRemove && active && (
        <button type="button" className="quiet reading-remove" onClick={props.onRemove}>
          Remove hoist
        </button>
      )}
    </li>
  )
}
