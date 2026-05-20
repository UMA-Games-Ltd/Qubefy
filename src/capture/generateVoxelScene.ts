import { chatStream, ChatError, type ChatMessage } from '../lib/openrouter'
import {
  GRID_SIZE,
  PALETTE_ENTRIES,
  cellKey,
  type Voxel,
} from '../scenes/voxelEditor/coords'
import type { CapturedImage, EffortPreset } from './types'
import { schemeById, type GenerateScheme } from './schemes'
import { MAX_VOXELS } from './constants'

export { MAX_VOXELS }

const MAX_INDEX = GRID_SIZE - 1
const MAX_COLOR = PALETTE_ENTRIES.length - 1

type RawTuple = number[]

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

export function writeCell(
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

// Primitive expansion helpers — currently unused by the points scheme (the
// model emits only individual cells). The Code scheme re-implements the same
// math inside the worker. Kept here for any future host-side caller that wants
// to build scenes from cuboids/spheres directly without a model round-trip.
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

function maxTokensFor(effort: EffortPreset, _scheme: GenerateScheme): number {
  if (effort === 'strong') return 8000
  if (effort === 'medium') return 5000
  return 3000
}

function reasoningEffortFor(effort: EffortPreset): 'low' | 'medium' | 'high' {
  if (effort === 'strong') return 'high'
  if (effort === 'medium') return 'medium'
  return 'low'
}

export interface GenerationInfo {
  model: string
  effort: EffortPreset
  scheme: GenerateScheme
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  durationMs: number
}

export interface GenerationResult {
  voxels: Voxel[]
  info: GenerationInfo | null
}

export interface GenerationProgress {
  // Accumulated characters of buffered content. Convert to a 0..1 fraction in
  // the UI using `maxTokens` (rough chars-per-token = 4).
  chars: number
  // The cap that was requested for this call — lets the UI compute a stable
  // denominator without re-deriving it from effort+scheme.
  maxTokens: number
}

export interface GenerateOptions {
  onProgress?: (progress: GenerationProgress) => void
  onReasoningDelta?: (delta: string) => void
}

export async function generateVoxelScene(
  image: CapturedImage,
  modelId: string,
  effort: EffortPreset,
  scheme: GenerateScheme,
  opts: GenerateOptions = {},
): Promise<GenerationResult> {
  const startedAt = performance.now()
  const dataUrl = await downsizeImage(image)
  const descriptor = schemeById(scheme)
  const maxTokens = maxTokensFor(effort, scheme)

  const messages: ChatMessage[] = [
    { role: 'system', content: descriptor.systemPrompt },
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

  const { content, usage, finishReason } = await chatStream(
    {
      model: modelId,
      messages,
      response_format: { type: 'json_schema', json_schema: descriptor.jsonSchema },
      temperature: 0.4,
      max_tokens: maxTokens,
      reasoning: { effort: reasoningEffortFor(effort) },
    },
    {
      onContentDelta: (_, totalChars) => {
        opts.onProgress?.({ chars: totalChars, maxTokens })
      },
      onReasoningDelta: (delta) => {
        opts.onReasoningDelta?.(delta)
      },
    },
  )

  let info: GenerationInfo | null = null
  if (usage) {
    const { prompt_tokens, completion_tokens, total_tokens, cost } = usage
    info = {
      model: modelId,
      effort,
      scheme,
      promptTokens: prompt_tokens,
      completionTokens: completion_tokens,
      totalTokens: total_tokens,
      cost: typeof cost === 'number' ? cost : undefined,
      durationMs: Math.round(performance.now() - startedAt),
    }
    const costStr =
      typeof cost === 'number' ? `$${cost.toFixed(6)}` : 'n/a'
    console.log(
      `[generateVoxelScene] ${modelId} (${effort}, ${scheme}) — tokens: ${prompt_tokens} in / ${completion_tokens} out / ${total_tokens} total · cost: ${costStr} · duration: ${(info.durationMs / 1000).toFixed(2)}s`,
    )
  }

  if (typeof content !== 'string' || content.length === 0) {
    throw new ChatError(
      200,
      { finishReason },
      finishReason === 'length'
        ? 'Model hit the token limit before finishing — try a smaller effort'
        : 'Model returned empty content',
    )
  }

  const voxels = await descriptor.parseToVoxels(content, effort)
  return { voxels, info }
}
