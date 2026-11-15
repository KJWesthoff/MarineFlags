import { useId, useMemo } from 'react'
import { FLAG_BY_ID, FLAG_H, type FlagId } from '../data/flags'

/** One signal flag as inline SVG. Size it with CSS (set a height or a width). */
export function Flag({ id, className }: { id: FlagId; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const flag = FLAG_BY_ID[id]
  // Clip-path ids must be unique per instance on the page.
  const html = useMemo(() => flag.svg.replaceAll('ics-clip-', `f${uid}-`), [flag, uid])
  return (
    <svg
      className={className ? `flag ${className}` : 'flag'}
      viewBox={`-1 -1 ${flag.width + 2} ${FLAG_H + 2}`}
      role="img"
      aria-label={flag.name}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
