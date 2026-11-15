/** Latitude and longitude as the code signals them: L2537N, G4015W, G13925E. */

export interface Position {
  /** Degrees, north positive. */
  lat: number
  /** Degrees, east positive. */
  lon: number
}

/** Whole degrees and minutes, rounded to the nearest minute. */
function degreesMinutes(value: number, maxDegrees: number): [number, number] {
  const abs = Math.min(Math.abs(value), maxDegrees)
  let deg = Math.floor(abs)
  let min = Math.round((abs - deg) * 60)
  if (min === 60) {
    deg += 1
    min = 0
  }
  return deg >= maxDegrees ? [maxDegrees, 0] : [deg, min]
}

const wrapLongitude = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180
const two = (n: number) => String(n).padStart(2, '0')

/** The two groups for a position: latitude then longitude. */
export function positionGroups(p: Position): [string, string] {
  const lon = wrapLongitude(p.lon)
  const [latDeg, latMin] = degreesMinutes(p.lat, 90)
  const [lonDeg, lonMin] = degreesMinutes(lon, 180)
  // Longitude takes four figures, or five where the degrees need three.
  return [
    `L${two(latDeg)}${two(latMin)}${p.lat < 0 ? 'S' : 'N'}`,
    `G${two(lonDeg)}${two(lonMin)}${lon < 0 ? 'W' : 'E'}`,
  ]
}

export function formatPosition(p: Position): string {
  const lon = wrapLongitude(p.lon)
  const [latDeg, latMin] = degreesMinutes(p.lat, 90)
  const [lonDeg, lonMin] = degreesMinutes(lon, 180)
  return `${latDeg}° ${two(latMin)}′ ${p.lat < 0 ? 'S' : 'N'}, ${lonDeg}° ${two(lonMin)}′ ${lon < 0 ? 'W' : 'E'}`
}
