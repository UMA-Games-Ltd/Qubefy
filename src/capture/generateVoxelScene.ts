import { chatStream, ChatError, type ChatMessage } from '../lib/openrouter'
import type { GridSize, Voxel } from '../scenes/voxelEditor/coords'
import type { CapturedImage, ComplexityPreset } from './types'
import {
  CODE_SYSTEM_PROMPT,
  CODE_JSON_SCHEMA,
  parseCodeSceneToVoxels,
} from './codeScheme'
import { MAX_VOXELS } from './constants'

export { MAX_VOXELS }

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

function maxTokensFor(complexity: ComplexityPreset): number {
  if (complexity === 'high') return 16000
  if (complexity === 'medium') return 10000
  return 6000
}

export interface GenerationInfo {
  model: string
  complexity: ComplexityPreset
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  durationMs: number
}

export interface GenerationResult {
  voxels: Voxel[]
  size: GridSize
  info: GenerationInfo | null
}

export interface GenerationProgress {
  // Accumulated characters of buffered content. Convert to a 0..1 fraction in
  // the UI using `maxTokens` (rough chars-per-token = 4).
  chars: number
  // The cap that was requested for this call — lets the UI compute a stable
  // denominator without re-deriving it from complexity.
  maxTokens: number
}

export interface GenerateOptions {
  onProgress?: (progress: GenerationProgress) => void
  onReasoningDelta?: (delta: string) => void
}

export async function generateVoxelScene(
  image: CapturedImage,
  modelId: string,
  complexity: ComplexityPreset,
  opts: GenerateOptions = {},
): Promise<GenerationResult> {
  const startedAt = performance.now()
  const dataUrl = await downsizeImage(image)
  const maxTokens = maxTokensFor(complexity)

  const messages: ChatMessage[] = [
    { role: 'system', content: CODE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Complexity: ${complexity}. Generate a voxel scene from this image.`,
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
      response_format: { type: 'json_schema', json_schema: CODE_JSON_SCHEMA },
      temperature: 0.4,
      max_tokens: maxTokens,
      reasoning: { effort: complexity },
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
      complexity,
      promptTokens: prompt_tokens,
      completionTokens: completion_tokens,
      totalTokens: total_tokens,
      cost: typeof cost === 'number' ? cost : undefined,
      durationMs: Math.round(performance.now() - startedAt),
    }
    const costStr =
      typeof cost === 'number' ? `$${cost.toFixed(6)}` : 'n/a'
    console.log(
      `[generateVoxelScene] ${modelId} (${complexity}) — tokens: ${prompt_tokens} in / ${completion_tokens} out / ${total_tokens} total · cost: ${costStr} · duration: ${(info.durationMs / 1000).toFixed(2)}s`,
    )
  }

  if (typeof content !== 'string' || content.length === 0) {
    throw new ChatError(
      200,
      { finishReason },
      finishReason === 'length'
        ? 'Model hit the token limit before producing any output — reasoning likely consumed the entire budget. Try a smaller complexity or a non-reasoning model.'
        : 'Model returned empty content',
    )
  }

  if (finishReason === 'length') {
    throw new ChatError(
      200,
      { finishReason, contentChars: content.length },
      'Model hit the token limit mid-response — the JSON is truncated. Try a smaller complexity or a non-reasoning model.',
    )
  }

  const { voxels, size } = await parseCodeSceneToVoxels(content)
  return { voxels, size, info }
}
