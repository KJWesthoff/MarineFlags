import { describe, expect, it } from 'vitest'
import { FLAGS } from '../data/flags'
import {
  DECKS, DECK_BY_ID, INTERVAL_DAYS, buildSession, deckStats, grade, isKnown, isTypedCorrect, makeQuestion,
  type Progress,
} from './learn'
import { lookup, resolveHoist } from './signals'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

/** A repeatable random source for tests. */
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('decks', () => {
  it('cover every flag and only real signals', () => {
    expect(DECK_BY_ID['flag-name'].cards).toHaveLength(40)
    expect(DECK_BY_ID['name-flag'].cards).toHaveLength(40)
    expect(DECK_BY_ID['flag-meaning'].cards).toHaveLength(25)
    for (const card of DECK_BY_ID.signals.cards) expect(lookup(card.id), card.id).toBeDefined()
    const keys = DECKS.flatMap((d) => d.cards.map((c) => c.key))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('scheduling', () => {
  it('moves a card up a box and further out on each right answer', () => {
    let p: Progress = {}
    for (let box = 1; box <= 5; box++) {
      p = grade(p, 'flag-name:K', true, NOW)
      expect(p['flag-name:K']).toEqual({ box, due: NOW + INTERVAL_DAYS[box] * DAY })
    }
    expect(grade(p, 'flag-name:K', true, NOW)['flag-name:K'].box).toBe(5)
  })

  it('sends a card back to the first box, due at once, on a wrong answer', () => {
    let p: Progress = {}
    for (let i = 0; i < 4; i++) p = grade(p, 'flag-name:K', true, NOW)
    expect(isKnown(p, 'flag-name:K')).toBe(true)
    p = grade(p, 'flag-name:K', false, NOW)
    expect(p['flag-name:K']).toEqual({ box: 1, due: NOW })
    expect(isKnown(p, 'flag-name:K')).toBe(false)
  })

  it('counts seen, known and due cards', () => {
    let p: Progress = {}
    for (let i = 0; i < 3; i++) p = grade(p, 'flag-name:A', true, NOW)
    p = grade(p, 'flag-name:B', false, NOW)
    expect(deckStats(DECK_BY_ID['flag-name'], p, NOW)).toEqual({ total: 40, seen: 2, known: 1, due: 1 })
  })
})

describe('sessions', () => {
  it('starts a beginner on a few new flags', () => {
    const session = buildSession(DECKS.map((d) => d.id), {}, NOW, { random: seeded() })
    expect(session).toHaveLength(5)
    expect(session.every((c) => c.deck === 'flag-name')).toBe(true)
    expect(session.map((c) => c.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('puts due cards first and follows up flags already met', () => {
    let p: Progress = {}
    for (const id of ['A', 'B', 'C']) p = grade(p, `flag-name:${id}`, false, NOW)
    const session = buildSession(DECKS.map((d) => d.id), p, NOW, { random: seeded() })
    const keys = session.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['flag-name:A', 'flag-name:B', 'flag-name:C']))
    // New cards revisit A, B and C the other way round before new flags are added.
    const fresh = session.filter((c) => !p[c.key])
    expect(fresh).toHaveLength(5)
    expect(fresh.every((c) => ['A', 'B', 'C'].includes(c.id))).toBe(true)
  })

  it('holds signals and hoists back until the alphabet has been met', () => {
    let p: Progress = {}
    for (const f of FLAGS) {
      for (const deck of ['flag-name', 'name-flag', 'flag-meaning']) p = grade(p, `${deck}:${f.id}`, true, NOW)
    }
    const session = buildSession(DECKS.map((d) => d.id), p, NOW, { random: seeded() })
    expect(session.some((c) => c.deck === 'signals')).toBe(true)
  })

  it('reviews early when nothing is due or new', () => {
    let p: Progress = {}
    for (const card of DECK_BY_ID.hoists.cards) p = grade(p, card.key, true, NOW)
    const session = buildSession(['hoists'], p, NOW, { random: seeded() })
    expect(session).toHaveLength(10)
  })

  it('never repeats a card within a session', () => {
    let p: Progress = {}
    for (const f of FLAGS.slice(0, 12)) p = grade(p, `flag-name:${f.id}`, false, NOW)
    const session = buildSession(['flag-name'], p, NOW, { random: seeded(7) })
    expect(session).toHaveLength(10)
    expect(new Set(session.map((c) => c.key)).size).toBe(10)
  })
})

describe('questions', () => {
  it('offer four distinct choices that include the answer', () => {
    const random = seeded(3)
    for (const deck of DECKS) {
      for (const card of deck.cards) {
        const q = makeQuestion(card, random)
        if (q.kind !== 'choice') continue
        expect(q.options, card.key).toHaveLength(4)
        expect(new Set(q.options.map((o) => o.id)).size).toBe(4)
        expect(q.options.some((o) => o.id === q.answer)).toBe(true)
        for (const o of q.options) expect(o.label ?? o.flag, card.key).toBeTruthy()
      }
    }
  })

  it('show hoists that spell the expected group', () => {
    for (const card of DECK_BY_ID.hoists.cards) {
      const q = makeQuestion(card)
      expect(q.kind).toBe('typed')
      expect(resolveHoist(q.flags!)).toEqual({ text: card.id, errors: [] })
    }
  })

  it('accept typed answers regardless of case and spacing', () => {
    expect(isTypedCorrect(' ae 1 ', 'AE1')).toBe(true)
    expect(isTypedCorrect('s12.5', 'S12.5')).toBe(true)
    expect(isTypedCorrect('AE2', 'AE1')).toBe(false)
  })
})
