import { ChatError, type JsonSchemaResponseFormat } from '../lib/openrouter'
import {
  GRID_SIZE,
  PALETTE_ENTRIES,
  cellKey,
  type Voxel,
} from '../scenes/voxelEditor/coords'
import { MAX_VOXELS } from './constants'
import VoxelWorker from './voxelWorker.ts?worker'
import type { VoxelWorkerIn, VoxelWorkerOut } from './voxelWorker'

const MAX_INDEX = GRID_SIZE - 1
const MAX_COLOR = PALETTE_ENTRIES.length - 1
const SNIPPET_TIMEOUT_MS = 2000

const PALETTE_LINES = PALETTE_ENTRIES.map(
  (e, i) => `${i.toString().padStart(2, ' ')}  ${e.name.padEnd(11, ' ')} — ${e.description}`,
).join('\n')

export const CODE_SYSTEM_PROMPT = `You convert a single source image into a tiny 3D voxel scene that fits inside a ${GRID_SIZE}×${GRID_SIZE}×${GRID_SIZE} grid. You produce the scene by writing a short JavaScript snippet that calls a tiny API; we execute the snippet in a sandbox and collect the cells it writes.

# Coordinate system
- Axes: X = right, Y = up, Z = forward (away from viewer).
- Each axis runs from 0 to ${MAX_INDEX} (inclusive). Every cell MUST satisfy 0 ≤ x ≤ ${MAX_INDEX}, 0 ≤ y ≤ ${MAX_INDEX}, 0 ≤ z ≤ ${MAX_INDEX}.
- y = 0 is the ground plane. Build on top of it; do not float objects unless they are intentionally airborne (clouds, birds, lamps, fruit on a branch).
- Centre the composition roughly around x ≈ ${Math.floor(GRID_SIZE / 2)}, z ≈ ${Math.floor(GRID_SIZE / 2)} unless the scene demands otherwise.
- The grid is small. Objects must be SIMPLIFIED. A whole tree might only fill 30–80 cells.

# Process — populate \`description\` BEFORE writing \`code\`
1. Describe what you see in 1–2 sentences. Is the source a photo of a real 3D scene, or a 2D drawing / sketch / icon / painting?
2. Enumerate the distinct objects. For each, give it a short name and estimate its real-world size and depth relative to the others.
3. If the source is 2D (drawing, sketch, icon, painting), INFER the 3D shape the artist intended. A circle on paper might be a sphere, a tree crown, the sun, a wheel — reason about what each shape REPRESENTS, not just its 2D outline.
4. Plan placement inside the ${GRID_SIZE}³ grid. Assign each object its own footprint so they DO NOT OCCUPY THE SAME CELLS. Use depth (z) to separate things that overlap in the 2D image. Leave breathing room — adjacent objects should not touch unless they physically connect (a trunk meeting its foliage, a roof on a house).
5. Decide which palette indices map to each object — by INTENT, not raw pixel colour. A trunk is "dark brown" + foliage "green" / "dark green". A sun is "yellow", not "amber".

# Palette — pass the material index as \`c\` (0–${MAX_COLOR})
${PALETTE_LINES}

# API surface available inside \`code\`
- \`setVoxel(x, y, z, c)\` — fill a single cell.
- \`setBox(x, y, z, sx, sy, sz, c)\` — fill an axis-aligned box. (x,y,z) is the min corner; (sx,sy,sz) are full sizes (≥ 1). Inclusive of the min corner.
- \`setSphere(x, y, z, r, c)\` — fill a sphere centred on (x,y,z) with integer radius r (≥ 1). Slightly fattened so small r looks round, not diamond.
- Constants: \`GRID_SIZE\` (= ${GRID_SIZE}), \`MAX_COLOR\` (= ${MAX_COLOR}).
- \`Math\` is available — use \`Math.sin\`, \`Math.cos\`, \`Math.floor\`, \`Math.random\`, etc.
- All arguments are coerced to integers. Out-of-bounds coordinates and bad colour indices are SILENTLY DROPPED — your code keeps running. Later writes overwrite earlier writes at the same cell.
- Only the first ${MAX_VOXELS} unique cells are kept; further writes are ignored. Don't fight the cap, just stay under it.

# Why code beats a flat point list
You can use loops, helper functions, and procedural logic — that is the entire point of this scheme.
- Build a wall, roof, or trunk with one \`setBox\` instead of dozens of \`setVoxel\` calls.
- Use \`setSphere\` for foliage, fruit, the sun, the moon, balloons.
- Use \`Math.sin\` / \`Math.cos\` / modulo for terrain height-maps, checkered floors, ripples, stripes.
- Define a \`function tree(x, z) { ... }\` and call it three times instead of repeating geometry.

# Density guidance — adjust by the complexity field in the user message
- low:    your code should produce ~20–80 filled cells. Minimal blocky silhouettes.
- medium: ~80–300 filled cells. Recognisable shapes with light detail and shading.
- high:   ~300–1000 filled cells. Full shapes with surface texture and multi-tone shading.
- Hard cap: never exceed ${MAX_VOXELS} cells — the runtime stops accepting writes past that.

# Output rules
- Return STRICT JSON matching the provided schema: \`{"description": "...", "code": "..."}\`. No prose outside the JSON.
- \`code\` is a plain JavaScript snippet — top-level statements only. NO \`return\`, NO \`import\`, NO \`export\`, NO module syntax, NO \`fetch\`, NO \`require\`, NO async/await.
- Example: \`{"description":"checkered floor with a single red post","code":"for(let x=0;x<20;x++)for(let z=0;z<20;z++)setVoxel(x,0,z,(x+z)%2?5:6);setBox(10,1,10,1,4,1,7);"}\`
- Prefer compact, expressive code over thousands of literal \`setVoxel\` calls.`

export const CODE_JSON_SCHEMA: JsonSchemaResponseFormat['json_schema'] = {
  name: 'voxel_code_scene',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'code'],
    properties: {
      description: {
        type: 'string',
        description:
          'Step-by-step scene reasoning: source type, objects, depths, placement plan, palette choices. Populate this before writing code.',
      },
      code: {
        type: 'string',
        description:
          'JavaScript snippet using setVoxel/setBox/setSphere to draw the scene. Top-level statements only — no imports, no return, no async.',
      },
    },
  },
}

interface RawCodeScene {
  description?: string
  code?: string
}

function stripJsonNoise(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  const first = s.indexOf('{')
  if (first > 0) s = s.slice(first)
  return s
}

function parseScene(raw: string): RawCodeScene {
  try {
    return JSON.parse(stripJsonNoise(raw)) as RawCodeScene
  } catch {
    throw new ChatError(200, raw, 'Model returned non-JSON content')
  }
}

function runInWorker(code: string): Promise<Array<[number, number, number, number]>> {
  return new Promise((resolve, reject) => {
    const worker = new VoxelWorker()
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      fn()
    }

    const timer = setTimeout(() => {
      finish(() =>
        reject(new ChatError(200, code, `Voxel snippet timed out after ${SNIPPET_TIMEOUT_MS}ms`)),
      )
    }, SNIPPET_TIMEOUT_MS)

    worker.onmessage = (e: MessageEvent<VoxelWorkerOut>) => {
      if (e.data.ok) {
        finish(() => resolve(e.data.ok ? e.data.cells : []))
      } else {
        const msg = e.data.error
        finish(() => reject(new ChatError(200, code, `Voxel snippet failed: ${msg}`)))
      }
    }

    worker.onerror = (ev: ErrorEvent) => {
      finish(() =>
        reject(new ChatError(200, code, `Voxel worker error: ${ev.message || 'unknown'}`)),
      )
    }

    const msg: VoxelWorkerIn = {
      code,
      gridSize: GRID_SIZE,
      maxColor: MAX_COLOR,
      maxVoxels: MAX_VOXELS,
    }
    worker.postMessage(msg)
  })
}

function tuplesToVoxels(tuples: Array<[number, number, number, number]>): Voxel[] {
  const byKey = new Map<string, Voxel>()
  for (const [x, y, z, c] of tuples) {
    if (x < 0 || x > MAX_INDEX) continue
    if (y < 0 || y > MAX_INDEX) continue
    if (z < 0 || z > MAX_INDEX) continue
    if (c < 0 || c > MAX_COLOR) continue
    const voxel: Voxel = { x, y, z, color: PALETTE_ENTRIES[c].hex }
    byKey.set(cellKey(voxel), voxel)
    if (byKey.size >= MAX_VOXELS) break
  }
  if (byKey.size === 0) {
    throw new ChatError(200, tuples, 'Model produced no valid voxels')
  }
  return Array.from(byKey.values())
}

export async function parseCodeSceneToVoxels(content: string): Promise<Voxel[]> {
  const scene = parseScene(content)
  const code = typeof scene.code === 'string' ? scene.code : ''
  if (code.length === 0) {
    throw new ChatError(200, scene, 'Model returned no code')
  }
  const tuples = await runInWorker(code)
  return tuplesToVoxels(tuples)
}
