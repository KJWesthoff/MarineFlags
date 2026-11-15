import { useCallback, useEffect, useState } from 'react'
import { TableSheet, type Transfer } from './components/TableSheet'
import { FLAG_BY_ID, type FlagId } from './data/flags'
import { encodeGroup, resolveHoist, type TableRef } from './lib/signals'
import { useStored } from './lib/useStored'
import { Compose } from './screens/Compose'
import { Reference } from './screens/Reference'

type Tab = 'compose' | 'reference'

export interface Message {
  hoists: FlagId[][]
  active: number
}

const EMPTY: Message = { hoists: [[]], active: 0 }

function reviveMessage(raw: unknown): Message | undefined {
  const m = raw as Message
  if (!m || !Array.isArray(m.hoists) || m.hoists.length === 0) return undefined
  const hoists = m.hoists.map((h) => (Array.isArray(h) ? h.filter((id) => id in FLAG_BY_ID) : []))
  return { hoists, active: Math.min(Math.max(0, Number(m.active) || 0), hoists.length - 1) }
}

export default function App() {
  const [tab, setTab] = useStored<Tab>('tab', 'compose', (r) => (r === 'reference' ? 'reference' : 'compose'))
  const [message, setMessage] = useStored<Message>('message', EMPTY, reviveMessage)
  const [table, setTable] = useState<TableRef | null>(null)
  /** A short confirmation shown after something is sent to the hoist from Reference. */
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  /** Send a group to the active hoist: in place of what is there, or added below it. */
  const transfer = useCallback(
    ({ group, label, replace, flag }: Transfer) => {
      setMessage((m) => {
        const hoists = m.hoists.slice()
        if (flag) hoists[m.active] = [...hoists[m.active], flag]
        else if (replace) hoists[m.active] = encodeGroup(group).flags
        // Re-encode the whole hoist so substitutes come out right for the longer group.
        else hoists[m.active] = encodeGroup(resolveHoist(hoists[m.active]).text.replaceAll('?', '') + group).flags
        return { ...m, hoists }
      })
      const hoist = `hoist ${message.active + 1}`
      setNotice(replace ? `Put ${label} on ${hoist}` : `Added ${label} to ${hoist}`)
    },
    [setMessage, message.active],
  )

  /** Put a code-book signal on the active hoist and show it. */
  const showAsFlags = useCallback(
    (group: string) => {
      setMessage((m) => {
        const hoists = m.hoists.slice()
        hoists[m.active] = encodeGroup(group).flags
        return { ...m, hoists }
      })
      setTab('compose')
    },
    [setMessage, setTab],
  )

  return (
    <div className="app">
      <main className="screen">
        {tab === 'compose' ? (
          <Compose message={message} setMessage={setMessage} onOpenTable={setTable} />
        ) : (
          <Reference onShowAsFlags={showAsFlags} onOpenTable={setTable} onTransfer={transfer} />
        )}
      </main>
      <nav className="tabbar" aria-label="Sections">
        <button type="button" aria-current={tab === 'compose' ? 'page' : undefined} onClick={() => setTab('compose')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3v18" />
            <path d="M5 4h12l-3 4 3 4H5" />
          </svg>
          Compose
        </button>
        <button type="button" aria-current={tab === 'reference' ? 'page' : undefined} onClick={() => setTab('reference')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5c3-1 5-1 8 1 3-2 5-2 8-1v14c-3-1-5-1-8 1-3-2-5-2-8-1z" />
            <path d="M12 6v14" />
          </svg>
          Reference
        </button>
      </nav>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <TableSheet open={table} onClose={() => setTable(null)} onTransfer={transfer} />
    </div>
  )
}
