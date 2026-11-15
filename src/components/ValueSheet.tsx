import { useCallback, useEffect, useRef, useState } from 'react'
import { VALUE_KINDS, type ValueKind } from '../lib/values'
import { ValueField } from './ValueField'

interface Props {
  /** The value to ask for, or null when the sheet is closed. */
  kind: Exclude<ValueKind, 'position'> | null
  onClose: () => void
  /** Called with the finished group, e.g. "C240" or "T1430". */
  onAdd: (group: string) => void
}

/** A sheet for entering one value a signal calls for: a time, a course, a date… */
export function ValueSheet({ kind, onClose, onAdd }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [choice, setChoice] = useState(0)
  const [value, setValue] = useState<string | null>(null)
  const onValue = useCallback((v: string | null) => setValue(v), [])

  useEffect(() => {
    if (!kind) return
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [kind])

  if (!kind) return null
  const info = VALUE_KINDS[kind]
  const { letter } = info.letters[Math.min(choice, info.letters.length - 1)]
  const group = value ? letter + value : null
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
          <h2 id="value-title">Add a {info.name}</h2>
          <p>It is added to the message as a hoist of its own.</p>
        </div>
        <button type="button" onClick={close}>
          Close
        </button>
      </header>
      <footer className="sheet-foot">
        {info.letters.length > 1 && (
          <div className="segmented value-choice" role="group" aria-label="Kind">
            {info.letters.map((option, i) => (
              <button type="button" key={option.letter} aria-pressed={i === choice} onClick={() => setChoice(i)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        <ValueField key={letter} letter={letter} onChange={onValue} />
        <button
          type="button"
          className="primary"
          disabled={!group}
          onClick={() => {
            if (group) onAdd(group)
            close()
          }}
        >
          {group ? `Add ${group} as a new hoist` : 'Fill in the value to add it'}
        </button>
      </footer>
    </dialog>
  )
}
