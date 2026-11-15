import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, Map as LeafletMap } from 'leaflet'
import { formatPosition, positionGroups, type Position } from '../lib/position'

interface Props {
  open: boolean
  onClose: () => void
  /** Called with the latitude and longitude groups, e.g. ["L2537N", "G4015W"]. */
  onAdd: (groups: [string, string]) => void
}

type Leaflet = typeof import('leaflet')

const LOCATION_ERRORS: Record<number, string> = {
  1: 'Location access was denied. Allow it in your browser settings, or tap the map instead.',
  2: 'Your location is not available right now. Tap the map to choose a point instead.',
  3: 'Finding your location took too long. Try again, or tap the map instead.',
}

/** A sheet for picking a position: from the device's location, or by tapping a map. */
export function PositionSheet({ open, onClose, onAdd }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const leaflet = useRef<{ L: Leaflet; map: LeafletMap; marker?: CircleMarker } | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // Open the dialog and build the map. The map code and coastline load only when needed.
  useEffect(() => {
    if (!open) return
    const el = dialog.current
    if (el && !el.open) el.showModal()
    let cancelled = false
    let map: LeafletMap | undefined

    void (async () => {
      try {
        const [{ default: L }, topo, land] = await Promise.all([
          import('leaflet'),
          import('topojson-client'),
          import('world-atlas/land-50m.json'),
          import('leaflet/dist/leaflet.css'),
        ])
        if (cancelled || !mapEl.current) return
        map = L.map(mapEl.current, { center: [25, 0], zoom: 1, minZoom: 1, worldCopyJump: true })
        map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
        // A bundled coastline sits under the online tiles, so the map still works at sea.
        map.createPane('land').style.zIndex = '150'
        const world = land.default as unknown as Parameters<typeof topo.feature>[0]
        L.geoJSON(topo.feature(world, world.objects.land), {
          pane: 'land',
          interactive: false,
          style: { stroke: true, weight: 1, className: 'map-land' },
        }).addTo(map)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map)
        map.on('click', (e) => setPosition({ lat: e.latlng.lat, lon: e.latlng.wrap().lng }))
        leaflet.current = { L, map }
        map.invalidateSize()
      } catch {
        if (!cancelled) setProblem('The map could not be loaded. You can still use your current location.')
      }
    })()

    return () => {
      cancelled = true
      map?.remove()
      leaflet.current = null
    }
  }, [open])

  // Keep the marker on the chosen position.
  useEffect(() => {
    const ctx = leaflet.current
    if (!ctx || !position) return
    const at: [number, number] = [position.lat, position.lon]
    if (ctx.marker) ctx.marker.setLatLng(at)
    else ctx.marker = ctx.L.circleMarker(at, { radius: 9, weight: 3, className: 'map-marker' }).addTo(ctx.map)
  }, [position])

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setProblem('This device does not share its location. Tap the map to choose a point instead.')
      return
    }
    setLocating(true)
    setProblem(null)
    navigator.geolocation.getCurrentPosition(
      (found) => {
        const here = { lat: found.coords.latitude, lon: found.coords.longitude }
        setLocating(false)
        setPosition(here)
        leaflet.current?.map.setView([here.lat, here.lon], 10)
      },
      (error) => {
        setLocating(false)
        setProblem(LOCATION_ERRORS[error.code] ?? LOCATION_ERRORS[2])
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const close = () => dialog.current?.close()
  const handleClose = () => {
    setPosition(null)
    setProblem(null)
    setLocating(false)
    onClose()
  }

  if (!open) return null
  const groups = position ? positionGroups(position) : null
  return (
    <dialog
      ref={dialog}
      className="sheet position-sheet"
      aria-labelledby="position-title"
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      <header className="sheet-head">
        <div>
          <h2 id="position-title">Add a position</h2>
          <p>Use where you are now, or tap the map to choose a point.</p>
        </div>
        <button type="button" onClick={close}>
          Close
        </button>
      </header>
      <div className="sheet-body">
        <button type="button" className="locate" onClick={useCurrentLocation} disabled={locating}>
          {locating ? 'Finding your location…' : 'Use my current location'}
        </button>
        {problem && <p className="reading-error">{problem}</p>}
        <div className="map" ref={mapEl} role="application" aria-label="Map. Tap to choose a position." />
        <div className="position-result" aria-live="polite">
          {position && groups ? (
            <>
              <strong>{formatPosition(position)}</strong>
              <span className="group">
                {groups[0]} {groups[1]}
              </span>
            </>
          ) : (
            <span className="muted">No position chosen yet.</span>
          )}
        </div>
        <button
          type="button"
          className="primary"
          disabled={!groups}
          onClick={() => {
            if (groups) onAdd(groups)
            close()
          }}
        >
          Add to message
        </button>
      </div>
    </dialog>
  )
}
