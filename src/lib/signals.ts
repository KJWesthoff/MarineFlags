/**
 * Decoding and encoding of flag hoists under the International Code of Signals.
 * Pure logic, no UI: a hoist is a list of flags read from the top down.
 */
import codebookData from '../data/codebook.json'
import notesData from '../data/notes.json'
import tablesData from '../data/tables.json'
import { FLAG_BY_ID, type FlagId } from '../data/flags'

export interface CodebookEntry {
  code: string
  meaning: string
  section: string | null
  procedural?: boolean
  /** A meaning the group has outside the code book, e.g. in naval use. */
  note?: string
}

const NOTES = notesData as Record<string, string>

/** A meaning a flag or group has outside the code book, e.g. in naval use. */
export const noteFor = (key: string): string | undefined => NOTES[key]

export const CODEBOOK = (codebookData as CodebookEntry[]).map((e) => (NOTES[e.code] ? { ...e, note: NOTES[e.code] } : e))
const BY_CODE = new Map(CODEBOOK.map((e) => [e.code, e]))

export const lookup = (code: string): CodebookEntry | undefined => BY_CODE.get(code)

export interface TableRow {
  n: string
  text: string
  detail?: string
  caution?: string
  /** Marked in the book: indicate the side of the body as required. */
  star?: boolean
}

/** A table or list from the book that signals refer to. */
export interface RefTable {
  title: string
  subtitle?: string
  /** Where in the International Code of Signals the table is. */
  source?: string
  /** Source line for material that is not from the code book. */
  credit?: string
  note?: string
  /** How row keys are laid out: a wider column, or stacked above the text. */
  keys?: 'wide' | 'stacked'
  groups: { title?: string; rows: TableRow[] }[]
}

export const TABLES = tablesData.tables as Record<string, RefTable>
const TABLES_BY_CODE = tablesData.byCode as Record<string, string[]>
/** Background topics offered in the Reference guide, in display order. */
export const GUIDE = tablesData.guide as string[]

/**
 * The call sign series a group falls in, and the country it is allocated to.
 * Series are keyed by their first one to three characters, e.g. "OU–OZ" or "3DA–3DM".
 */
export function callSignCountry(group: string): TableRow | undefined {
  const allocations = TABLES.PREFIX.groups[0].rows
  for (const length of [3, 2, 1]) {
    const head = group.slice(0, length)
    if (head.length < length) continue
    const found = allocations.find((row) => {
      const [from, to = from] = row.n.split('–')
      return from.length === length && head >= from && head <= to
    })
    if (found) return found
  }
  return undefined
}

/** A note and table link for a group that could be a ship's call sign. */
function callSignHint(group: string): { tables: TableRef[]; notes: string[] } {
  const found = group.length >= 4 && group.length <= 7 ? callSignCountry(group) : undefined
  if (!found) return { tables: [], notes: [] }
  return {
    tables: [{ id: 'PREFIX', row: found.n }],
    notes: [`As a call sign, it belongs to ${found.text} (series ${found.n}).`],
  }
}

/** Ids of the tables a signal refers to, in the order the meaning mentions them. */
export function tablesFor(entry: CodebookEntry): string[] {
  const ids = new Set<string>()
  for (const m of entry.meaning.matchAll(/Table (M-)?(\d)/g)) ids.add((m[1] ? 'M' : 'C') + m[2])
  for (const id of TABLES_BY_CODE[entry.code] ?? []) ids.add(id)
  return [...ids].filter((id) => id in TABLES)
}

export function findRow(tableId: string, n: string): TableRow | undefined {
  for (const g of TABLES[tableId]?.groups ?? []) {
    const row = g.rows.find((r) => r.n === n)
    if (row) return row
  }
  return undefined
}

/** A table to offer alongside a decoded signal, with the row its complement selects. */
export interface TableRef {
  id: string
  row?: string
  /** The signal the table was opened from, e.g. "MBF" or "UV 4"; its rows are that signal's complements. */
  code?: string
}

/** Tables whose rows are read, not hoisted. */
const READ_ONLY_TABLES = new Set(['TERMS', 'FLAGS', 'DISTRESS', 'MAFOR'])
/** Tables whose row keys are themselves signals or letters. */
const SIGNAL_TABLES = new Set(['PRATIQUE', 'PROCEDURE', 'LETTERS', 'MORSE'])

/**
 * The group a table row stands for when hoisted, or null if the row is not a signal.
 * A complement row joins the signal the table was opened from: MBF with row 12 is "MBF12".
 */
export function rowGroup(ref: TableRef, row: TableRow): string | null {
  if (READ_ONLY_TABLES.has(ref.id)) return null
  if (ref.id === 'PREFIX') return row.n.split('–')[0]
  if (SIGNAL_TABLES.has(ref.id)) return row.n.replace(/\s/g, '')
  return (ref.code ?? '').replace(/\s/g, '') + row.n
}

/** Tables for a signal, resolving a numeric complement to a row where one matches. */
function resolveTables(entry: CodebookEntry, complement?: string): { tables: TableRef[]; notes: string[] } {
  const n = complement === undefined ? undefined : String(Number(complement))
  const notes: string[] = []
  const tables = tablesFor(entry).map((id): TableRef => {
    const row = n === undefined ? undefined : findRow(id, n)
    if (row) notes.push(`${n}: ${row.text}${row.text.endsWith('.') ? '' : '.'}`)
    return row ? { id, row: n, code: entry.code } : { id, code: entry.code }
  })
  return { tables, notes }
}

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
  /** Tables from the book that this signal refers to. */
  tables: TableRef[]
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
  const base = { notes: [] as string[], errors: [] as string[], tables: [] as TableRef[] }
  if (flags.length === 0) return { ...base, kind: 'empty', text: '', title: '', meaning: '' }

  if (flags.length === 1 && FLAG_BY_ID[flags[0]].kind !== 'letter' && FLAG_BY_ID[flags[0]].kind !== 'numeral') {
    const f = FLAG_BY_ID[flags[0]]
    const errors = f.kind === 'substitute' ? ['A substitute cannot be hoisted alone.'] : []
    const notes = NOTES[f.id] ? [NOTES[f.id]] : []
    return { ...base, notes, errors, kind: 'pennant', text: '', title: f.name, meaning: f.meaning ?? '' }
  }

  const { text, errors } = resolveHoist(flags)
  const result = (
    d: Omit<Decoded, 'notes' | 'errors' | 'text' | 'tables'> & { notes?: string[]; text?: string; tables?: TableRef[] },
  ): Decoded => ({
    text, tables: [], ...d, errors,
    notes: [...(d.notes ?? []), ...(d.entry?.note ? [d.entry.note] : [])],
  })

  if (text.includes('?')) {
    return result({ kind: 'unknown', title: 'Invalid hoist', meaning: 'This hoist cannot be read as it stands.' })
  }

  // A position: latitude or longitude with its hemisphere, e.g. L2537N or G13925E.
  const position = /^(?:(L)(\d{4})([NS])|(G)(\d{4,5})([EW]))$/.exec(text)
  if (position) {
    const letter = position[1] ?? position[4]
    const figures = position[2] ?? position[5]
    const hemisphere = position[3] ?? position[6]
    const c = decodeComplement(letter, figures)
    if (c) {
      return result({
        kind: 'complement', title: c.title, text: `${letter} ${figures} ${hemisphere}`,
        meaning: c.meaning.replace(/\.$/, ` ${hemisphere}.`),
      })
    }
  }

  // A code signal with a depth or length: the figures are followed by F (feet) or M (meters).
  const measured = /^([A-Z]{2}|M[A-Z]{2})(\d+(?:\.\d+)?)([FM])$/.exec(text)
  const measuredEntry = measured ? lookup(measured[1]) : undefined
  if (measured && measuredEntry && /feet or meters/i.test(measuredEntry.meaning)) {
    const medical = measured[1].length === 3
    return result({
      kind: medical ? 'medical' : 'code', title: medical ? 'Medical signal' : 'Code signal',
      meaning: measuredEntry.meaning, entry: measuredEntry, text: `${measured[1]} ${measured[2]} ${measured[3]}`,
      notes: [`${measured[2]} ${measured[3] === 'F' ? 'feet' : 'meters'}.`],
    })
  }

  const m = /^([A-Z]*)([0-9.]*)$/.exec(text)
  if (!m) {
    return result({ kind: 'spelling', title: 'Mixed group', meaning: text, ...callSignHint(text) })
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
      notes: NOTES[letters] ? [NOTES[letters]] : [],
    })
  }

  const plainDigits = /^[0-9]+$/.test(digits)

  if (letters.length === 1 && (plainDigits || ('RSV'.includes(letters) && /^\d+\.\d+$/.test(digits)))) {
    const c = decodeComplement(letters, digits)
    if (c) return result({ kind: 'complement', ...c, text: `${letters} ${digits}` })
  }

  if (letters.length === 2 || (letters.length === 3 && letters[0] === 'M')) {
    const medical = letters.length === 3
    const kind = medical ? 'medical' : 'code'
    const title = medical ? 'Medical signal' : 'Code signal'
    if (!digits) {
      const entry = lookup(letters)
      if (entry) return result({ kind, title, meaning: entry.meaning, entry, ...resolveTables(entry) })
    } else if (plainDigits) {
      const exactCode = `${letters} ${Number(digits)}`
      const exact = digits.length <= 2 ? lookup(exactCode) : undefined
      if (exact) {
        return result({ kind, title, meaning: exact.meaning, entry: exact, text: exactCode, ...resolveTables(exact) })
      }
      // A numbered signal followed by its own complement, e.g. UV 4 with condition 2.
      for (const split of [1, 2]) {
        const sub = digits.length > split ? lookup(`${letters} ${Number(digits.slice(0, split))}`) : undefined
        const rest = digits.slice(split)
        const resolved = sub && resolveTables(sub, rest)
        if (sub && resolved && resolved.notes.length) {
          return result({ kind, title, meaning: sub.meaning, entry: sub, text: `${sub.code} ${rest}`, ...resolved })
        }
      }
      const entry = lookup(letters)
      if (entry) {
        const resolved = resolveTables(entry, digits)
        return result({
          kind, title, meaning: entry.meaning, entry, text: `${letters} ${digits}`,
          tables: resolved.tables,
          notes: resolved.notes.length ? resolved.notes : [`With complement ${digits}.`],
        })
      }
    } else if (/^\d+\.\d+$/.test(digits)) {
      // A decimal number as the complement, e.g. a draft of 7.5.
      const entry = lookup(letters)
      if (entry) {
        return result({
          kind, title, meaning: entry.meaning, entry, text: `${letters} ${digits}`,
          tables: resolveTables(entry).tables, notes: [`With complement ${digits}.`],
        })
      }
    }
  }

  if (!digits) {
    return result({
      kind: 'spelling', title: 'Spelled out',
      meaning: letters,
      tables: callSignHint(letters).tables,
      notes: [[...letters].map((l) => FLAG_BY_ID[l as FlagId].name).join(' · '), ...callSignHint(letters).notes],
    })
  }
  return result({ kind: 'unknown', title: 'Unrecognized group', meaning: text, ...callSignHint(text) })
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
      const text = `${e.meaning} ${e.note ?? ''}`.toLowerCase()
      if (words.every((w) => text.includes(w))) byText.push(e)
    }
  }
  return [...byCode, ...byText].slice(0, limit)
}
