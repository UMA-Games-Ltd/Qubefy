import { chat, ChatError, type ChatMessage } from '../lib/openrouter'
import {
  GRID_SIZE,
  PALETTE_ENTRIES,
  cellKey,
  type Voxel,
} from '../scenes/voxelEditor/coords'
import type { CapturedImage, EffortPreset } from './types'

const MAX_VOXELS = 2000

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

# Planning (think before emitting)
- Identify the distinct objects in the source. If it is a 2D drawing/sketch/icon/painting, INFER the 3D shape each element represents — a circle might be a sphere, a tree crown, the sun, a wheel.
- Estimate each object's relative size and depth, then plan placements inside the ${GRID_SIZE}³ grid so objects DO NOT OCCUPY THE SAME CELLS. Use z to separate things that overlap in 2D. Leave breathing room — adjacent objects should not touch unless they physically connect (trunk meeting foliage, roof on a house).
- Choose materials from the palette by INTENT, not by raw pixel colour. A tree trunk is "dark brown" + foliage "green" / "dark green". A sun is "yellow", not "amber". Pick the material that BEST describes what the cell IS.

# Palette — choose \`c\` (material index) from this list
\`c\` is a single byte (0–${MAX_COLOR}). Materials available:
${PALETTE_LINES}

# Geometry — one filled cell per tuple
Group cells belonging to the same real-world object into one entry in \`objects\`. Each entry has a \`points\` array; each tuple in it is a flat \`[x, y, z, c]\`.
Each object's \`points\` should be cohesive — all cells in one entry belong to the same thing.
Empty cells are implicit — never emit a tuple for empty space.
Later tuples overwrite earlier ones at the same (x, y, z), across objects too, so you can layer detail on top of a base.

# Density guidance — adjust by the effort field in the user message
- weak:   ~20–80 filled cells total. Minimal blocky silhouettes; one tuple per major feature.
- medium: ~80–300 filled cells total. Recognisable shapes with light detail and shading.
- strong: ~300–1000 filled cells total. Full shapes with surface texture and multi-tone shading.
- Hard cap: never produce more than ${MAX_VOXELS} filled cells under any effort.

# Output rules
- Return STRICT JSON matching the provided schema. No prose outside the JSON.
- Each cell is a flat 4-int tuple — NOT an object. Compact form is required.
  Example: \`{"objects":[{"points":[[10,0,10,5],[10,1,10,5]]},{"points":[[18,18,2,3]]}]}\`
- Prefer fewer, well-placed cells over noise — every cell should belong to something.`

const VOXEL_SCHEMA = {
  name: 'voxel_scene',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['objects'],
    properties: {
      objects: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['points'],
          properties: {
            // Flat 4-int tuples [x, y, z, c] — the object form is ~3× the
            // tokens and blows past Haiku's output budget on medium+ efforts.
            // No `minItems`/`maxItems` — Bedrock rejects array length
            // constraints; tuple length and value ranges are enforced
            // client-side in `toVoxels`.
            points: {
              type: 'array',
              items: { type: 'array', items: { type: 'integer' } },
            },
          },
        },
      },
    },
  },
} as const

type RawTuple = number[]

interface RawObject {
  points?: RawTuple[]
}

interface RawScene {
  objects?: RawObject[]
}

function maxTokensForEffort(effort: EffortPreset): number {
  if (effort === 'strong') return 19000
  if (effort === 'medium') return 8200
  return 4000
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

function parseScene(raw: string): RawScene {
  try {
    return JSON.parse(raw) as RawScene
  } catch {
    throw new ChatError(200, raw, 'Model returned non-JSON content')
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
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

// Primitive expansion helpers — currently UNUSED by toVoxels (the model emits
// only points). Kept for future programmatic callers that may want to build
// scenes from cuboids/spheres directly without a model round-trip.
//
// Each helper returns `true` if MAX_VOXELS has been reached and the caller
// should stop emitting further primitives.

/** Fill an axis-aligned box `[x, y, z, sx, sy, sz, c]` (min corner + full sizes). */
export function expandCuboid(byKey: Map<string, Voxel>, t: RawTuple): boolean {
  if (!Array.isArray(t) || t.length < 7) return false
  const [x, y, z, sx, sy, sz, c] = t
  if (!isInt(x) || !isInt(y) || !isInt(z)) return false
  if (!isInt(sx) || !isInt(sy) || !isInt(sz)) return false
  if (!isInt(c) || c < 0 || c > MAX_COLOR) return false
  if (sx < 1 || sy < 1 || sz < 1) return false

  const x0 = clamp(x, 0, MAX_INDEX)
  const y0 = clamp(y, 0, MAX_INDEX)
  const z0 = clamp(z, 0, MAX_INDEX)
  const x1 = clamp(x + sx - 1, 0, MAX_INDEX)
  const y1 = clamp(y + sy - 1, 0, MAX_INDEX)
  const z1 = clamp(z + sz - 1, 0, MAX_INDEX)

  for (let cz = z0; cz <= z1; cz++) {
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (writeCell(byKey, cx, cy, cz, c)) return true
      }
    }
  }
  return false
}

/**
 * Fill a sphere `[x, y, z, r, c]` (center cell + radius). The `+ r` fattens
 * the test radius slightly so small spheres (r = 1–3) read as round rather
 * than diamond-shaped — a standard voxel-art trick.
 */
export function expandSphere(byKey: Map<string, Voxel>, t: RawTuple): boolean {
  if (!Array.isArray(t) || t.length < 5) return false
  const [x, y, z, r, c] = t
  if (!isInt(x) || !isInt(y) || !isInt(z) || !isInt(r) || !isInt(c)) return false
  if (c < 0 || c > MAX_COLOR) return false
  if (r < 1) return false

  const rSq = r * r + r
  for (let dz = -r; dz <= r; dz++) {
    const cz = z + dz
    if (cz < 0 || cz > MAX_INDEX) continue
    for (let dy = -r; dy <= r; dy++) {
      const cy = y + dy
      if (cy < 0 || cy > MAX_INDEX) continue
      for (let dx = -r; dx <= r; dx++) {
        const cx = x + dx
        if (cx < 0 || cx > MAX_INDEX) continue
        if (dx * dx + dy * dy + dz * dz > rSq) continue
        if (writeCell(byKey, cx, cy, cz, c)) return true
      }
    }
  }
  return false
}

function toVoxels(scene: RawScene): Voxel[] {
  const byKey = new Map<string, Voxel>()

  if (Array.isArray(scene.objects)) {
    outer: for (const obj of scene.objects) {
      if (!obj || !Array.isArray(obj.points)) continue
      for (const t of obj.points) {
        if (!Array.isArray(t) || t.length < 4) continue
        const [x, y, z, c] = t
        if (!isInt(x) || !isInt(y) || !isInt(z) || !isInt(c)) continue
        if (x < 0 || x > MAX_INDEX) continue
        if (y < 0 || y > MAX_INDEX) continue
        if (z < 0 || z > MAX_INDEX) continue
        if (c < 0 || c > MAX_COLOR) continue
        if (writeCell(byKey, x, y, z, c)) break outer
      }
    }
  }

  if (byKey.size === 0) {
    throw new ChatError(200, scene, 'Model produced no valid voxels')
  }

  return Array.from(byKey.values())
}

// Vision models top out around ~1024px useful resolution; phone cameras shoot
// 12MP. Sending the raw base64 blows past Netlify Function payload limits
// (~6 MB) and wastes upstream tokens. Downsize before the request.
const MAX_IMAGE_EDGE = 1280

async function downsizeImage(image: CapturedImage): Promise<string> {
  const maxEdge = Math.max(image.width, image.height)
  if (maxEdge <= MAX_IMAGE_EDGE) return image.dataUrl

  const scale = MAX_IMAGE_EDGE / maxEdge
  const w = Math.round(image.width * scale)
  const h = Math.round(image.height * scale)

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = image.dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return image.dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export interface GenerationInfo {
  model: string
  effort: EffortPreset
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}

export interface GenerationResult {
  voxels: Voxel[]
  info: GenerationInfo | null
}

export async function generateVoxelScene(
  image: CapturedImage,
  modelId: string,
  effort: EffortPreset,
): Promise<GenerationResult> {
  const dataUrl = await downsizeImage(image)

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Effort: ${effort}. Generate a voxel scene from this image.`,
        },
        {
          type: 'image_url',
          image_url: { url: dataUrl, detail: 'high' },
        },
      ],
    },
  ]

  const res = await chat({
    model: modelId,
    messages,
    response_format: { type: 'json_schema', json_schema: VOXEL_SCHEMA },
    temperature: 0.4,
    max_tokens: maxTokensForEffort(effort),
    usage: { include: true },
  })

  let info: GenerationInfo | null = null
  if (res.usage) {
    const { prompt_tokens, completion_tokens, total_tokens, cost } = res.usage
    info = {
      model: modelId,
      effort,
      promptTokens: prompt_tokens,
      completionTokens: completion_tokens,
      totalTokens: total_tokens,
      cost: typeof cost === 'number' ? cost : undefined,
    }
    const costStr =
      typeof cost === 'number' ? `$${cost.toFixed(6)}` : 'n/a'
    console.log(
      `[generateVoxelScene] ${modelId} (${effort}) — tokens: ${prompt_tokens} in / ${completion_tokens} out / ${total_tokens} total · cost: ${costStr}`,
    )
  }

  // OpenRouter sometimes returns 200 with an error body (no `choices`) — e.g.
  // upstream provider failure or content moderation. Surface that message
  // instead of crashing on the array access.
  const errBody = (res as unknown as { error?: { message?: string } | string }).error
  if (errBody) {
    const msg =
      typeof errBody === 'string'
        ? errBody
        : errBody.message ?? 'Upstream returned an error'
    throw new ChatError(200, res, msg)
  }

  const content = res.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    const finish = res.choices?.[0]?.finish_reason
    throw new ChatError(
      200,
      res,
      finish === 'length'
        ? 'Model hit the token limit before finishing — try a smaller effort'
        : 'Model returned empty content',
    )
  }

  return { voxels: toVoxels(parseScene(content)), info }
}
