/** Letters that carry a value when followed by numerals: C240 is a course, D1504 a date. */
export const VALUE_LETTERS = ['A', 'C', 'D', 'G', 'K', 'L', 'R', 'S', 'T', 'V', 'Z'] as const
export type ValueLetter = (typeof VALUE_LETTERS)[number]

export const isValueLetter = (letter: string): letter is ValueLetter =>
  (VALUE_LETTERS as readonly string[]).includes(letter)
