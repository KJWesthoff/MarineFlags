import { describe, expect, it } from 'vitest'
import { FLAGS, type FlagId } from '../data/flags'
import { CODEBOOK, decodeHoist, encodeGroup, lookup, resolveHoist, searchCodebook } from './signals'

describe('flag set', () => {
  it('has the 40 flags of the code', () => {
    expect(FLAGS).toHaveLength(40)
    expect(FLAGS.filter((f) => f.kind === 'letter')).toHaveLength(26)
    expect(FLAGS.filter((f) => f.kind === 'numeral')).toHaveLength(10)
    expect(FLAGS.filter((f) => f.kind === 'substitute')).toHaveLength(3)
    expect(new Set(FLAGS.map((f) => f.svg)).size).toBe(40)
  })
})

describe('code book', () => {
  it('holds well-known signals', () => {
    expect(lookup('NC')?.meaning).toBe('I am in distress and require immediate assistance.')
    expect(lookup('AC')?.meaning).toBe('I am abandoning my vessel.')
    expect(lookup('AE 1')?.meaning).toMatch(/wish to abandon/)
    expect(lookup('MAA')?.meaning).toBe('I request urgent medical advice.')
  })

  it('has unique, well-formed codes', () => {
    expect(new Set(CODEBOOK.map((e) => e.code)).size).toBe(CODEBOOK.length)
    for (const e of CODEBOOK) expect(e.code).toMatch(/^([A-Z]{2}|M[A-Z]{2})( \d{1,2})?$/)
    expect(CODEBOOK.length).toBeGreaterThan(1700)
  })
})

describe('substitutes', () => {
  const cases: [FlagId[], string][] = [
    [['V', 'SUB1'], 'VV'],
    [['1', 'SUB1', '0', 'SUB3'], '1100'],
    [['L', '2', '3', 'SUB2', '0'], 'L2330'],
    [['M', 'A', 'SUB2'], 'MAA'],
    [['1', '2', 'CODE', 'SUB2'], '12.2'],
    [['T', '1', 'SUB1', '0', 'SUB3'], 'T1100'],
  ]
  it.each(cases)('%j resolves to %s', (flags, text) => {
    expect(resolveHoist(flags)).toEqual({ text, errors: [] })
  })

  it('rejects misuse', () => {
    expect(resolveHoist(['SUB1', 'A']).errors).toHaveLength(1)
    expect(resolveHoist(['A', 'SUB2']).errors).toHaveLength(1)
    expect(resolveHoist(['A', 'SUB1', 'SUB1']).errors).toHaveLength(1)
  })

  it('round-trips through encoding', () => {
    for (const group of ['VV', '1100', 'MAA', 'L2330', 'AE1', 'T1100', '12.2', 'SOS', 'G12345', 'ABBA', 'Z0000']) {
      const { flags } = encodeGroup(group)
      expect(resolveHoist(flags).text, group).toBe(group)
    }
  })

  it('uses each substitute once and warns when they run out', () => {
    expect(encodeGroup('1100').flags).toEqual(['1', 'SUB1', '0', 'SUB3'])
    expect(encodeGroup('AAA').flags).toEqual(['A', 'SUB1', 'SUB2'])
    expect(encodeGroup('AAAAA').warnings).toHaveLength(1)
    expect(encodeGroup('ABC').warnings).toHaveLength(0)
  })
})

describe('decoding', () => {
  it('reads single letters', () => {
    expect(decodeHoist(['O'])).toMatchObject({ kind: 'single-letter', meaning: 'Man overboard.' })
  })

  it('reads two-letter signals, with and without numerals', () => {
    expect(decodeHoist(['N', 'C'])).toMatchObject({ kind: 'code', text: 'NC' })
    expect(decodeHoist(['A', 'E', '1'])).toMatchObject({ kind: 'code', text: 'AE 1' })
    expect(decodeHoist(['A', 'E', '1']).meaning).toMatch(/wish to abandon/)
  })

  it('keeps the base signal when numerals are a value', () => {
    const d = decodeHoist(['A', 'C', '7', '5'])
    expect(d).toMatchObject({ kind: 'code', meaning: 'I am abandoning my vessel.' })
    expect(d.notes[0]).toMatch(/75/)
  })

  it('reads medical signals', () => {
    expect(decodeHoist(['M', 'A', 'SUB2'])).toMatchObject({ kind: 'medical', text: 'MAA' })
  })

  it('reads single letters with complements', () => {
    expect(decodeHoist(['L', '2', '5', '3', '7']).meaning).toBe('Latitude 25° 37′.')
    expect(decodeHoist(['G', '1', '2', '0', '4', '5']).meaning).toBe('Longitude 120° 45′.')
    expect(decodeHoist(['T', '1', '4', '3', '0']).meaning).toBe('Local time 14:30.')
    expect(decodeHoist(['C', '2', '4', '0']).meaning).toBe('Course 240°.')
    expect(decodeHoist(['S', '1', '5']).meaning).toBe('Speed 15 knots.')
    expect(decodeHoist(['K', '3']).meaning).toMatch(/Morse signaling lamp/)
  })

  it('reads numbers, including decimals', () => {
    expect(decodeHoist(['1', '2', 'CODE', '5'])).toMatchObject({ kind: 'number', meaning: '12.5' })
  })

  it('falls back to spelling', () => {
    expect(decodeHoist(['S', 'O', 'SUB1'])).toMatchObject({ kind: 'spelling', meaning: 'SOS' })
  })

  it('handles pennants and invalid hoists', () => {
    expect(decodeHoist(['CODE']).kind).toBe('pennant')
    expect(decodeHoist(['SUB1', 'A']).kind).toBe('unknown')
    expect(decodeHoist([]).kind).toBe('empty')
  })
})

describe('search', () => {
  it('finds by code prefix and by words', () => {
    expect(searchCodebook('AE').map((e) => e.code)).toEqual(expect.arrayContaining(['AE', 'AE 1', 'AE 2']))
    expect(searchCodebook('man overboard').length).toBeGreaterThan(0)
  })
})
