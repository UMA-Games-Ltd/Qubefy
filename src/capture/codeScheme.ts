import { ChatError, type JsonSchemaResponseFormat } from '../lib/openrouter'
import {
  cellKey,
  MAX_GRID_AXIS,
  PALETTE_ENTRIES,
  type GridSize,
  type Voxel,
} from '../scenes/voxelEditor/coords'
import { MAX_VOXELS } from './constants'
import VoxelWorker from './voxelWorker.ts?worker'
import type { VoxelWorkerIn, VoxelWorkerOut, VoxelWorkerStats } from './voxelWorker'

const MAX_COLOR = PALETTE_ENTRIES.length - 1
const SNIPPET_TIMEOUT_MS = 2000

const PALETTE_LINES = PALETTE_ENTRIES.map(
  (e, i) => `${i.toString().padStart(2, ' ')}  ${e.name.padEnd(11, ' ')} — ${e.description}`,
).join('\n')

export const CODE_SYSTEM_PROMPT = `You convert a single source image into a tiny 3D voxel scene that fits inside a rectangular grid you choose. You produce the scene by writing a short JavaScript snippet that calls a tiny API; we execute the snippet in a sandbox and collect the cells it writes.

# Step 0 — choose the grid size
- Output a \`size\` object with integer \`x\`, \`y\`, \`z\` axis lengths. The complexity tier (see "Complexity → grid-size envelope" below) sets the per-axis upper bound; the lower bound is 8 on every axis regardless of tier. Absolute hard ceiling is ${MAX_GRID_AXIS} per axis.
- Shape the grid to what you are drawing. For scenes: tall + thin (e.g. 10×24×10) for towers, flagpoles, lamp posts; wide + flat (e.g. 26×8×26) for landscapes, maps, rugs; roughly cubic (e.g. 16×16×16) for rooms. For single objects, shape the grid to the object's silhouette — a mug → narrow cubic, a sword → long and thin, a chair → cubic — not to a scene footprint.
- Bigger is not better. Pick the smallest size inside the complexity envelope that fits what you intend to draw — small grids read cleaner. Use the headroom the tier gives you to add detail, not to inflate empty space.
- \`size\` MUST be a tight bounding box around EVERYTHING you intend to draw — for a scene that includes the ground plane, terrain, and the tallest/widest/deepest object; for a single object it is a tight box around the object itself, with no padding for background. Mentally place every voxel inside the box BEFORE you commit to \`size\`. If your code later wants to write at a coordinate ≥ size on any axis, the \`size\` was wrong: enlarge \`size\`, do not clip your code or shift the object.
- The chosen size determines the legal coordinate range for every other call below. The user-visible base plane is drawn at exactly \`size.x × size.z\`, so any voxel outside the box will visibly hang off the plane and look broken.

# Coordinate system
- Axes: X = right, Y = up, Z = forward (away from viewer).
- After you pick \`size\`, every cell MUST satisfy 0 ≤ x ≤ size.x-1, 0 ≤ y ≤ size.y-1, 0 ≤ z ≤ size.z-1. This is a hard correctness requirement, NOT a harmless clip — out-of-range writes are lost and the rendered scene will be missing parts.
- y = 0 is the ground plane. Build on top of it; do not float objects unless they are intentionally airborne (clouds, birds, lamps, fruit on a branch).
- Centre the composition roughly around x ≈ size.x/2, z ≈ size.z/2 unless the scene demands otherwise.
- The grid is small. Objects must be SIMPLIFIED. A whole tree might only fill 30–80 cells.

# Process — populate \`description\` BEFORE writing \`code\`
1. Classify the source as **scene** or **single object**, and state it explicitly as the first thing in \`description\`.
   - **Scene** = multiple distinct subjects, a landscape, a room, or an environment where the background is part of the content (e.g. a park with a tree + bench + path, a city skyline, a still life with several items, an interior).
   - **Single object** = one subject dominates the frame and the background is incidental (e.g. a product photo of a mug, a sketch of one tree on blank paper, a portrait of a single animal, an icon).
   - When in doubt, ask: does the background contribute meaning, or is it just what happens to be behind the subject? If the latter, it is a single object.
2. Describe what you see in 1–2 sentences and note the source medium — photo of a real 3D scene, or 2D drawing / sketch / icon / painting.
3. Enumerate what you intend to draw, branching on the classification:
   - **Scene**: list every distinct object across the scene, including ground/terrain and background elements that read as part of the composition. Give each a short name and estimate relative size + depth.
   - **Single object**: IGNORE THE BACKGROUND. Do not draw walls, tables, shadows, surrounding scenery, or filler patterns behind the subject. Enumerate only the parts of the subject itself (e.g. for a mug: body, handle, rim, contents; for a tree: trunk, foliage, optional fruit). The grid is a tight bounding box around the object alone, placed centred on the base plane.
4. If the source is 2D (drawing, sketch, icon, painting), INFER the 3D shape the artist intended. A circle on paper might be a sphere, a tree crown, the sun, a wheel — reason about what each shape REPRESENTS, not just its 2D outline.
5. State the \`size\` you have chosen and briefly justify the shape (why tall, wide, or cubic — and for single objects, why those proportions match the silhouette).
6. Plan placement inside the chosen grid. For scenes, assign each object its own footprint so they DO NOT OCCUPY THE SAME CELLS, and use depth (z) to separate things that overlap in the 2D image; leave breathing room between adjacent objects unless they physically connect (a trunk meeting its foliage, a roof on a house). For single objects, plan the parts of the subject the same way.
7. Decide which palette indices map to each object/part — by INTENT, not raw pixel colour. A trunk is "dark brown" + foliage "green" / "dark green". A sun is "yellow", not "amber".

# Palette — pass the material index as \`c\` (0–${MAX_COLOR})
${PALETTE_LINES}

# API surface available inside \`code\`
- \`setVoxel(x, y, z, c)\` — fill a single cell.
- \`setBox(x, y, z, sx, sy, sz, c)\` — fill an axis-aligned box. (x,y,z) is the min corner; (sx,sy,sz) are full sizes (≥ 1). Inclusive of the min corner.
- \`setSphere(x, y, z, r, c)\` — fill a sphere centred on (x,y,z) with integer radius r (≥ 1). Slightly fattened so small r looks round, not diamond.
- Constants: \`SIZE_X\`, \`SIZE_Y\`, \`SIZE_Z\` (the size you just chose), \`MAX_COLOR\` (= ${MAX_COLOR}).
- \`Math\` is available — use \`Math.sin\`, \`Math.cos\`, \`Math.floor\`, \`Math.random\`, etc.
- All arguments are coerced to integers. Later writes overwrite earlier writes at the same cell.
- BOUNDS ARE STRICT. Every \`setVoxel\`/\`setBox\`/\`setSphere\` call must stay inside [0, SIZE_X-1] × [0, SIZE_Y-1] × [0, SIZE_Z-1]. The sandbox silently discards out-of-bounds writes so it can keep running, but those voxels are LOST — the user sees a partial scene that overhangs or under-fills the base plane. Before writing a coordinate, check it against \`SIZE_X\`/\`SIZE_Y\`/\`SIZE_Z\`. If a shape doesn't fit, the bug is upstream: either \`size\` is too small (raise it in Step 0, within the complexity envelope) or your offsets are wrong (recompute them) — do not just let the runtime clip.

# Why code beats a flat point list
You can use loops, helper functions, and procedural logic — that is the entire point of this scheme.
- Build a wall, roof, or trunk with one \`setBox\` instead of dozens of \`setVoxel\` calls.
- Use \`setSphere\` for foliage, fruit, the sun, the moon, balloons.
- Use \`Math.sin\` / \`Math.cos\` / modulo for terrain height-maps, checkered floors, ripples, stripes.
- Define a \`function tree(x, z) { ... }\` and call it three times instead of repeating geometry.

# Complexity → grid-size envelope
The user message names a complexity tier. The tier controls how much SPACE you may use — not a voxel budget. Pick \`size\` so every axis lies within the tier's range; the floor is always 8.
- low — rough sketch: minimal blocky silhouettes, big shapes only. Each axis in [8, 16].
- medium — balanced: recognisable shapes with light surface variation and gentle shading. Each axis in [8, 24].
- high — detailed: surface texture, multi-tone shading, finer features. Each axis in [8, 32].
The range is PER AXIS — a flagpole at "high" might still be 10×32×10; a wide map at "low" might still be 16×8×16. Fit the proportions to the subject, then pick magnitudes inside the tier's range. Use the extra resolution a higher tier gives you to ADD DETAIL, not to inflate empty space around the subject.

# Output rules
- Return STRICT JSON matching the provided schema: \`{"description": "...", "size": {"x": …, "y": …, "z": …}, "code": "..."}\`. No prose outside the JSON.
- \`code\` is a plain JavaScript snippet — top-level statements only. NO \`return\`, NO \`import\`, NO \`export\`, NO module syntax, NO \`fetch\`, NO \`require\`, NO async/await.
- Example: \`{"description":"checkered floor with a single red post","size":{"x":20,"y":6,"z":20},"code":"for(let x=0;x<SIZE_X;x++)for(let z=0;z<SIZE_Z;z++)setVoxel(x,0,z,(x+z)%2?5:6);setBox(10,1,10,1,4,1,7);"}\`
- Prefer compact, expressive code over thousands of literal \`setVoxel\` calls.`

export const CODE_JSON_SCHEMA: JsonSchemaResponseFormat['json_schema'] = {
  name: 'voxel_code_scene',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'size', 'code'],
    properties: {
      description: {
        type: 'string',
        description:
          'Step-by-step scene reasoning: image type (scene vs. single object), source medium (photo vs. drawing), objects or object-parts, depths, chosen grid size + why, placement plan, palette choices. Populate this before writing code.',
      },
      size: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'z'],
        properties: {
          x: { type: 'integer', minimum: 1, maximum: MAX_GRID_AXIS },
          y: { type: 'integer', minimum: 1, maximum: MAX_GRID_AXIS },
          z: { type: 'integer', minimum: 1, maximum: MAX_GRID_AXIS },
        },
        description:
          'Grid dimensions in voxel cells. Shape the box to the subject; bigger is not better.',
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
  size?: { x?: unknown; y?: unknown; z?: unknown }
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
  const stripped = stripJsonNoise(raw)
  try {
    return JSON.parse(stripped) as RawCodeScene
  } catch (err) {
    // Distinguish truncation (unclosed string/object — the common reasoning-ate-the-budget
    // case) from genuinely-non-JSON prose. Helps the user pick the right next step.
    const opens = (stripped.match(/[{[]/g) || []).length
    const closes = (stripped.match(/[}\]]/g) || []).length
    const looksTruncated =
      opens > closes ||
      !stripped.trimEnd().endsWith('}') ||
      (err instanceof SyntaxError && /Unterminated|Unexpected end/i.test(err.message))
    const msg = looksTruncated
      ? `Model output was cut off mid-JSON (${stripped.length} chars, ${opens} opens / ${closes} closes). Likely hit the token limit — try a smaller complexity or a non-reasoning model.`
      : 'Model returned non-JSON content'
    throw new ChatError(200, raw, msg)
  }
}

function parseSize(raw: RawCodeScene['size']): GridSize | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, z } = raw
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number'
  ) {
    return null
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null
  }
  if (x < 1 || y < 1 || z < 1) return null
  if (x > MAX_GRID_AXIS || y > MAX_GRID_AXIS || z > MAX_GRID_AXIS) return null
  return { x, y, z }
}

interface WorkerRun {
  cells: Array<[number, number, number, number]>
  stats: VoxelWorkerStats
}

function runInWorker(code: string, size: GridSize): Promise<WorkerRun> {
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
        const { cells, stats } = e.data
        finish(() => resolve({ cells, stats }))
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
      sizeX: size.x,
      sizeY: size.y,
      sizeZ: size.z,
      maxColor: MAX_COLOR,
      maxVoxels: MAX_VOXELS,
    }
    worker.postMessage(msg)
  })
}

function tuplesToVoxels(
  tuples: Array<[number, number, number, number]>,
  size: GridSize,
): Voxel[] {
  const byKey = new Map<string, Voxel>()
  const maxX = size.x - 1
  const maxY = size.y - 1
  const maxZ = size.z - 1
  for (const [x, y, z, c] of tuples) {
    if (x < 0 || x > maxX) continue
    if (y < 0 || y > maxY) continue
    if (z < 0 || z > maxZ) continue
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

export interface ParsedScene {
  voxels: Voxel[]
  size: GridSize
}

export async function parseCodeSceneToVoxels(
  content: string,
): Promise<ParsedScene> {
  const scene = parseScene(content)
  const size = parseSize(scene.size)
  if (!size) {
    throw new ChatError(
      200,
      scene,
      `Model returned an invalid or missing \`size\` (each axis must be an integer in [1, ${MAX_GRID_AXIS}])`,
    )
  }
  const code = typeof scene.code === 'string' ? scene.code : ''
  if (code.length === 0) {
    throw new ChatError(200, scene, 'Model returned no code')
  }
  const { cells, stats } = await runInWorker(code, size)
  const oobTotal = stats.oobX + stats.oobY + stats.oobZ
  const droppedTotal = oobTotal + stats.badColor + stats.badInt
  if (droppedTotal > 0) {
    console.warn(
      `[voxelWorker] size=${size.x}×${size.y}×${size.z} — dropped ${droppedTotal}/${stats.total} writes (oobX=${stats.oobX}, oobY=${stats.oobY}, oobZ=${stats.oobZ}, badColor=${stats.badColor}, badInt=${stats.badInt})`,
    )
  } else {
    console.log(
      `[voxelWorker] size=${size.x}×${size.y}×${size.z} — ${stats.total} writes, none dropped`,
    )
  }
  const voxels = tuplesToVoxels(cells, size)
  return { voxels, size }
}
