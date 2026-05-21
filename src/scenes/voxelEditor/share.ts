import { deflate, inflate } from 'pako'
import {
  DEFAULT_GRID_SIZE,
  MAX_GRID_AXIS,
  PALETTE,
  type GridSize,
  type Voxel,
} from './coords'

const MAGIC = [0x51, 0x42, 0x46, 0x59] as const // 'QBFY'
const VERSION_V1 = 0x01
const VERSION_V2 = 0x02
const HEADER_LEN_V1 = 5
const HEADER_LEN_V2 = 8
const EMPTY = 0xff

export interface DecodedScene {
  voxels: Voxel[]
  size: GridSize
}

function totalCells(size: GridSize): number {
  return size.x * size.y * size.z
}

function buildCellArray(
  voxels: Map<string, Voxel>,
  size: GridSize,
): Uint8Array {
  const cells = new Uint8Array(totalCells(size)).fill(EMPTY)
  const palette = PALETTE as readonly string[]
  for (const v of voxels.values()) {
    if (v.x < 0 || v.x >= size.x) continue
    if (v.y < 0 || v.y >= size.y) continue
    if (v.z < 0 || v.z >= size.z) continue
    const idx = palette.indexOf(v.color)
    if (idx < 0) continue
    const i = v.x + v.y * size.x + v.z * size.x * size.y
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

export function encodeScene(
  voxels: Map<string, Voxel>,
  size: GridSize,
): string {
  const cells = buildCellArray(voxels, size)
  const rle = rleEncode(cells)
  const framed = new Uint8Array(HEADER_LEN_V2 + rle.length)
  framed.set(MAGIC, 0)
  framed[4] = VERSION_V2
  framed[5] = size.x & 0xff
  framed[6] = size.y & 0xff
  framed[7] = size.z & 0xff
  framed.set(rle, HEADER_LEN_V2)
  return toBase64Url(deflate(framed))
}

function isValidSize(size: GridSize): boolean {
  return (
    Number.isInteger(size.x) &&
    Number.isInteger(size.y) &&
    Number.isInteger(size.z) &&
    size.x >= 1 &&
    size.x <= MAX_GRID_AXIS &&
    size.y >= 1 &&
    size.y <= MAX_GRID_AXIS &&
    size.z >= 1 &&
    size.z <= MAX_GRID_AXIS
  )
}

export function decodeScene(token: string): DecodedScene | null {
  if (!token) return null
  const compressed = fromBase64Url(token)
  if (!compressed) return null
  let framed: Uint8Array
  try {
    framed = inflate(compressed)
  } catch {
    return null
  }
  if (framed.length < HEADER_LEN_V1) return null
  if (
    framed[0] !== MAGIC[0] ||
    framed[1] !== MAGIC[1] ||
    framed[2] !== MAGIC[2] ||
    framed[3] !== MAGIC[3]
  )
    return null

  const version = framed[4]
  let size: GridSize
  let payloadStart: number
  if (version === VERSION_V1) {
    // Legacy 20×20×20 — the hardcoded fallback for tokens that predate the
    // size header.
    size = DEFAULT_GRID_SIZE
    payloadStart = HEADER_LEN_V1
  } else if (version === VERSION_V2) {
    if (framed.length < HEADER_LEN_V2) return null
    size = { x: framed[5], y: framed[6], z: framed[7] }
    if (!isValidSize(size)) return null
    payloadStart = HEADER_LEN_V2
  } else {
    return null
  }

  const cells = rleDecode(framed.subarray(payloadStart), totalCells(size))
  if (!cells) return null
  const voxels: Voxel[] = []
  const sxy = size.x * size.y
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]
    if (idx === EMPTY) continue
    if (idx >= PALETTE.length) return null
    const x = i % size.x
    const y = Math.floor(i / size.x) % size.y
    const z = Math.floor(i / sxy)
    voxels.push({ x, y, z, color: PALETTE[idx] })
  }
  return { voxels, size }
}
