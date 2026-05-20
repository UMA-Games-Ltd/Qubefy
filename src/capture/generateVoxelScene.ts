import { chat, ChatError, type ChatMessage } from '../lib/openrouter'
import {
  GRID_SIZE,
  PALETTE_ENTRIES,
  cellKey,
  type Voxel,
} from '../scenes/voxelEditor/coords'
import type { CapturedImage, EffortPreset } from './types'

const MAX_VOXELS = 8000

const MAX_INDEX = GRID_SIZE - 1
const MAX_COLOR = PALETTE_ENTRIES.length - 1

const PALETTE_LINES = PALETTE_ENTRIES.map(
  (e, i) => `${i.toString().padStart(2, ' ')}  ${e.name.padEnd(11, ' ')} — ${e.description}`,
).join('\n')

const SYSTEM_PROMPT = `You convert a single source image into a tiny 3D voxel scene that fits inside a ${GRID_SIZE}×${GRID_SIZE}×${GRID_SIZE} grid.

# Coordinate system
- Axes: X = right, Y = up, Z = forward (away from viewer).
- Each axis runs from 0 to ${MAX_INDEX} (inclusive). Every voxel MUST satisfy 0 ≤ x ≤ ${MAX_INDEX}, 0 ≤ y ≤ ${MAX_INDEX}, 0 ≤ z ≤ ${MAX_INDEX}.
- y = 0 is the ground plane. Build on top of it; do not float objects unless they are intentionally airborne (clouds, birds, lamps, fruit on a branch).
- Centre the composition roughly around x ≈ ${Math.floor(GRID_SIZE / 2)}, z ≈ ${Math.floor(GRID_SIZE / 2)} unless the scene demands otherwise.
- The grid is small. Objects must be SIMPLIFIED. A whole tree might be only 30–80 voxels.

# Process — populate \`analysis\` BEFORE \`voxels\`
1. Describe what you see in 1–2 sentences. Is the source a photo of a real 3D scene, or a 2D drawing / sketch / icon / painting?
2. Enumerate the distinct objects. For each, give it a short name and estimate its real-world size and depth relative to the others.
3. If the source is 2D (drawing, sketch, icon, painting), INFER the 3D shape the artist intended. A circle on paper might be a sphere, a tree crown, the sun, a wheel — reason about what each shape REPRESENTS, not just its 2D outline.
4. Plan placement inside the ${GRID_SIZE}³ grid. Assign each object its own footprint so they DO NOT OCCUPY THE SAME CELLS. Use depth (z) to separate things that overlap in the 2D image. Leave breathing room — adjacent objects should not touch unless they physically connect (a trunk meeting its foliage, a roof on a house).
5. Choose materials from the palette by INTENT, not by raw pixel colour. A tree trunk is "dark brown" + foliage "green" / "dark green", not whatever exact hex the photo had. A sun is "yellow", not "amber". Pick the material that BEST describes what the cell IS.

# Palette — choose \`c\` (material index) from this list
\`c\` is a single byte (0–${MAX_COLOR}). Materials available:
${PALETTE_LINES}

# Density guidance — adjust by the effort field in the user message
- weak:   ~30–200 voxels. Rough silhouettes only, one block per major feature.
- medium: ~200–800 voxels. Recognisable shapes with light detail and shading.
- strong: ~800–3000 voxels. Full shapes with surface texture and multi-tone shading.
- Hard cap: never emit more than ${MAX_VOXELS} voxels under any effort.

# Output rules
- Return STRICT JSON matching the provided schema. No prose outside the JSON.
- All x, y, z, c values are integers.
- Each (x, y, z) appears AT MOST ONCE. No duplicate cells.
- Prefer fewer, well-placed voxels over noise — every voxel should belong to something.`

const VOXEL_SCHEMA = {
  name: 'voxel_scene',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['analysis', 'voxels'],
    properties: {
      analysis: {
        type: 'string',
        description:
          'Step-by-step scene reasoning: source type, objects, depths, placement plan, palette choices. Populate this before placing voxels.',
      },
      voxels: {
        type: 'array',
        maxItems: MAX_VOXELS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'z', 'c'],
          properties: {
            x: { type: 'integer', minimum: 0, maximum: MAX_INDEX },
            y: { type: 'integer', minimum: 0, maximum: MAX_INDEX },
            z: { type: 'integer', minimum: 0, maximum: MAX_INDEX },
            c: { type: 'integer', minimum: 0, maximum: MAX_COLOR },
          },
        },
      },
    },
  },
} as const

interface RawVoxel {
  x: number
  y: number
  z: number
  c: number
}

interface RawScene {
  analysis?: string
  voxels?: RawVoxel[]
}

function maxTokensForEffort(effort: EffortPreset): number {
  if (effort === 'strong') return 16000
  if (effort === 'medium') return 8000
  return 3000
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

function toVoxels(scene: RawScene): Voxel[] {
  if (!scene.voxels || !Array.isArray(scene.voxels)) {
    throw new ChatError(200, scene, 'Model response missing `voxels` array')
  }

  const byKey = new Map<string, Voxel>()
  for (const v of scene.voxels) {
    if (!v || typeof v !== 'object') continue
    if (!isInt(v.x) || !isInt(v.y) || !isInt(v.z) || !isInt(v.c)) continue
    if (v.x < 0 || v.x > MAX_INDEX) continue
    if (v.y < 0 || v.y > MAX_INDEX) continue
    if (v.z < 0 || v.z > MAX_INDEX) continue
    if (v.c < 0 || v.c > MAX_COLOR) continue

    const voxel: Voxel = {
      x: v.x,
      y: v.y,
      z: v.z,
      color: PALETTE_ENTRIES[v.c].hex,
    }
    byKey.set(cellKey(voxel), voxel)
    if (byKey.size >= MAX_VOXELS) break
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

export async function generateVoxelScene(
  image: CapturedImage,
  modelId: string,
  effort: EffortPreset,
): Promise<Voxel[]> {
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
  })

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

  return toVoxels(parseScene(content))
}
