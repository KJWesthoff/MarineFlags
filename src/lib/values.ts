/** Letters that carry a value when followed by numerals: C240 is a course, D1504 a date. */
export const VALUE_LETTERS = ['A', 'C', 'D', 'G', 'K', 'L', 'R', 'S', 'T', 'V', 'Z'] as const
export type ValueLetter = (typeof VALUE_LETTERS)[number]

export const isValueLetter = (letter: string): letter is ValueLetter =>
  (VALUE_LETTERS as readonly string[]).includes(letter)

/** A kind of extra information a code book signal can call for. */
export type ValueKind = 'position' | 'time' | 'date' | 'course' | 'bearing' | 'distance' | 'speed'

export interface ValueKindInfo {
  /** Lower-case name used in buttons: "Add course". */
  name: string
  /** Words in a signal's meaning that show it calls for this value. */
  pattern: RegExp
  /** The single-letter signals that carry the value; more than one where there is a choice of unit. */
  letters: { letter: ValueLetter; label: string }[]
}

export const VALUE_KINDS: Record<ValueKind, ValueKindInfo> = {
  position: {
    name: 'position',
    // Only where a position is to be given: "my position is indicated by rockets" does not count.
    pattern: /lat…|long…|position indicated|position to be indicated|indicated by position|position and time/i,
    letters: [
      { letter: 'L', label: 'Latitude' },
      { letter: 'G', label: 'Longitude' },
    ],
  },
  time: {
    name: 'time',
    pattern: /\btime\b/i,
    letters: [
      { letter: 'T', label: 'Local time' },
      { letter: 'Z', label: 'UTC' },
    ],
  },
  date: { name: 'date', pattern: /\bdate\b/i, letters: [{ letter: 'D', label: 'Date' }] },
  course: {
    name: 'course',
    // Not "altering my course": that describes a maneuver, it does not ask for a figure.
    pattern: /(?<!alter(ing)? (my |your )?)\bcourse\b|\bcourse to…/i,
    letters: [{ letter: 'C', label: 'Course' }],
  },
  bearing: { name: 'bearing', pattern: /\bbearings?\b/i, letters: [{ letter: 'A', label: 'Bearing' }] },
  distance: {
    name: 'distance',
    pattern: /(?<!(safe|shorten|shortening|signal) )\bdistance\b/i,
    letters: [{ letter: 'R', label: 'Nautical miles' }],
  },
  speed: {
    name: 'speed',
    pattern: /(?<!(full|slow|maximum|increase|increasing|reduce|reducing|reduced) )\bspeed\b/i,
    letters: [
      { letter: 'S', label: 'Knots' },
      { letter: 'V', label: 'Kilometers per hour' },
    ],
  },
}

/** The extra values a signal's meaning calls for, e.g. a position and a time. */
export function valueKindsFor(meaning: string): ValueKind[] {
  return (Object.keys(VALUE_KINDS) as ValueKind[]).filter((kind) => VALUE_KINDS[kind].pattern.test(meaning))
}

/** What each value letter carries, for "Add time", "Add course" and so on. */
export const LETTER_THING: Record<ValueLetter, string> = {
  A: 'bearing', C: 'course', D: 'date', G: 'longitude', K: 'means of communication', L: 'latitude',
  R: 'distance', S: 'speed', T: 'time', V: 'speed', Z: 'time',
}

/** Something more a hoist can say, and how it is asked for. */
export type ValueRequest =
  /** A value the signal's wording calls for; it goes on a hoist of its own. */
  | { type: 'kind'; kind: Exclude<ValueKind, 'position'> }
  /** The figures that complete a single value letter on the same hoist: T becomes T1430. */
  | { type: 'letter'; letter: ValueLetter }
  /** A number that completes a code signal on the same hoist: DI becomes DI20. */
  | { type: 'number'; code: string; units: boolean }
  /** A name or call sign, spelled out on a hoist of its own. */
  | { type: 'name' }

export interface SignalOption {
  label: string
  request: ValueRequest | 'position'
}

const NUMBER_ASKED =
  /…\s*\((indicate )?(in |number|numerals?)|\(maximum and minimum|tens of degrees|indicated by complements|\b(number|hundreds)\b[^.]*\bis…/i
const NUMBER_WITH_UNIT = /…\s*(degrees|knots|miles|hours|kHz|MHz)\b/i
const LENGTH_UNITS = /feet or meters/i
const NAME_ASKED =
  /name or identity signal|name \(or identity signal\)|\((name|or name)\b|(vessel|place|station|port|aircraft) indicated|(bound for|coming from|coast of)…/i

/**
 * The further information a decoded hoist can take: the value for a lone value letter,
 * or the number, values and names a code book signal's wording calls for.
 */
export function optionsFor(decoded: { kind: string; text: string; entry?: { code: string; meaning: string } }): SignalOption[] {
  if (decoded.kind === 'single-letter' && isValueLetter(decoded.text)) {
    const letter = decoded.text
    return [{ label: `Add ${LETTER_THING[letter]}`, request: { type: 'letter', letter } }]
  }
  const entry = decoded.entry
  if (!entry) return []
  const options: SignalOption[] = []
  const kinds = valueKindsFor(entry.meaning)
  if (NUMBER_ASKED.test(entry.meaning) || (kinds.length === 0 && NUMBER_WITH_UNIT.test(entry.meaning))) {
    options.push({
      label: 'Add number',
      request: { type: 'number', code: entry.code.replace(/\s/g, ''), units: LENGTH_UNITS.test(entry.meaning) },
    })
  }
  for (const kind of kinds) {
    options.push({ label: `Add ${VALUE_KINDS[kind].name}`, request: kind === 'position' ? 'position' : { type: 'kind', kind } })
  }
  if (NAME_ASKED.test(entry.meaning)) options.push({ label: 'Add name or call sign', request: { type: 'name' } })
  return options
}
