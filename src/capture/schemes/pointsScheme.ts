import { ChatError } from '../../lib/openrouter'
import {
  GRID_SIZE,
  PALETTE_ENTRIES,
  cellKey,
  type Voxel,
} from '../../scenes/voxelEditor/coords'
import { MAX_VOXELS } from '../constants'
import type { SchemeDescriptor } from './types'

const MAX_INDEX = GRID_SIZE - 1
const MAX_COLOR = PALETTE_ENTRIES.length - 1

const PALETTE_LINES = PALETTE_ENTRIES.map(
  (e, i) => `${i.toString().padStart(2, ' ')}  ${e.name.padEnd(11, ' ')} — ${e.description}`,
).join('\n')

const SYSTEM_PROMPT = `You convert a single source image into a tiny 3D voxel scene that fits inside a ${GRID_SIZE}×${GRID_SIZE}×${GRID_SIZE} grid.

# Coordinate system
- Axes: X = right, Y = up, Z = forward (away from viewer).
- Each axis runs from 0 to ${MAX_INDEX} (inclusive). Every cell MUST satisfy 0 ≤ x ≤ ${MAX_INDEX}, 0 ≤ y ≤ ${MAX_INDEX}, 0 ≤ z ≤ ${MAX_INDEX}.
- y = 0 is the ground plane. Build on top of it; do not float objects unless they are intentionally airborne (clouds, birds, lamps, fruit on a branch).
- Centre the composition roughly around x ≈ ${Math.floor(GRID_SIZE / 2)}, z ≈ ${Math.floor(GRID_SIZE / 2)} unless the scene demands otherwise.
- The grid is small. Objects must be SIMPLIFIED. A whole tree might only fill 30–80 cells.

# Process — populate \`description\` BEFORE any geometry
1. Describe what you see in 1–2 sentences. Is the source a photo of a real 3D scene, or a 2D drawing / sketch / icon / painting?
2. Enumerate the distinct objects. For each, give it a short name and estimate its real-world size and depth relative to the others.
3. If the source is 2D (drawing, sketch, icon, painting), INFER the 3D shape the artist intended. A circle on paper might be a sphere, a tree crown, the sun, a wheel — reason about what each shape REPRESENTS, not just its 2D outline.
4. Plan placement inside the ${GRID_SIZE}³ grid. Assign each object its own footprint so they DO NOT OCCUPY THE SAME CELLS. Use depth (z) to separate things that overlap in the 2D image. Leave breathing room — adjacent objects should not touch unless they physically connect (a trunk meeting its foliage, a roof on a house).
5. Choose materials from the palette by INTENT, not by raw pixel colour. A tree trunk is "dark brown" + foliage "green" / "dark green", not whatever exact hex the photo had. A sun is "yellow", not "amber". Pick the material that BEST describes what the cell IS.

# Palette — choose \`c\` (material index) from this list
\`c\` is a single byte (0–${MAX_COLOR}). Materials available:
${PALETTE_LINES}

# Geometry — one filled cell per tuple
Emit every filled cell individually in \`points\`. Each tuple is \`[x, y, z, c]\`.
Empty cells are implicit — never emit a tuple for empty space.
Later tuples overwrite earlier ones at the same (x, y, z), so you can layer detail on top of a base.

# Density guidance — adjust by the effort field in the user message
- weak:   ~20–80 filled cells. Minimal blocky silhouettes; one tuple per major feature.
- medium: ~80–300 filled cells. Recognisable shapes with light detail and shading.
- strong: ~300–1000 filled cells. Full shapes with surface texture and multi-tone shading.
- Hard cap: never produce more than ${MAX_VOXELS} filled cells under any effort.

# Output rules
- Return STRICT JSON matching the provided schema. No prose outside the JSON.
- Each cell is a flat 4-int tuple — NOT an object. Compact form is required.
  Example: \`{"description":"…","points":[[10,0,10,5],[10,1,10,5],[10,2,10,7]]}\`
- Prefer fewer, well-placed cells over noise — every cell should belong to something.`

const POINTS_SCHEMA = {
  name: 'voxel_scene',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'points'],
    properties: {
      description: {
        type: 'string',
        description:
          'Step-by-step scene reasoning: source type, objects, depths, placement plan, palette choices. Populate this before any geometry.',
      },
      // Flat 4-int tuples [x, y, z, c] — the object form is ~3× the tokens
      // and blows past Haiku's output budget on medium+ efforts.
      // No `minItems`/`maxItems` — Bedrock rejects array length constraints;
      // tuple length and value ranges are enforced client-side in `toVoxels`.
      points: {
        type: 'array',
        items: { type: 'array', items: { type: 'integer' } },
      },
    },
  },
} as const

type RawTuple = number[]

interface RawScene {
  description?: string
  points?: RawTuple[]
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

// Strip markdown fences and any prose before the first `{` / after the last `}`.
// `response_format: json_schema` usually prevents this, but some providers
// still leak ```json ... ``` wrappers or stray reasoning text.
function stripJsonNoise(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  const first = s.indexOf('{')
  if (first > 0) s = s.slice(first)
  return s
}

// Recover a truncated voxel-scene JSON. Truncation hits the `points` array
// mid-tuple (the array is most of the payload, so it's where the budget runs
// out). Trim back to the last complete tuple and close the outer brackets.
function repairScene(raw: string): RawScene | null {
  const s = stripJsonNoise(raw)
  const pointsIdx = s.indexOf('"points"')
  if (pointsIdx === -1) return null

  // Walk back to the last `]` — that's the closer of the last complete tuple.
  // Re-close with `]}` to terminate the points array and the root object.
  const lastBracket = s.lastIndexOf(']')
  if (lastBracket <= pointsIdx) return null

  const candidate = s.slice(0, lastBracket + 1) + ']}'
  try {
    return JSON.parse(candidate) as RawScene
  } catch {
    return null
  }
}

function parseScene(raw: string): RawScene {
  const cleaned = stripJsonNoise(raw)
  try {
    return JSON.parse(cleaned) as RawScene
  } catch {
    const repaired = repairScene(raw)
    if (repaired) {
      console.warn(
        '[pointsScheme] response was truncated/malformed — repaired by trimming to last complete tuple',
      )
      return repaired
    }
    throw new ChatError(200, raw, 'Model returned non-JSON content')
  }
}

function writeCell(
  byKey: Map<string, Voxel>,
  x: number,
  y: number,
  z: number,
  c: number,
): boolean {
  const voxel: Voxel = { x, y, z, color: PALETTE_ENTRIES[c].hex }
  byKey.set(cellKey(voxel), voxel)
  return byKey.size >= MAX_VOXELS
}

function toVoxels(scene: RawScene): Voxel[] {
  const byKey = new Map<string, Voxel>()

  if (Array.isArray(scene.points)) {
    for (const t of scene.points) {
      if (!Array.isArray(t) || t.length < 4) continue
      const [x, y, z, c] = t
      if (!isInt(x) || !isInt(y) || !isInt(z) || !isInt(c)) continue
      if (x < 0 || x > MAX_INDEX) continue
      if (y < 0 || y > MAX_INDEX) continue
      if (z < 0 || z > MAX_INDEX) continue
      if (c < 0 || c > MAX_COLOR) continue
      if (writeCell(byKey, x, y, z, c)) break
    }
  }

  if (byKey.size === 0) {
    throw new ChatError(200, scene, 'Model produced no valid voxels')
  }

  return Array.from(byKey.values())
}

export const pointsScheme: SchemeDescriptor = {
  id: 'points',
  label: 'Points',
  hint: 'tuple list',
  systemPrompt: SYSTEM_PROMPT,
  jsonSchema: POINTS_SCHEMA,
  async parseToVoxels(content) {
    return toVoxels(parseScene(content))
  },
}
