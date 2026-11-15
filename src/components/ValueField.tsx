import { useEffect, useState } from 'react'
import { TABLES } from '../lib/signals'
import type { ValueLetter } from '../lib/values'

const LABEL: Record<ValueLetter, string> = {
  A: 'Bearing in degrees',
  C: 'Course in degrees',
  D: 'Date',
  G: 'Longitude',
  K: 'Communicate by',
  L: 'Latitude',
  R: 'Distance in nautical miles',
  S: 'Speed in knots',
  T: 'Local time',
  V: 'Speed in kilometers per hour',
  Z: 'Time in UTC',
}

const two = (n: number) => String(n).padStart(2, '0')

/** A whole number in a range, or null. */
function whole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= min && n <= max ? n : null
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

function clock(utc: boolean) {
  const now = new Date()
  return utc ? `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}` : `${two(now.getHours())}:${two(now.getMinutes())}`
}

interface Props {
  letter: ValueLetter
  /** Called with the figures (and hemisphere) that follow the letter, or null while incomplete. */
  onChange: (value: string | null) => void
}

/** The input for the value a single-letter signal carries, shaped to the kind of value. */
export function ValueField({ letter, onChange }: Props) {
  const [text, setText] = useState('')
  const [date, setDate] = useState(today)
  const [dateParts, setDateParts] = useState<'2' | '4' | '6'>('4')
  const [time, setTime] = useState(() => clock(letter === 'Z'))
  const [degrees, setDegrees] = useState('')
  const [minutes, setMinutes] = useState('')
  const [hemisphere, setHemisphere] = useState(letter === 'L' ? 'N' : 'E')
  const [choice, setChoice] = useState('1')

  let value: string | null = null
  switch (letter) {
    case 'A':
    case 'C': {
      const n = whole(text, 0, 359)
      value = n === null ? null : String(n).padStart(3, '0')
      break
    }
    case 'D': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
      if (m) value = (m[3] + m[2] + m[1].slice(2)).slice(0, Number(dateParts))
      break
    }
    case 'L':
    case 'G': {
      const maxDegrees = letter === 'L' ? 90 : 180
      const d = whole(degrees, 0, maxDegrees)
      const min = whole(minutes === '' ? '0' : minutes, 0, 59)
      if (d !== null && min !== null && (d < maxDegrees || min === 0)) value = `${two(d)}${two(min)}${hemisphere}`
      break
    }
    case 'K':
      value = choice
      break
    case 'R':
    case 'S':
    case 'V':
      if (/^\d+(\.\d+)?$/.test(text.trim())) value = text.trim().replace(/^0+(?=\d)/, '')
      break
    case 'T':
    case 'Z': {
      const m = /^(\d{2}):(\d{2})/.exec(time)
      if (m) value = m[1] + m[2]
      break
    }
  }

  useEffect(() => onChange(value), [value, onChange])

  const id = `value-${letter}`
  return (
    <div className="value-field">
      <label htmlFor={id}>{LABEL[letter]}</label>
      {(letter === 'A' || letter === 'C') && (
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="0 to 359"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {(letter === 'R' || letter === 'S' || letter === 'V') && (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="For example 12 or 12.5"
          value={text}
          onChange={(e) => setText(e.target.value.replace(',', '.'))}
        />
      )}
      {letter === 'D' && (
        <div className="value-row">
          <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select aria-label="How much of the date to send" value={dateParts} onChange={(e) => setDateParts(e.target.value as '2' | '4' | '6')}>
            <option value="2">Day only</option>
            <option value="4">Day and month</option>
            <option value="6">Day, month and year</option>
          </select>
        </div>
      )}
      {(letter === 'T' || letter === 'Z') && (
        <input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      )}
      {(letter === 'L' || letter === 'G') && (
        <div className="value-row">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            placeholder={letter === 'L' ? 'Degrees, 0 to 90' : 'Degrees, 0 to 180'}
            aria-label="Degrees"
            value={degrees}
            onChange={(e) => setDegrees(e.target.value)}
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Minutes"
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <select aria-label="Hemisphere" value={hemisphere} onChange={(e) => setHemisphere(e.target.value)}>
            {(letter === 'L' ? ['N', 'S'] : ['E', 'W']).map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </div>
      )}
      {letter === 'K' && (
        <select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
          {TABLES.C1.groups[0].rows.map((row) => (
            <option key={row.n} value={row.n}>
              {row.n}: {row.text}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
