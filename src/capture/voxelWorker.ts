/// <reference lib="webworker" />

export interface VoxelWorkerIn {
  code: string
  gridSize: number
  maxColor: number
  maxVoxels: number
}

export type VoxelWorkerOut =
  | { ok: true; cells: Array<[number, number, number, number]> }
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
  const { code, gridSize, maxColor, maxVoxels } = e.data
  const maxIndex = gridSize - 1
  const cells: Array<[number, number, number, number]> = []
  const seen = new Set<string>()
  let stopped = false

  const isInt = (n: number) => Number.isInteger(n)

  const push = (x: number, y: number, z: number, c: number): boolean => {
    if (stopped) return true
    if (!isInt(x) || !isInt(y) || !isInt(z) || !isInt(c)) return false
    if (x < 0 || x > maxIndex) return false
    if (y < 0 || y > maxIndex) return false
    if (z < 0 || z > maxIndex) return false
    if (c < 0 || c > maxColor) return false
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

  // Mirrors `expandCuboid` in generateVoxelScene.ts.
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
    const x1 = Math.min(maxIndex, x + sx - 1)
    const y1 = Math.min(maxIndex, y + sy - 1)
    const z1 = Math.min(maxIndex, z + sz - 1)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (push(cx, cy, cz, c)) return
        }
      }
    }
  }

  // Mirrors `expandSphere` in generateVoxelScene.ts. The `r*r + r` fattens the
  // test radius so small spheres read as round rather than diamond-shaped.
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
      if (cz < 0 || cz > maxIndex) continue
      for (let dy = -r; dy <= r; dy++) {
        const cy = y + dy
        if (cy < 0 || cy > maxIndex) continue
        for (let dx = -r; dx <= r; dx++) {
          const cx = x + dx
          if (cx < 0 || cx > maxIndex) continue
          if (dx * dx + dy * dy + dz * dz > rSq) continue
          if (push(cx, cy, cz, c)) return
        }
      }
    }
  }

  const api: Record<string, unknown> = {
    GRID_SIZE: gridSize,
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
const { GRID_SIZE, MAX_COLOR, Math, setVoxel, setBox, setSphere } = api;
${code}
`,
    ) as (api: Record<string, unknown>) => void
    fn(api)
    const out: VoxelWorkerOut = { ok: true, cells }
    ctx.postMessage(out)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const out: VoxelWorkerOut = { ok: false, error: msg }
    ctx.postMessage(out)
  }
}
