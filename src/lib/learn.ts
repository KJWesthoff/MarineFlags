/**
 * Training: what there is to learn, when each item is due, and how questions are built.
 * Pure logic, no UI. Scheduling is a Leitner system: a right answer moves a card up a box
 * and further into the future, a wrong answer sends it back to the first box.
 */
import { FLAGS, FLAG_BY_ID, type FlagId } from '../data/flags'
import { encodeGroup, lookup } from './signals'

export type DeckId = 'flag-name' | 'name-flag' | 'flag-meaning' | 'signals' | 'hoists'

export interface Card {
  /** Unique across decks: "flag-name:K". */
  key: string
  deck: DeckId
  /** A flag id, a code book code, or a group to read. */
  id: string
}

export interface Deck {
  id: DeckId
  title: string
  description: string
  cards: Card[]
}

/** Two-letter signals worth knowing by sight. */
const COMMON_SIGNALS = [
  'NC', 'CB', 'AC', 'AN', 'BR', 'CJ', 'CK', 'CP', 'CV', 'DV', 'DX', 'ED', 'FA', 'GW', 'IT', 'JG', 'JH',
  'JL', 'JW', 'KF', 'KQ', 'NE', 'NG', 'PP', 'SC', 'SQ', 'UM', 'UW', 'UY', 'ZL', 'CS', 'RY', 'QU', 'YG',
]

/** Groups that exercise substitutes, numerals and the decimal point. */
const HOIST_GROUPS = [
  'NC', 'AE1', 'VV', 'SOS', 'MAA', 'EE', 'K2', 'C240', 'T1430', 'L2330', '1100', 'D1504', 'S12.5', 'OXXO',
  'G13925E', 'ZZ1', 'R25', 'A090', 'T1100', 'ABBA',
]

const cards = (deck: DeckId, ids: string[]): Card[] => ids.map((id) => ({ key: `${deck}:${id}`, deck, id }))
const ALL_FLAGS = FLAGS.map((f) => f.id as string)
const LETTERS_WITH_MEANING = FLAGS.filter((f) => f.kind === 'letter' && f.meaning).map((f) => f.id as string)

export const DECKS: Deck[] = [
  {
    id: 'flag-name',
    title: 'Name the flag',
    description: 'See a flag, pick its letter or name.',
    cards: cards('flag-name', ALL_FLAGS),
  },
  {
    id: 'name-flag',
    title: 'Find the flag',
    description: 'See a name, pick the right flag.',
    cards: cards('name-flag', ALL_FLAGS),
  },
  {
    id: 'flag-meaning',
    title: 'Single-flag signals',
    description: 'See a flag, pick what it signals when flown alone.',
    cards: cards('flag-meaning', LETTERS_WITH_MEANING),
  },
  {
    id: 'signals',
    title: 'Common signals',
    description: 'See a two-flag signal, pick its meaning.',
    cards: cards('signals', COMMON_SIGNALS),
  },
  {
    id: 'hoists',
    title: 'Read a hoist',
    description: 'Spell out hoists that use substitutes, numerals and the decimal point.',
    cards: cards('hoists', HOIST_GROUPS),
  },
]

export const DECK_BY_ID = Object.fromEntries(DECKS.map((d) => [d.id, d])) as Record<DeckId, Deck>

// ---------- Scheduling ----------

export interface CardState {
  /** 1 to 5; higher boxes are reviewed less often. */
  box: number
  /** When the card is next due, in milliseconds since the epoch. */
  due: number
}

export type Progress = Record<string, CardState>

const DAY = 24 * 60 * 60 * 1000
/** Days until the next review, by box. A card in box 3 or above counts as known. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35]
export const TOP_BOX = INTERVAL_DAYS.length - 1
export const KNOWN_BOX = 3

/** Record an answer and return the new progress. */
export function grade(progress: Progress, key: string, correct: boolean, now: number): Progress {
  const box = correct ? Math.min(TOP_BOX, (progress[key]?.box ?? 0) + 1) : 1
  return { ...progress, [key]: { box, due: correct ? now + INTERVAL_DAYS[box] * DAY : now } }
}

export const isKnown = (progress: Progress, key: string) => (progress[key]?.box ?? 0) >= KNOWN_BOX

export interface DeckStats {
  total: number
  seen: number
  known: number
  due: number
}

export function deckStats(deck: Deck, progress: Progress, now: number): DeckStats {
  let seen = 0
  let known = 0
  let due = 0
  for (const card of deck.cards) {
    const state = progress[card.key]
    if (!state) continue
    seen++
    if (state.box >= KNOWN_BOX) known++
    if (state.due <= now) due++
  }
  return { total: deck.cards.length, seen, known, due }
}

/**
 * New cards in teaching order for mixed practice. A flag is named before it is asked the other
 * way round or for its meaning, and signals and hoists wait until the alphabet has been met.
 */
function freshInOrder(decks: Deck[], progress: Progress, gated: boolean): Card[] {
  const unseen = (deck: Deck) => deck.cards.filter((c) => !progress[c.key])
  if (!gated) return decks.flatMap(unseen)
  const met = (flag: string) => Boolean(progress[`flag-name:${flag}`])
  const lettersMet = FLAGS.filter((f) => f.kind === 'letter').every((f) => met(f.id))
  const followUps = decks
    .filter((d) => d.id === 'name-flag' || d.id === 'flag-meaning')
    .flatMap((d) => unseen(d).filter((c) => met(c.id)))
  const newFlags = decks.filter((d) => d.id === 'flag-name').flatMap(unseen)
  const later = lettersMet ? decks.filter((d) => d.id === 'signals' || d.id === 'hoists').flatMap(unseen) : []
  return [...followUps, ...newFlags, ...later]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface SessionOptions {
  size?: number
  /** Most new cards to introduce in one session. */
  maxNew?: number
  random?: () => number
}

/** Pick the cards for one practice session: what is due first, then a few new ones. */
export function buildSession(deckIds: DeckId[], progress: Progress, now: number, options: SessionOptions = {}): Card[] {
  const { size = 10, maxNew = 5, random = Math.random } = options
  const decks = DECKS.filter((d) => deckIds.includes(d.id))
  const seen = decks.flatMap((d) => d.cards).filter((c) => progress[c.key])
  const byDue = seen.slice().sort((a, b) => progress[a.key].due - progress[b.key].due)
  const due = byDue.filter((c) => progress[c.key].due <= now)
  const fresh = freshInOrder(decks, progress, deckIds.length > 1)

  const newCount = Math.min(maxNew, fresh.length, Math.max(2, size - due.length))
  const picked = [...due.slice(0, size - newCount), ...fresh.slice(0, newCount)]
  // Nothing more due or new: review early, soonest first.
  const early = byDue.filter((c) => progress[c.key].due > now)
  picked.push(...early.slice(0, size - picked.length))
  return shuffle(picked, random)
}

// ---------- Questions ----------

export interface Option {
  id: string
  /** Text to show; absent when the option is a flag. */
  label?: string
  flag?: FlagId
}

interface QuestionBase {
  card: Card
  /** What is being asked, in words. */
  question: string
  /** Flags shown as the prompt, top to bottom. */
  flags?: FlagId[]
  /** Text shown as the prompt. */
  text?: string
  /** Shown once answered: the full answer in words. */
  explanation: string
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice'
  options: Option[]
  answer: string
}

export interface TypedQuestion extends QuestionBase {
  kind: 'typed'
  answer: string
}

export type Question = ChoiceQuestion | TypedQuestion

const flagLabel = (id: FlagId) => {
  const f = FLAG_BY_ID[id]
  return f.kind === 'letter' || f.kind === 'numeral' ? `${f.id}  ${f.name}` : f.name
}

/** The right answer plus three wrong ones from the same pool, shuffled. */
function choices(answer: string, pool: string[], random: () => number): string[] {
  const wrong = shuffle(pool.filter((id) => id !== answer), random).slice(0, 3)
  return shuffle([answer, ...wrong], random)
}

/** Other flags of the same kind make the most instructive wrong answers. */
function similarFlags(id: FlagId): string[] {
  const kind = FLAG_BY_ID[id].kind
  const same = FLAGS.filter((f) => f.kind === kind).map((f) => f.id as string)
  return same.length >= 4 ? same : FLAGS.filter((f) => f.kind !== 'letter').map((f) => f.id as string)
}

export function makeQuestion(card: Card, random: () => number = Math.random): Question {
  switch (card.deck) {
    case 'flag-name': {
      const id = card.id as FlagId
      return {
        kind: 'choice', card, question: 'Which flag is this?', flags: [id],
        options: choices(id, similarFlags(id), random).map((o) => ({ id: o, label: flagLabel(o as FlagId) })),
        answer: id, explanation: flagLabel(id),
      }
    }
    case 'name-flag': {
      const id = card.id as FlagId
      return {
        kind: 'choice', card, question: 'Which flag is it?', text: flagLabel(id),
        options: choices(id, similarFlags(id), random).map((o) => ({ id: o, flag: o as FlagId })),
        answer: id, explanation: flagLabel(id),
      }
    }
    case 'flag-meaning': {
      const id = card.id as FlagId
      const pool = DECK_BY_ID['flag-meaning'].cards.map((c) => c.id)
      return {
        kind: 'choice', card, question: 'Flown alone, what does it signal?', flags: [id],
        options: choices(id, pool, random).map((o) => ({ id: o, label: FLAG_BY_ID[o as FlagId].meaning })),
        answer: id, explanation: `${flagLabel(id)}: ${FLAG_BY_ID[id].meaning}`,
      }
    }
    case 'signals': {
      const pool = DECK_BY_ID.signals.cards.map((c) => c.id)
      return {
        kind: 'choice', card, question: 'What does this signal mean?', flags: encodeGroup(card.id).flags,
        options: choices(card.id, pool, random).map((o) => ({ id: o, label: lookup(o)?.meaning })),
        answer: card.id, explanation: `${card.id}: ${lookup(card.id)?.meaning}`,
      }
    }
    case 'hoists':
      return {
        kind: 'typed', card, question: 'Spell out this hoist, top to bottom.', flags: encodeGroup(card.id).flags,
        answer: card.id, explanation: card.id,
      }
  }
}

/** Compare a typed answer with the expected group, ignoring case and spacing. */
export const isTypedCorrect = (typed: string, answer: string) =>
  typed.toUpperCase().replace(/[\s,]/g, '') === answer.toUpperCase()
