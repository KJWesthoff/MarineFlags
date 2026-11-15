/**
 * Decoding and encoding of flag hoists under the International Code of Signals.
 * Pure logic, no UI: a hoist is a list of flags read from the top down.
 */
import codebookData from '../data/codebook.json'
import { FLAG_BY_ID, type FlagId } from '../data/flags'

export interface CodebookEntry {
  code: string
  meaning: string
  section: string | null
  procedural?: boolean
}

export const CODEBOOK = codebookData as CodebookEntry[]
const BY_CODE = new Map(CODEBOOK.map((e) => [e.code, e]))

export const lookup = (code: string): CodebookEntry | undefined => BY_CODE.get(code)

const isLetter = (c: string) => /^[A-Z]$/.test(c)
const isDigit = (c: string) => /^[0-9]$/.test(c)
const SUB_INDEX: Partial<Record<FlagId, number>> = { SUB1: 0, SUB2: 1, SUB3: 2 }

export interface Resolved {
  /** The group as text, e.g. "AE1", "MAA", "L2537", "12.5". */
  text: string
  /** Problems with the hoist itself (misused substitutes and so on). */
  errors: string[]
}

/** Replace substitutes with the flags they repeat and the code pennant with a decimal point. */
export function resolveHoist(flags: FlagId[]): Resolved {
  const out: string[] = []
  const errors: string[] = []
  const used = new Set<FlagId>()

  flags.forEach((flag, i) => {
    const sub = SUB_INDEX[flag]
    if (sub === undefined) {
      if (flag === 'CODE') out.push('.')
      else out.push(flag)
      return
    }
    const name = FLAG_BY_ID[flag].name
    if (used.has(flag)) errors.push(`${name} is used more than once in the group.`)
    used.add(flag)
    // The class (letters or numerals) is that of the flag just above; a decimal point is ignored.
    const prev = [...out].reverse().find((c) => c !== '.' && c !== '?')
    if (!prev) {
      errors.push(`${name} at position ${i + 1} has no flag above it to repeat.`)
      out.push('?')
      return
    }
    const sameClass = out.filter(isLetter(prev) ? isLetter : isDigit)
    if (sub >= sameClass.length) {
      errors.push(`${name} at position ${i + 1} points past the flags above it.`)
      out.push('?')
      return
    }
    out.push(sameClass[sub])
  })

  return { text: out.join(''), errors }
}

export interface Encoded {
  flags: FlagId[]
  /** Set when a repeat could not be covered by the three substitutes. */
  warnings: string[]
}

/**
 * Turn a group such as "AE1", "SOS" or "12.5" into flags, using substitutes for
 * repeated characters as a ship with a single set of flags would.
 */
export function encodeGroup(group: string): Encoded {
  const chars = [...group.toUpperCase()].filter((c) => isLetter(c) || isDigit(c) || c === '.')
  const flags: FlagId[] = []
  const warnings: string[] = []
  const done: string[] = []
  const usedSubs = new Set<number>()

  for (const c of chars) {
    if (c === '.') {
      flags.push('CODE')
      done.push('.')
      continue
    }
    const sameClass = done.filter(isLetter(c) ? isLetter : isDigit)
    if (sameClass.includes(c)) {
      const prev = [...done].reverse().find((d) => d !== '.')!
      const classMatches = isLetter(prev) === isLetter(c)
      const sub = [0, 1, 2].find((n) => sameClass[n] === c && !usedSubs.has(n))
      if (classMatches && sub !== undefined) {
        usedSubs.add(sub)
        flags.push((['SUB1', 'SUB2', 'SUB3'] as const)[sub])
      } else {
        warnings.push(`“${c}” repeats in a way the substitutes cannot cover; a second set of flags is needed.`)
        flags.push(c as FlagId)
      }
    } else {
      flags.push(c as FlagId)
    }
    done.push(c)
  }
  return { flags, warnings }
}

export type SignalKind =
  | 'empty'
  | 'single-letter'
  | 'code'
  | 'medical'
  | 'complement'
  | 'number'
  | 'spelling'
  | 'pennant'
  | 'unknown'

export interface Decoded {
  kind: SignalKind
  /** Resolved group as written in the code book, e.g. "AE 1". */
  text: string
  /** Short label for what the group is. */
  title: string
  /** The meaning, in words. */
  meaning: string
  /** Extra detail: complement values, base signal and so on. */
  notes: string[]
  errors: string[]
  entry?: CodebookEntry
}

const COMMUNICATE_BY = [
  '', 'Morse signaling by hand flags or arms', 'loud hailer (megaphone)', 'Morse signaling lamp', 'sound signals',
]

const pad = (s: string) => s.padStart(2, '0')

/** Single letters followed by numerals carry a value: A123 is a bearing, T1430 a local time … */
function decodeComplement(letter: string, digits: string): { title: string; meaning: string } | undefined {
  const n = digits.length
  switch (letter) {
    case 'A':
      if (n === 3) return { title: 'Azimuth or bearing', meaning: `Bearing ${digits}°.` }
      break
    case 'C':
      if (n === 3) return { title: 'Course', meaning: `Course ${digits}°.` }
      break
    case 'D':
      if (n === 2) return { title: 'Date', meaning: `Day ${digits} of the month.` }
      if (n === 4) return { title: 'Date', meaning: `Day ${digits.slice(0, 2)}, month ${digits.slice(2)}.` }
      if (n === 6)
        return { title: 'Date', meaning: `Day ${digits.slice(0, 2)}, month ${digits.slice(2, 4)}, year ’${digits.slice(4)}.` }
      break
    case 'G':
      if (n === 4 || n === 5)
        return { title: 'Longitude', meaning: `Longitude ${Number(digits.slice(0, -2))}° ${digits.slice(-2)}′.` }
      break
    case 'K':
      if (n === 1 && COMMUNICATE_BY[Number(digits)])
        return { title: 'Communicate', meaning: `I wish to communicate with you by ${COMMUNICATE_BY[Number(digits)]}.` }
      break
    case 'L':
      if (n === 4) return { title: 'Latitude', meaning: `Latitude ${digits.slice(0, 2)}° ${digits.slice(2)}′.` }
      break
    case 'R':
      return { title: 'Distance', meaning: `Distance ${Number(digits)} nautical miles.` }
    case 'S':
      return { title: 'Speed', meaning: `Speed ${Number(digits)} knots.` }
    case 'T':
      if (n === 4) return { title: 'Local time', meaning: `Local time ${pad(digits.slice(0, 2))}:${digits.slice(2)}.` }
      break
    case 'V':
      return { title: 'Speed', meaning: `Speed ${Number(digits)} kilometers per hour.` }
    case 'Z':
      if (n === 4) return { title: 'UTC', meaning: `Time ${pad(digits.slice(0, 2))}:${digits.slice(2)} UTC.` }
      if (n === 1) return { title: 'Shore station', meaning: `Calling shore visual station ${digits}.` }
      break
  }
  return undefined
}

/** Work out what one hoist means. */
export function decodeHoist(flags: FlagId[]): Decoded {
  const base = { notes: [] as string[], errors: [] as string[] }
  if (flags.length === 0) return { ...base, kind: 'empty', text: '', title: '', meaning: '' }

  if (flags.length === 1 && FLAG_BY_ID[flags[0]].kind !== 'letter' && FLAG_BY_ID[flags[0]].kind !== 'numeral') {
    const f = FLAG_BY_ID[flags[0]]
    const errors = f.kind === 'substitute' ? ['A substitute cannot be hoisted alone.'] : []
    return { ...base, errors, kind: 'pennant', text: '', title: f.name, meaning: f.meaning ?? '' }
  }

  const { text, errors } = resolveHoist(flags)
  const result = (d: Omit<Decoded, 'notes' | 'errors' | 'text'> & { notes?: string[]; text?: string }): Decoded => ({
    text, notes: [], ...d, errors,
  })

  if (text.includes('?')) {
    return result({ kind: 'unknown', title: 'Invalid hoist', meaning: 'This hoist cannot be read as it stands.' })
  }

  const m = /^([A-Z]*)([0-9.]*)$/.exec(text)
  if (!m) {
    return result({ kind: 'spelling', title: 'Mixed group', meaning: text })
  }
  const [, letters, digits] = m

  if (!letters) {
    return result({ kind: 'number', title: 'Number', meaning: digits })
  }

  if (letters.length === 1 && !digits) {
    const f = FLAG_BY_ID[letters as FlagId]
    return result({
      kind: 'single-letter',
      title: f.name,
      meaning: f.meaning ?? 'No single-letter meaning; used as a procedure signal.',
    })
  }

  const plainDigits = /^[0-9]+$/.test(digits)

  if (letters.length === 1 && plainDigits) {
    const c = decodeComplement(letters, digits)
    if (c) return result({ kind: 'complement', ...c, text: `${letters} ${digits}` })
  }

  if (letters.length === 2 || (letters.length === 3 && letters[0] === 'M')) {
    const medical = letters.length === 3
    const kind = medical ? 'medical' : 'code'
    const title = medical ? 'Medical signal' : 'Code signal'
    if (!digits) {
      const entry = lookup(letters)
      if (entry) return result({ kind, title, meaning: entry.meaning, entry })
    } else if (plainDigits) {
      const exactCode = `${letters} ${Number(digits)}`
      const exact = digits.length <= 2 ? lookup(exactCode) : undefined
      if (exact) {
        return result({ kind, title, meaning: exact.meaning, entry: exact, text: exactCode })
      }
      const entry = lookup(letters)
      if (entry) {
        return result({
          kind, title, meaning: entry.meaning, entry, text: `${letters} ${digits}`,
          notes: [`With complement ${digits}.`],
        })
      }
    }
  }

  if (!digits) {
    return result({
      kind: 'spelling', title: 'Spelled out',
      meaning: letters,
      notes: [[...letters].map((l) => FLAG_BY_ID[l as FlagId].name).join(' · ')],
    })
  }
  return result({ kind: 'unknown', title: 'Unrecognized group', meaning: text })
}

/** Decode a full message: several hoists, in the order they are to be read. */
export const decodeMessage = (hoists: FlagId[][]): Decoded[] =>
  hoists.filter((h) => h.length > 0).map(decodeHoist)

/** Search the code book by code prefix or by words in the meaning. */
export function searchCodebook(query: string, limit = 50): CodebookEntry[] {
  const q = query.trim()
  if (!q) return []
  const asCode = q.toUpperCase().replace(/\s+/g, ' ')
  const words = q.toLowerCase().split(/\s+/)
  const byCode: CodebookEntry[] = []
  const byText: CodebookEntry[] = []
  for (const e of CODEBOOK) {
    if (/^[A-Z]{1,3}( \d*)?$/.test(asCode) && e.code.startsWith(asCode)) byCode.push(e)
    else {
      const text = e.meaning.toLowerCase()
      if (words.every((w) => text.includes(w))) byText.push(e)
    }
  }
  return [...byCode, ...byText].slice(0, limit)
}
