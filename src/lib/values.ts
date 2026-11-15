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
    pattern: /lat…|long…|\bposition\b/i,
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
    pattern: /(?<!alter(ing)? (my |your )?)\bcourse\b/i,
    letters: [{ letter: 'C', label: 'Course' }],
  },
  bearing: { name: 'bearing', pattern: /\bbearing\b/i, letters: [{ letter: 'A', label: 'Bearing' }] },
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
