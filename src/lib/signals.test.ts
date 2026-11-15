import { describe, expect, it } from 'vitest'
import { FLAGS, type FlagId } from '../data/flags'
import { formatPosition, positionGroups } from './position'
import {
  CODEBOOK, TABLES, decodeHoist, encodeGroup, findRow, lookup, resolveHoist, searchCodebook, tablesFor,
} from './signals'

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

describe('referenced tables', () => {
  it('links signals to the tables they mention', () => {
    expect(tablesFor(lookup('MBF')!)).toEqual(['M1'])
    expect(tablesFor(lookup('CD')!)).toEqual(['C2'])
    expect(tablesFor(lookup('WY')!)).toEqual(['SEA'])
    expect(tablesFor(lookup('QQ')!)).toEqual(['PRATIQUE'])
    expect(tablesFor(lookup('AC')!)).toEqual([])
  })

  it('has complete medical tables', () => {
    const count = (id: string) => TABLES[id].groups.reduce((n, g) => n + g.rows.length, 0)
    expect(count('M1')).toBe(92)
    expect(count('M2')).toBe(94)
    expect(count('M3')).toBe(38)
    expect(findRow('M1', '12')?.text).toBe('Armpit')
  })

  it('resolves a complement to its table row', () => {
    const body = decodeHoist(['M', 'B', 'F', '1', '2'])
    expect(body.tables).toEqual([{ id: 'M1', row: '12' }])
    expect(body.notes).toEqual(['12: Armpit.'])
    expect(decodeHoist(['W', 'Y', '4']).notes).toEqual(['4: Moderate.'])
    expect(decodeHoist(['J', 'F', '3']).notes).toEqual(['3: Amidship.'])
    expect(decodeHoist(['U', 'V', '4', '7'])).toMatchObject({ text: 'UV 4 7', notes: ['7: By engaging in fishing activities.'] })
  })

  it('keeps signals that duplicate single-letter signals', () => {
    expect(lookup('ZS')?.meaning).toBe('My vessel is “healthy” and I request free pratique.')
    expect(lookup('SO')?.meaning).toBe('You should stop your vessel instantly.')
  })
})

describe('positions', () => {
  it('formats latitude and longitude groups', () => {
    expect(positionGroups({ lat: 25.6167, lon: -40.25 })).toEqual(['L2537N', 'G4015W'])
    expect(positionGroups({ lat: -37.6667, lon: 139.4167 })).toEqual(['L3740S', 'G13925E'])
    expect(positionGroups({ lat: 0, lon: 0 })).toEqual(['L0000N', 'G0000E'])
    expect(positionGroups({ lat: 59.9999, lon: 9.9999 })).toEqual(['L6000N', 'G1000E'])
    expect(positionGroups({ lat: 10, lon: 190 })).toEqual(['L1000N', 'G17000W'])
    expect(formatPosition({ lat: 25.6167, lon: -40.25 })).toBe('25° 37′ N, 40° 15′ W')
  })

  it('reads position groups with a hemisphere', () => {
    for (const [group, meaning] of [
      ['L2537N', 'Latitude 25° 37′ N.'],
      ['L3740S', 'Latitude 37° 40′ S.'],
      ['G4015W', 'Longitude 40° 15′ W.'],
      ['G13925E', 'Longitude 139° 25′ E.'],
    ]) {
      expect(decodeHoist(encodeGroup(group).flags)).toMatchObject({ kind: 'complement', meaning })
    }
  })
})

describe('search', () => {
  it('finds by code prefix and by words', () => {
    expect(searchCodebook('AE').map((e) => e.code)).toEqual(expect.arrayContaining(['AE', 'AE 1', 'AE 2']))
    expect(searchCodebook('man overboard').length).toBeGreaterThan(0)
  })
})
