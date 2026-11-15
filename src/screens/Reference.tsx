import { useMemo, useState } from 'react'
import { Flag } from '../components/Flag'
import { TableLinks } from '../components/TableSheet'
import { FLAGS } from '../data/flags'
import { CODEBOOK, encodeGroup, searchCodebook, tablesFor, type CodebookEntry, type TableRef } from '../lib/signals'
import { useStored } from '../lib/useStored'

type View = 'flags' | 'signals'

const SECTIONS = [...new Set(CODEBOOK.map((e) => e.section ?? 'Other'))]

interface Props {
  onShowAsFlags: (group: string) => void
  onOpenTable: (ref: TableRef) => void
}

export function Reference({ onShowAsFlags, onOpenTable }: Props) {
  const [view, setView] = useStored<View>('reference-view', 'flags', (r) => (r === 'signals' ? 'signals' : 'flags'))
  const [query, setQuery] = useState('')
  const [section, setSection] = useStored('reference-section', SECTIONS[0], (r) =>
    SECTIONS.includes(r as string) ? (r as string) : undefined,
  )

  const q = query.trim().toLowerCase()
  const flags = useMemo(
    () =>
      q
        ? FLAGS.filter(
            (f) => f.id.toLowerCase() === q || f.name.toLowerCase().includes(q) || f.meaning?.toLowerCase().includes(q),
          )
        : FLAGS,
    [q],
  )
  const signals = useMemo(
    () => (q ? searchCodebook(query, 120) : CODEBOOK.filter((e) => (e.section ?? 'Other') === section)),
    [q, query, section],
  )

  return (
    <div className="reference">
      <header className="reference-head">
        <div className="segmented" role="tablist" aria-label="What to look up">
          <button type="button" role="tab" aria-selected={view === 'flags'} onClick={() => setView('flags')}>
            Flags
          </button>
          <button type="button" role="tab" aria-selected={view === 'signals'} onClick={() => setView('signals')}>
            Code book
          </button>
        </div>
        <input
          className="search"
          type="search"
          placeholder={view === 'flags' ? 'Search flags: K, Kilo, pilot' : 'Search signals: NC, tow, doctor'}
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {view === 'signals' && !q && (
          <div className="chips" role="group" aria-label="Section">
            {SECTIONS.map((s) => (
              <button type="button" key={s} aria-pressed={s === section} onClick={() => setSection(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      {view === 'flags' ? (
        flags.length ? (
          <ul className="flag-list">
            {flags.map((f) => (
              <li key={f.id}>
                <Flag id={f.id} />
                <div>
                  <h2>
                    {f.kind === 'letter' || f.kind === 'numeral' ? <strong className="group">{f.id}</strong> : null}
                    {f.name}
                    {f.pronunciation && <span className="say">{f.pronunciation}</span>}
                  </h2>
                  <p>{f.meaning ?? (f.kind === 'numeral' ? 'Numeral pennant.' : 'No meaning when hoisted alone.')}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-results">No flag matches “{query}”. Try a letter or a code word such as Kilo.</p>
        )
      ) : signals.length ? (
        <ul className="signal-list">
          {signals.map((e) => (
            <SignalRow key={e.code} entry={e} onOpen={onShowAsFlags} onOpenTable={onOpenTable} />
          ))}
        </ul>
      ) : (
        <p className="no-results">No signal matches “{query}”. Try a code such as NC, or a single word.</p>
      )}
    </div>
  )
}

function SignalRow(props: { entry: CodebookEntry; onOpen: (group: string) => void; onOpenTable: (ref: TableRef) => void }) {
  const { entry, onOpen } = props
  const group = entry.code.replace(' ', '')
  const flags = useMemo(() => encodeGroup(group).flags, [group])
  const tables = useMemo(() => tablesFor(entry).map((id): TableRef => ({ id })), [entry])
  return (
    <li>
      <button type="button" onClick={() => onOpen(group)} aria-label={`${entry.code}: ${entry.meaning} Show as flags`}>
        <span className="signal-flags" aria-hidden="true">
          {flags.map((id, i) => (
            <Flag key={i} id={id} />
          ))}
        </span>
        <span className="signal-text">
          <strong className="group">{entry.code}</strong>
          <span>{entry.meaning}</span>
        </span>
      </button>
      <TableLinks tables={tables} onOpen={props.onOpenTable} />
    </li>
  )
}
