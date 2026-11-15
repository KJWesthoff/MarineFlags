import { useCallback, useEffect, useRef, useState } from 'react'
import { LETTER_THING, VALUE_KINDS, type ValueRequest } from '../lib/values'
import { ValueField } from './ValueField'

interface Props {
  /** What to ask for, or null when the sheet is closed. */
  request: ValueRequest | null
  onClose: () => void
  /**
   * Called with the finished group. "replace" puts it on the hoist the request came from
   * (it completes that signal); "new" adds it as a hoist of its own.
   */
  onAdd: (group: string, placement: 'replace' | 'new') => void
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** A sheet for entering one piece of further information: a time, a number, a name… */
export function ValueSheet({ request, onClose, onAdd }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [choice, setChoice] = useState(0)
  const [value, setValue] = useState<string | null>(null)
  const onValue = useCallback((v: string | null) => setValue(v), [])
  const [number, setNumber] = useState('')
  const [unit, setUnit] = useState<'M' | 'F'>('M')
  const [name, setName] = useState('')

  useEffect(() => {
    const el = dialog.current
    if (request && el && !el.open) el.showModal()
  }, [request])

  if (!request) return null

  let title: string
  let group: string | null = null
  let placement: 'replace' | 'new' = 'new'
  const kindInfo = request.type === 'kind' ? VALUE_KINDS[request.kind] : null
  const letter =
    request.type === 'letter'
      ? request.letter
      : kindInfo
        ? kindInfo.letters[Math.min(choice, kindInfo.letters.length - 1)].letter
        : null

  if (request.type === 'kind') {
    title = `Add ${article(kindInfo!.name)} ${kindInfo!.name}`
    group = value ? letter + value : null
  } else if (request.type === 'letter') {
    const thing = LETTER_THING[request.letter]
    title = `Add ${article(thing)} ${thing}`
    group = value ? request.letter + value : null
    placement = 'replace'
  } else if (request.type === 'number') {
    title = `Add a number to ${request.code}`
    const valid = /^\d+(\.\d+)?$/.test(number.trim())
    group = valid ? request.code + number.trim().replace(/^0+(?=\d)/, '') + (request.units ? unit : '') : null
    placement = 'replace'
  } else {
    title = 'Add a name or call sign'
    group = name.length > 0 ? name : null
  }

  const close = () => dialog.current?.close()
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="value-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      <header className="sheet-head">
        <div>
          <h2 id="value-title">{title}</h2>
          <p>{placement === 'replace' ? 'It completes the signal on this hoist.' : 'It is added to the message as a hoist of its own.'}</p>
        </div>
        <button type="button" onClick={close}>
          Close
        </button>
      </header>
      <footer className="sheet-foot">
        {kindInfo && kindInfo.letters.length > 1 && (
          <div className="segmented value-choice" role="group" aria-label="Kind">
            {kindInfo.letters.map((option, i) => (
              <button type="button" key={option.letter} aria-pressed={i === choice} onClick={() => setChoice(i)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        {letter && <ValueField key={letter} letter={letter} onChange={onValue} />}
        {request.type === 'number' && (
          <div className="value-field">
            <label htmlFor="value-number">Number</label>
            <div className="value-row">
              <input
                id="value-number"
                type="text"
                inputMode="decimal"
                placeholder="For example 20"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(',', '.'))}
              />
              {request.units && (
                <select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as 'M' | 'F')}>
                  <option value="M">Meters</option>
                  <option value="F">Feet</option>
                </select>
              )}
            </div>
          </div>
        )}
        {request.type === 'name' && (
          <div className="value-field">
            <label htmlFor="value-name">Name or call sign, spelled with flags</label>
            <input
              id="value-name"
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="For example OXYZ"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </div>
        )}
        <button
          type="button"
          className="primary"
          disabled={!group}
          onClick={() => {
            if (group) onAdd(group, placement)
            close()
          }}
        >
          {!group
            ? 'Fill in the value to add it'
            : placement === 'replace'
              ? `Put ${group} on the hoist`
              : `Add ${group} as a new hoist`}
        </button>
      </footer>
    </dialog>
  )
}
