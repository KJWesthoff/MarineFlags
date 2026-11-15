import { useEffect, useState } from 'react'

/** useState that survives reloads. `revive` validates whatever was stored. */
export function useStored<T>(key: string, initial: T, revive: (raw: unknown) => T | undefined = (r) => r as T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return revive(JSON.parse(raw)) ?? initial
    } catch {
      // Storage unavailable or corrupt: start fresh.
    }
    return initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Nothing to do: the app works without persistence.
    }
  }, [key, value])

  return [value, setValue] as const
}
