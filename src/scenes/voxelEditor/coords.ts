export const GRID_SIZE = 20

export type Cell = { x: number; y: number; z: number }
export type Voxel = Cell & { color: string }

export const PALETTE = [
  '#f5f5f5',
  '#9ca3af',
  '#1f1d2a',
  '#a78bfa',
  '#8b5cf6',
  '#4f46e5',
  '#ec4899',
  '#be123c',
  '#f97316',
  '#fdba74',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#15803d',
  '#14b8a6',
  '#22d3ee',
  '#60a5fa',
  '#1d4ed8',
  '#a16207',
  '#7c2d12',
] as const

export function cellKey(c: Cell): string {
  return `${c.x},${c.y},${c.z}`
}

export function inBounds(c: Cell): boolean {
  return (
    c.x >= 0 &&
    c.x < GRID_SIZE &&
    c.y >= 0 &&
    c.y < GRID_SIZE &&
    c.z >= 0 &&
    c.z < GRID_SIZE
  )
}

export function cellToWorld(c: Cell): [number, number, number] {
  const offset = (GRID_SIZE - 1) / 2
  return [c.x - offset, c.y + 0.5, c.z - offset]
}

export function worldToCell(p: { x: number; z: number }, y = 0): Cell {
  const half = GRID_SIZE / 2
  return {
    x: Math.floor(p.x + half),
    y,
    z: Math.floor(p.z + half),
  }
}
