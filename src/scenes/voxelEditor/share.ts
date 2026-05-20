import { deflate, inflate } from 'pako'
import { GRID_SIZE, PALETTE, type Voxel } from './coords'

const MAGIC = [0x51, 0x42, 0x46, 0x59] as const // 'QBFY'
const VERSION = 0x01
const HEADER_LEN = 5
const EMPTY = 0xff
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE * GRID_SIZE

function buildCellArray(voxels: Map<string, Voxel>): Uint8Array {
  const cells = new Uint8Array(TOTAL_CELLS).fill(EMPTY)
  const palette = PALETTE as readonly string[]
  for (const v of voxels.values()) {
    const idx = palette.indexOf(v.color)
    if (idx < 0) continue
    const i = v.x + v.y * GRID_SIZE + v.z * GRID_SIZE * GRID_SIZE
    if (i < 0 || i >= TOTAL_CELLS) continue
    cells[i] = idx
  }
  return cells
}

function rleEncode(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < bytes.length) {
    const v = bytes[i]
    let run = 1
    while (i + run < bytes.length && bytes[i + run] === v && run < 255) run++
    out.push(run, v)
    i += run
  }
  return new Uint8Array(out)
}

function rleDecode(bytes: Uint8Array, expected: number): Uint8Array | null {
  if (bytes.length % 2 !== 0) return null
  const out = new Uint8Array(expected)
  let pos = 0
  for (let i = 0; i < bytes.length; i += 2) {
    const count = bytes[i]
    const value = bytes[i + 1]
    if (count === 0) return null
    if (pos + count > expected) return null
    out.fill(value, pos, pos + count)
    pos += count
  }
  if (pos !== expected) return null
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token: string): Uint8Array | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bin = atob(b64 + pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

export function encodeScene(voxels: Map<string, Voxel>): string {
  const cells = buildCellArray(voxels)
  const rle = rleEncode(cells)
  const framed = new Uint8Array(HEADER_LEN + rle.length)
  framed.set(MAGIC, 0)
  framed[4] = VERSION
  framed.set(rle, HEADER_LEN)
  return toBase64Url(deflate(framed))
}

export function decodeScene(token: string): Voxel[] | null {
  if (!token) return null
  const compressed = fromBase64Url(token)
  if (!compressed) return null
  let framed: Uint8Array
  try {
    framed = inflate(compressed)
  } catch {
    return null
  }
  if (framed.length < HEADER_LEN) return null
  if (
    framed[0] !== MAGIC[0] ||
    framed[1] !== MAGIC[1] ||
    framed[2] !== MAGIC[2] ||
    framed[3] !== MAGIC[3] ||
    framed[4] !== VERSION
  )
    return null
  const cells = rleDecode(framed.subarray(HEADER_LEN), TOTAL_CELLS)
  if (!cells) return null
  const out: Voxel[] = []
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]
    if (idx === EMPTY) continue
    if (idx >= PALETTE.length) return null
    const x = i % GRID_SIZE
    const y = Math.floor(i / GRID_SIZE) % GRID_SIZE
    const z = Math.floor(i / (GRID_SIZE * GRID_SIZE))
    out.push({ x, y, z, color: PALETTE[idx] })
  }
  return out
}
