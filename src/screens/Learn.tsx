import { useMemo, useState, type FormEvent } from 'react'
import { Flag } from '../components/Flag'
import { FLAGS, FLAG_BY_ID, type FlagId } from '../data/flags'
import {
  DECKS, buildSession, deckStats, grade, isTypedCorrect, makeQuestion,
  type DeckId, type Progress, type Question,
} from '../lib/learn'
import { useStored } from '../lib/useStored'

const ALL_DECKS = DECKS.map((d) => d.id)

function reviveProgress(raw: unknown): Progress | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Progress = {}
  for (const [key, value] of Object.entries(raw as Record<string, { box?: unknown; due?: unknown }>)) {
    if (value && typeof value.box === 'number' && typeof value.due === 'number') out[key] = { box: value.box, due: value.due }
  }
  return out
}

interface Session {
  title: string
  decks: DeckId[]
  questions: Question[]
  index: number
  /** The answer given to the current question, once given. */
  given: string | null
  /** How each distinct card went on its first try. */
  firstTries: { question: Question; correct: boolean }[]
  /** Cards already asked a second time, so a miss is repeated only once. */
  repeated: string[]
  /** Flags this session asks about for the first time; they are shown before the questions start. */
  introduce: FlagId[]
}

export function Learn() {
  const [progress, setProgress] = useStored<Progress>('learn-progress', {}, reviveProgress)
  const [session, setSession] = useState<Session | null>(null)

  const start = (title: string, decks: DeckId[]) => {
    const picked = buildSession(decks, progress, Date.now())
    const questions = picked.map((card) => makeQuestion(card))
    const introduce = picked
      .filter((card) => card.deck === 'flag-name' && !progress[card.key])
      .map((card) => card.id as FlagId)
    if (questions.length) {
      setSession({ title, decks, questions, index: 0, given: null, firstTries: [], repeated: [], introduce })
    }
  }

  if (!session) return <Home progress={progress} onStart={start} onReset={() => setProgress({})} />

  if (session.introduce.length > 0) {
    return (
      <div className="learn">
        <div className="learn-body">
          <h1>{session.introduce.length === 1 ? 'One new flag' : `${session.introduce.length} new flags`}</h1>
          <p className="muted">Have a look before the questions start.</p>
          <ul className="flag-list intro-list">
            {session.introduce.map((id) => {
              const f = FLAG_BY_ID[id]
              return (
                <li key={id}>
                  <Flag id={id} />
                  <div>
                    <h2>
                      {f.kind === 'letter' || f.kind === 'numeral' ? <strong className="group">{f.id}</strong> : null}
                      {f.name}
                    </h2>
                    {f.meaning && <p>{f.meaning}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="learn-actions">
            <button type="button" className="primary" onClick={() => setSession({ ...session, introduce: [] })}>
              Start the questions
            </button>
            <button type="button" onClick={() => setSession(null)}>
              Not now
            </button>
          </div>
        </div>
      </div>
    )
  }

  const finished = session.index >= session.questions.length
  if (finished) {
    return (
      <Summary
        session={session}
        onAgain={() => start(session.title, session.decks)}
        onDone={() => setSession(null)}
      />
    )
  }

  const question = session.questions[session.index]
  const isCorrect = (given: string) =>
    question.kind === 'typed' ? isTypedCorrect(given, question.answer) : given === question.answer

  const answer = (given: string) => {
    if (session.given !== null) return
    const correct = isCorrect(given)
    const key = question.card.key
    setProgress((p) => grade(p, key, correct, Date.now()))
    setSession((s) => {
      if (!s) return s
      const firstTry = !s.firstTries.some((t) => t.question.card.key === key)
      const repeat = !correct && !s.repeated.includes(key)
      return {
        ...s,
        given,
        firstTries: firstTry ? [...s.firstTries, { question, correct }] : s.firstTries,
        // A missed card comes round once more at the end, with fresh choices.
        questions: repeat ? [...s.questions, makeQuestion(question.card)] : s.questions,
        repeated: repeat ? [...s.repeated, key] : s.repeated,
      }
    })
  }
  const next = () => setSession((s) => (s ? { ...s, index: s.index + 1, given: null } : s))

  return (
    <div className="learn quiz">
      <header className="quiz-head">
        <div>
          <p className="quiz-count">
            Question {session.index + 1} of {session.questions.length}
          </p>
          <progress value={session.index} max={session.questions.length} aria-label="Progress through this session" />
        </div>
        <button type="button" onClick={() => setSession(null)}>
          End
        </button>
      </header>

      <div className="quiz-body">
        <div className="quiz-prompt">
          {question.flags && (
            <div className="quiz-hoist" data-single={question.flags.length === 1}>
              {question.flags.map((id, i) => (
                <Flag key={i} id={id} />
              ))}
            </div>
          )}
          {question.text && <p className="quiz-text">{question.text}</p>}
        </div>
        <h1 className="quiz-question">{question.question}</h1>

        {question.kind === 'choice' ? (
          <div className="quiz-options" data-flags={question.options[0].flag !== undefined}>
            {question.options.map((option) => {
              const state =
                session.given === null
                  ? undefined
                  : option.id === question.answer
                    ? 'right'
                    : option.id === session.given
                      ? 'wrong'
                      : 'other'
              return (
                <button
                  type="button"
                  key={option.id}
                  data-state={state}
                  disabled={session.given !== null}
                  onClick={() => answer(option.id)}
                  aria-label={option.flag ? `Option ${question.options.indexOf(option) + 1}` : undefined}
                >
                  {option.flag ? <Flag id={option.flag} /> : option.label}
                </button>
              )
            })}
          </div>
        ) : (
          <TypedAnswer key={session.index} disabled={session.given !== null} onSubmit={answer} />
        )}

        {session.given !== null && (
          <div className="quiz-feedback" data-correct={isCorrect(session.given)} role="status">
            <strong>{isCorrect(session.given) ? 'Correct' : 'Not quite'}</strong>
            <span>{question.explanation}</span>
            <button type="button" className="primary" onClick={next} autoFocus>
              {session.index + 1 < session.questions.length ? 'Next question' : 'See results'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TypedAnswer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) onSubmit(text)
  }
  return (
    <form className="quiz-typed" onSubmit={submit}>
      <input
        className="type-in"
        type="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Type the letters and numbers"
        aria-label="Your answer"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value.toUpperCase())}
      />
      <button type="submit" className="primary" disabled={disabled || !text.trim()}>
        Check
      </button>
    </form>
  )
}

function Summary({ session, onAgain, onDone }: { session: Session; onAgain: () => void; onDone: () => void }) {
  const right = session.firstTries.filter((t) => t.correct).length
  const missed = session.firstTries.filter((t) => !t.correct)
  return (
    <div className="learn">
      <div className="learn-body">
        <h1>
          {right} of {session.firstTries.length} right first time
        </h1>
        <p className="muted">
          {missed.length === 0
            ? 'Every card moves up and comes back later.'
            : 'The ones you missed come back in your next session; the rest move up and return later.'}
        </p>
        {missed.length > 0 && (
          <>
            <h2>To look at again</h2>
            <ul className="missed">
              {missed.map(({ question }) => (
                <li key={question.card.key}>
                  {question.flags && (
                    <span className="missed-flags">
                      {question.flags.map((id, i) => (
                        <Flag key={i} id={id} />
                      ))}
                    </span>
                  )}
                  <span>{question.explanation}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="learn-actions">
          <button type="button" className="primary" onClick={onAgain}>
            Practise again
          </button>
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

interface HomeProps {
  progress: Progress
  onStart: (title: string, decks: DeckId[]) => void
  onReset: () => void
}

function Home({ progress, onStart, onReset }: HomeProps) {
  const [confirmingReset, setConfirmingReset] = useState(false)
  // The moment this screen opened; "due" is judged against it.
  const [now] = useState(() => Date.now())
  const stats = useMemo(() => DECKS.map((deck) => ({ deck, ...deckStats(deck, progress, now) })), [progress, now])
  const flags = stats[0]
  const due = stats.reduce((n, s) => n + s.due, 0)
  const started = Object.keys(progress).length > 0

  return (
    <div className="learn">
      <div className="learn-body">
        <h1>Learn the flags</h1>
        <p className="muted">
          {started
            ? `You know ${flags.known} of ${flags.total} flags. ${due === 0 ? 'Nothing is due right now.' : `${due} ${due === 1 ? 'card is' : 'cards are'} due for review.`}`
            : 'Short sessions of about ten questions. Flags you find hard come back sooner; ones you know come back later.'}
        </p>
        <button type="button" className="primary learn-start" onClick={() => onStart('Practice', ALL_DECKS)}>
          {started ? 'Practise' : 'Start learning'}
        </button>

        <h2>Your flags</h2>
        <ul className="mastery" aria-label="How well you know each flag">
          {FLAGS.map((f) => {
            const box = progress[`flag-name:${f.id}`]?.box ?? 0
            return (
              <li key={f.id} data-box={box} title={`${f.name}: ${box === 0 ? 'not started' : `level ${box} of 5`}`}>
                <Flag id={f.id as FlagId} />
                <span className="mastery-bar" aria-hidden="true">
                  <span style={{ width: `${box * 20}%` }} />
                </span>
              </li>
            )
          })}
        </ul>

        <h2>Practise one thing</h2>
        <ul className="deck-list">
          {stats.map(({ deck, total, known, due: deckDue }) => (
            <li key={deck.id}>
              <button type="button" onClick={() => onStart(deck.title, [deck.id])}>
                <strong>{deck.title}</strong>
                <span>{deck.description}</span>
                <span>
                  {known} of {total} known{deckDue > 0 ? `, ${deckDue} due` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {started &&
          (confirmingReset ? (
            <div className="learn-actions">
              <span>Forget all progress?</span>
              <button
                type="button"
                onClick={() => {
                  onReset()
                  setConfirmingReset(false)
                }}
              >
                Reset progress
              </button>
              <button type="button" className="quiet" onClick={() => setConfirmingReset(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="quiet" onClick={() => setConfirmingReset(true)}>
              Reset progress
            </button>
          ))}
      </div>
    </div>
  )
}
