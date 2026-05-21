/// <reference lib="webworker" />

export interface VoxelWorkerIn {
  code: string
  sizeX: number
  sizeY: number
  sizeZ: number
  maxColor: number
  maxVoxels: number
}

export interface VoxelWorkerStats {
  oobX: number
  oobY: number
  oobZ: number
  badColor: number
  badInt: number
  total: number
}

export type VoxelWorkerOut =
  | { ok: true; cells: Array<[number, number, number, number]>; stats: VoxelWorkerStats }
  | { ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

// Strip network and module-loading globals before any snippet runs. The worker
// has no DOM regardless, but `fetch` / `XMLHttpRequest` / `importScripts` are
// reachable from inside a Web Worker by default. LLM-generated code has no
// business calling out.
;(ctx as unknown as Record<string, unknown>).fetch = undefined
;(ctx as unknown as Record<string, unknown>).XMLHttpRequest = undefined
;(ctx as unknown as Record<string, unknown>).importScripts = undefined
;(ctx as unknown as Record<string, unknown>).WebSocket = undefined

ctx.onmessage = (e: MessageEvent<VoxelWorkerIn>) => {
  const { code, sizeX, sizeY, sizeZ, maxColor, maxVoxels } = e.data
  const maxX = sizeX - 1
  const maxY = sizeY - 1
  const maxZ = sizeZ - 1
  const cells: Array<[number, number, number, number]> = []
  const seen = new Set<string>()
  let stopped = false
  const stats: VoxelWorkerStats = {
    oobX: 0,
    oobY: 0,
    oobZ: 0,
    badColor: 0,
    badInt: 0,
    total: 0,
  }

  const isInt = (n: number) => Number.isInteger(n)

  const push = (x: number, y: number, z: number, c: number): boolean => {
    if (stopped) return true
    stats.total++
    if (!isInt(x) || !isInt(y) || !isInt(z) || !isInt(c)) {
      stats.badInt++
      return false
    }
    if (x < 0 || x > maxX) {
      stats.oobX++
      return false
    }
    if (y < 0 || y > maxY) {
      stats.oobY++
      return false
    }
    if (z < 0 || z > maxZ) {
      stats.oobZ++
      return false
    }
    if (c < 0 || c > maxColor) {
      stats.badColor++
      return false
    }
    const k = `${x},${y},${z}`
    if (!seen.has(k)) {
      seen.add(k)
      cells.push([x, y, z, c])
      if (cells.length >= maxVoxels) {
        stopped = true
        return true
      }
    }
    return false
  }

  const setVoxel = (x: number, y: number, z: number, c: number): void => {
    push(x | 0, y | 0, z | 0, c | 0)
  }

  const setBox = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: number,
  ): void => {
    x = x | 0; y = y | 0; z = z | 0
    sx = sx | 0; sy = sy | 0; sz = sz | 0; c = c | 0
    if (sx < 1 || sy < 1 || sz < 1) return
    const x0 = Math.max(0, x)
    const y0 = Math.max(0, y)
    const z0 = Math.max(0, z)
    const x1 = Math.min(maxX, x + sx - 1)
    const y1 = Math.min(maxY, y + sy - 1)
    const z1 = Math.min(maxZ, z + sz - 1)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (push(cx, cy, cz, c)) return
        }
      }
    }
  }

  // The `r*r + r` fattens the test radius so small spheres read as round
  // rather than diamond-shaped.
  const setSphere = (
    x: number,
    y: number,
    z: number,
    r: number,
    c: number,
  ): void => {
    x = x | 0; y = y | 0; z = z | 0; r = r | 0; c = c | 0
    if (r < 1) return
    const rSq = r * r + r
    for (let dz = -r; dz <= r; dz++) {
      const cz = z + dz
      if (cz < 0 || cz > maxZ) continue
      for (let dy = -r; dy <= r; dy++) {
        const cy = y + dy
        if (cy < 0 || cy > maxY) continue
        for (let dx = -r; dx <= r; dx++) {
          const cx = x + dx
          if (cx < 0 || cx > maxX) continue
          if (dx * dx + dy * dy + dz * dz > rSq) continue
          if (push(cx, cy, cz, c)) return
        }
      }
    }
  }

  const api: Record<string, unknown> = {
    SIZE_X: sizeX,
    SIZE_Y: sizeY,
    SIZE_Z: sizeZ,
    MAX_COLOR: maxColor,
    Math,
    setVoxel,
    setBox,
    setSphere,
  }

  try {
    const fn = new Function(
      'api',
      `"use strict";
const { SIZE_X, SIZE_Y, SIZE_Z, MAX_COLOR, Math, setVoxel, setBox, setSphere } = api;
${code}
`,
    ) as (api: Record<string, unknown>) => void
    fn(api)
    const out: VoxelWorkerOut = { ok: true, cells, stats }
    ctx.postMessage(out)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const out: VoxelWorkerOut = { ok: false, error: msg }
    ctx.postMessage(out)
  }
}
