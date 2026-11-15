/** The 40 flags of the International Code of Signals: artwork, names and single-flag meanings. */

export type FlagKind = 'letter' | 'numeral' | 'substitute' | 'code'

export type LetterId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
export type NumeralId = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type SubstituteId = 'SUB1' | 'SUB2' | 'SUB3'
export type FlagId = LetterId | NumeralId | SubstituteId | 'CODE'

export interface Flag {
  id: FlagId
  kind: FlagKind
  /** Code word: "Alfa", "Unaone", "First substitute" … */
  name: string
  /** Spoken pronunciation from the phonetic tables. */
  pronunciation?: string
  /** Meaning when hoisted alone. */
  meaning?: string
  /** viewBox width; height is always FLAG_H. */
  width: number
  /** Inner SVG markup, drawn in a `0 0 width FLAG_H` viewBox. */
  svg: string
}

export const FLAG_H = 90
const H = FLAG_H
const W = 120 // letter flags
const PW = 180 // pennants

export const COLORS = {
  red: '#d7281f',
  blue: '#0b3d91',
  yellow: '#ffd200',
  black: '#16181d',
  white: '#ffffff',
}
const { red: R, blue: B, yellow: Y, black: K, white: Wh } = COLORS

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
const poly = (points: string, fill: string) => `<polygon points="${points}" fill="${fill}"/>`
const circle = (cx: number, cy: number, r: number, fill: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`

/** Outline shapes. Artwork is clipped to these, then stroked so white flags stay visible. */
const OUTLINES = {
  square: `0,0 ${W},0 ${W},${H} 0,${H}`,
  swallowtail: `0,0 ${W},0 ${W - 32},${H / 2} ${W},${H} 0,${H}`,
  pennant: `0,0 ${PW},${H / 3} ${PW},${(2 * H) / 3} 0,${H}`,
  triangle: `0,0 ${PW},${H / 2 - 4} ${PW},${H / 2 + 4} 0,${H}`,
}
type Outline = keyof typeof OUTLINES

function shaped(outline: Outline, body: string): string {
  const id = `ics-clip-${outline}`
  return (
    `<clipPath id="${id}"><polygon points="${OUTLINES[outline]}"/></clipPath>` +
    `<g clip-path="url(#${id})">${body}</g>` +
    `<polygon points="${OUTLINES[outline]}" fill="none" stroke="#0006" stroke-width="1.5" stroke-linejoin="round"/>`
  )
}

const hStripes = (w: number, colors: string[]) =>
  colors.map((c, i) => rect(0, (i * H) / colors.length, w, H / colors.length + 0.2, c)).join('')
const vStripes = (w: number, colors: string[]) =>
  colors.map((c, i) => rect((i * w) / colors.length, 0, w / colors.length + 0.2, H, c)).join('')
const cross = (w: number, field: string, arms: string, t = 18) =>
  rect(0, 0, w, H, field) + rect(0, (H - t) / 2, w, t, arms) + rect((w - t) / 2, 0, t, H, arms)
const saltire = (field: string, arms: string, t = 12) =>
  rect(0, 0, W, H, field) +
  `<path d="M0,0 L${W},${H} M${W},0 L0,${H}" stroke="${arms}" stroke-width="${t * 1.5}"/>`
const quartered = (w: number, tl: string, tr: string, bl: string, br: string) =>
  rect(0, 0, w / 2, H / 2, tl) + rect(w / 2, 0, w / 2, H / 2, tr) +
  rect(0, H / 2, w / 2, H / 2, bl) + rect(w / 2, H / 2, w / 2, H / 2, br)

function checkered(): string {
  let s = ''
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) s += rect((c * W) / 4, (r * H) / 4, W / 4 + 0.2, H / 4 + 0.2, (r + c) % 2 ? Wh : B)
  return s
}

function diagonalStripes(): string {
  // Ten stripes rising from the lower hoist to the upper fly, yellow first.
  const n = 10
  const span = W + H
  let s = ''
  for (let i = 0; i < n; i++) {
    const a = (i * span) / n
    const b = ((i + 1) * span) / n + 0.3
    s += poly(`${a},0 ${b},0 ${b - H},${H} ${a - H},${H}`, i % 2 ? R : Y)
  }
  return s
}

const LETTER_ART: Record<LetterId, [Outline, string]> = {
  A: ['swallowtail', rect(0, 0, W / 2, H, Wh) + rect(W / 2, 0, W / 2, H, B)],
  B: ['swallowtail', rect(0, 0, W, H, R)],
  C: ['square', hStripes(W, [B, Wh, R, Wh, B])],
  D: ['square', rect(0, 0, W, H, Y) + rect(0, H / 5, W, (3 * H) / 5, B)],
  E: ['square', hStripes(W, [B, R])],
  F: ['square', rect(0, 0, W, H, Wh) + poly(`${W / 2},0 ${W},${H / 2} ${W / 2},${H} 0,${H / 2}`, R)],
  G: ['square', vStripes(W, [Y, B, Y, B, Y, B])],
  H: ['square', vStripes(W, [Wh, R])],
  I: ['square', rect(0, 0, W, H, Y) + circle(W / 2, H / 2, 22, K)],
  J: ['square', hStripes(W, [B, Wh, B])],
  K: ['square', vStripes(W, [Y, B])],
  L: ['square', quartered(W, Y, K, K, Y)],
  M: ['square', saltire(B, Wh)],
  N: ['square', checkered()],
  O: ['square', poly(`0,0 ${W},0 ${W},${H}`, R) + poly(`0,0 0,${H} ${W},${H}`, Y)],
  P: ['square', rect(0, 0, W, H, B) + rect(W / 3, H / 3, W / 3, H / 3, Wh)],
  Q: ['square', rect(0, 0, W, H, Y)],
  R: ['square', cross(W, R, Y)],
  S: ['square', rect(0, 0, W, H, Wh) + rect(W / 3, H / 3, W / 3, H / 3, B)],
  T: ['square', vStripes(W, [R, Wh, B])],
  U: ['square', quartered(W, R, Wh, Wh, R)],
  V: ['square', saltire(Wh, R)],
  W: ['square', rect(0, 0, W, H, B) + rect(W / 6, H / 6, (2 * W) / 3, (2 * H) / 3, Wh) + rect(W / 3, H / 3, W / 3, H / 3, R)],
  X: ['square', cross(W, Wh, B)],
  Y: ['square', diagonalStripes()],
  Z: ['square',
    poly(`0,0 ${W / 2},${H / 2} 0,${H}`, K) + poly(`0,0 ${W},0 ${W / 2},${H / 2}`, Y) +
    poly(`${W},0 ${W},${H} ${W / 2},${H / 2}`, B) + poly(`0,${H} ${W},${H} ${W / 2},${H / 2}`, R)],
}

const NUMERAL_ART: Record<NumeralId, string> = {
  '0': vStripes(PW, [Y, R, Y]),
  '1': rect(0, 0, PW, H, Wh) + circle(50, H / 2, 20, R),
  '2': rect(0, 0, PW, H, B) + circle(50, H / 2, 20, Wh),
  '3': vStripes(PW, [R, Wh, B]),
  '4': rect(0, 0, PW, H, R) + rect(0, H / 2 - 7, PW, 14, Wh) + rect(48, 0, 16, H, Wh),
  '5': vStripes(PW, [Y, B]),
  '6': hStripes(PW, [K, Wh]),
  '7': hStripes(PW, [Y, R]),
  '8': rect(0, 0, PW, H, Wh) + rect(0, H / 2 - 7, PW, 14, R) + rect(48, 0, 16, H, R),
  '9': quartered(PW, Wh, K, R, Y),
}

const SUBSTITUTE_ART: Record<SubstituteId, string> = {
  SUB1: rect(0, 0, PW, H, B) + poly(`0,${H * 0.22} ${PW * 0.72},${H / 2} 0,${H * 0.78}`, Y),
  SUB2: rect(0, 0, PW / 2, H, B) + rect(PW / 2, 0, PW / 2, H, Wh),
  SUB3: rect(0, 0, PW, H, Wh) + rect(0, H / 2 - 12, PW, 24, K),
}

const LETTERS: [LetterId, string, string, string][] = [
  ['A', 'Alfa', 'AL FAH', 'I have a diver down; keep well clear at slow speed.'],
  ['B', 'Bravo', 'BRAH VOH', 'I am taking in, or discharging, or carrying dangerous goods.'],
  ['C', 'Charlie', 'CHAR LEE', 'Yes (affirmative).'],
  ['D', 'Delta', 'DELL TAH', 'Keep clear of me; I am maneuvering with difficulty.'],
  ['E', 'Echo', 'ECK OH', 'I am altering my course to starboard.'],
  ['F', 'Foxtrot', 'FOKS TROT', 'I am disabled; communicate with me.'],
  ['G', 'Golf', 'GOLF', 'I require a pilot. (Fishing vessels close together on the fishing grounds: I am hauling nets.)'],
  ['H', 'Hotel', 'HOH TELL', 'I have a pilot on board.'],
  ['I', 'India', 'IN DEE AH', 'I am altering my course to port.'],
  ['J', 'Juliett', 'JEW LEE ETT', 'I am on fire and have dangerous cargo on board: keep well clear of me, or I am leaking dangerous cargo.'],
  ['K', 'Kilo', 'KEY LOH', 'I wish to communicate with you.'],
  ['L', 'Lima', 'LEE MAH', 'You should stop your vessel instantly.'],
  ['M', 'Mike', 'MIKE', 'My vessel is stopped and making no way through the water.'],
  ['N', 'November', 'NO VEM BER', 'No (negative).'],
  ['O', 'Oscar', 'OSS CAH', 'Man overboard.'],
  ['P', 'Papa', 'PAH PAH', 'In harbor: all persons should report on board as the vessel is about to proceed to sea. At sea (fishing vessels): my nets have come fast upon an obstruction.'],
  ['Q', 'Quebec', 'KEH BECK', 'My vessel is “healthy” and I request free pratique.'],
  ['R', 'Romeo', 'ROW ME OH', ''],
  ['S', 'Sierra', 'SEE AIR RAH', 'I am operating astern propulsion.'],
  ['T', 'Tango', 'TANG GO', 'Keep clear of me; I am engaged in pair trawling.'],
  ['U', 'Uniform', 'YOU NEE FORM', 'You are running into danger.'],
  ['V', 'Victor', 'VIK TAH', 'I require assistance.'],
  ['W', 'Whiskey', 'WISS KEY', 'I require medical assistance.'],
  ['X', 'Xray', 'ECKS RAY', 'Stop carrying out your intentions and watch for my signals.'],
  ['Y', 'Yankee', 'YANG KEY', 'I am dragging my anchor.'],
  ['Z', 'Zulu', 'ZOO LOO', 'I require a tug. (Fishing vessels close together on the fishing grounds: I am shooting nets.)'],
]

const NUMERALS: [NumeralId, string, string][] = [
  ['0', 'Nadazero', 'NAH-DAH-ZAY-ROH'],
  ['1', 'Unaone', 'OO-NAH-WUN'],
  ['2', 'Bissotwo', 'BEES-SOH-TOO'],
  ['3', 'Terrathree', 'TAY-RAH-TREE'],
  ['4', 'Kartefour', 'KAR-TAY-FOWER'],
  ['5', 'Pantafive', 'PAN-TAH-FIVE'],
  ['6', 'Soxisix', 'SOK-SEE-SIX'],
  ['7', 'Setteseven', 'SAY-TAY-SEVEN'],
  ['8', 'Oktoeight', 'OK-TOH-AIT'],
  ['9', 'Novenine', 'NO-VAY-NINER'],
]

export const FLAGS: Flag[] = [
  ...LETTERS.map(([id, name, pronunciation, meaning]): Flag => ({
    id, kind: 'letter', name, pronunciation, meaning: meaning || undefined, width: W,
    svg: shaped(LETTER_ART[id][0], LETTER_ART[id][1]),
  })),
  ...NUMERALS.map(([id, name, pronunciation]): Flag => ({
    id, kind: 'numeral', name, pronunciation, width: PW, svg: shaped('pennant', NUMERAL_ART[id]),
  })),
  { id: 'SUB1', kind: 'substitute', name: 'First substitute', width: PW, svg: shaped('triangle', SUBSTITUTE_ART.SUB1),
    meaning: 'Repeats the first flag of the same class above it in the hoist.' },
  { id: 'SUB2', kind: 'substitute', name: 'Second substitute', width: PW, svg: shaped('triangle', SUBSTITUTE_ART.SUB2),
    meaning: 'Repeats the second flag of the same class above it in the hoist.' },
  { id: 'SUB3', kind: 'substitute', name: 'Third substitute', width: PW, svg: shaped('triangle', SUBSTITUTE_ART.SUB3),
    meaning: 'Repeats the third flag of the same class above it in the hoist.' },
  { id: 'CODE', kind: 'code', name: 'Code / answering pennant', width: PW, svg: shaped('pennant', vStripes(PW, [R, Wh, R, Wh, R])),
    meaning: 'Acknowledges a signal; at the dip: signal seen, close up: signal understood. Between numerals it is a decimal point.' },
]

export const FLAG_BY_ID = Object.fromEntries(FLAGS.map((f) => [f.id, f])) as Record<FlagId, Flag>

/** A complete standalone SVG document for one flag. */
export function flagSvgDocument(id: FlagId): string {
  const f = FLAG_BY_ID[id]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${f.width + 2} ${FLAG_H + 2}">${f.svg}</svg>`
}
