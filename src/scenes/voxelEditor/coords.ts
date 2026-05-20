export const GRID_SIZE = 20

export type Cell = { x: number; y: number; z: number }
export type Voxel = Cell & { color: string }

export interface PaletteEntry {
  hex: string
  name: string
  description: string
}

export const PALETTE_ENTRIES: readonly PaletteEntry[] = [
  { hex: '#f5f5f5', name: 'white',      description: 'paper white, snow, clouds, highlights, eggshell' },
  { hex: '#9ca3af', name: 'gray',       description: 'concrete, stone, neutral mid-tone, fur' },
  { hex: '#1f1d2a', name: 'charcoal',   description: 'near-black; outlines, shadows, ink, tarmac' },
  { hex: '#a78bfa', name: 'violet',     description: 'light purple, lavender, dusk sky' },
  { hex: '#8b5cf6', name: 'purple',     description: 'rich purple, royal, magic, plum' },
  { hex: '#4f46e5', name: 'indigo',     description: 'deep blue-violet, night sky, twilight' },
  { hex: '#ec4899', name: 'pink',       description: 'bright pink, blossoms, neon, bubblegum' },
  { hex: '#be123c', name: 'rose',       description: 'deep red-pink, garnet, wine, brick red' },
  { hex: '#f97316', name: 'orange',     description: 'pumpkin, sunset, flame, traffic cone' },
  { hex: '#fdba74', name: 'amber',      description: 'pale orange, sand, peach, light wood' },
  { hex: '#eab308', name: 'yellow',     description: 'gold, sun, banana, school bus' },
  { hex: '#84cc16', name: 'lime',       description: 'yellow-green, fresh foliage, spring grass' },
  { hex: '#22c55e', name: 'green',      description: 'grass, healthy leaves, plants' },
  { hex: '#15803d', name: 'dark green', description: 'pine, deep foliage, moss, evergreen' },
  { hex: '#14b8a6', name: 'teal',       description: 'blue-green, lagoon, mint, shallow tropical water' },
  { hex: '#22d3ee', name: 'cyan',       description: 'bright sky blue, ice, water highlight' },
  { hex: '#60a5fa', name: 'sky',        description: 'soft blue, daytime sky, light denim' },
  { hex: '#1d4ed8', name: 'blue',       description: 'deep blue, ocean, denim, sapphire' },
  { hex: '#a16207', name: 'brown',      description: 'wood, bark, earth, leather' },
  { hex: '#7c2d12', name: 'dark brown', description: 'mahogany, deep soil, tree trunk, chocolate' },
]

export const PALETTE: readonly string[] = PALETTE_ENTRIES.map((e) => e.hex)

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
