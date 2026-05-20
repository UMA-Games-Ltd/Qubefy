export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url'
      image_url: { url: string; detail?: 'low' | 'high' | 'auto' }
    }

export interface ChatMessage {
  role: ChatRole
  content: string | ChatContentPart[]
  name?: string
}

export interface JsonSchemaResponseFormat {
  type: 'json_schema'
  json_schema: {
    name: string
    schema: Record<string, unknown>
    strict?: boolean
  }
}

export interface JsonObjectResponseFormat {
  type: 'json_object'
}

export type ResponseFormat = JsonSchemaResponseFormat | JsonObjectResponseFormat

export interface ReasoningConfig {
  effort?: 'low' | 'medium' | 'high'
  max_tokens?: number
  enabled?: boolean
  exclude?: boolean
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  response_format?: ResponseFormat
  temperature?: number
  max_tokens?: number
  top_p?: number
  seed?: number
  stop?: string | string[]
  reasoning?: ReasoningConfig
}

export interface ChatUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  // Present when `usage: { include: true }` was forwarded — the Edge Function
  // always sets that, so this is generally populated.
  cost?: number
}

export interface StreamCallbacks {
  // Fires once per chunk that carries `delta.content`.
  // `totalChars` is the accumulated length of the buffered content so far.
  onContentDelta?: (delta: string, totalChars: number) => void
  // Fires once per chunk that carries `delta.reasoning` (the model's
  // scratchpad / chain-of-thought). Not part of the final answer; useful
  // only as a UI liveness indicator.
  onReasoningDelta?: (delta: string) => void
}

export interface StreamResult {
  content: string
  usage?: ChatUsage
  model?: string
  finishReason?: string | null
}

export class ChatError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'ChatError'
    this.status = status
    this.body = body
  }
}

interface SseChunk {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: { content?: string; reasoning?: string }
    finish_reason?: string | null
  }>
  usage?: ChatUsage
  error?: { message?: string } | string
}

function extractErrorMessage(parsed: unknown, status: number, text: string): string {
  const err = (
    parsed as {
      error?:
        | string
        | { message?: string; metadata?: { raw?: unknown; provider_name?: string } }
    } | null
  )?.error
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const base = err.message ?? `Request failed (${status})`
    const raw = err.metadata?.raw
    const provider = err.metadata?.provider_name
    const rawStr =
      typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : ''
    return rawStr.length > 0
      ? `${base}${provider ? ` (${provider})` : ''}: ${rawStr.slice(0, 600)}`
      : base
  }
  return `Request failed (${status}): ${text.slice(0, 400)}`
}

export async function chatStream(
  req: ChatRequest,
  cb?: StreamCallbacks,
): Promise<StreamResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON error body — surface the raw text.
      throw new ChatError(res.status, text, `Non-JSON response (${res.status})`)
    }
    console.error(`/api/chat ${res.status} — parsed:`, parsed, '\nraw body:\n', text)
    throw new ChatError(res.status, parsed, extractErrorMessage(parsed, res.status, text))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: ChatUsage | undefined
  let model: string | undefined
  let finishReason: string | null = null

  const processFrame = (frame: string) => {
    // A frame may contain multiple lines; the SSE data we care about always
    // starts with `data:`. Comments (`: keep-alive`) are skipped.
    const line = frame.split('\n').find((l) => l.startsWith('data:'))
    if (!line) return
    const data = line.slice(5).trim()
    if (data.length === 0 || data === '[DONE]') return
    let chunk: SseChunk
    try {
      chunk = JSON.parse(data) as SseChunk
    } catch {
      return
    }
    if (chunk.error) {
      const msg =
        typeof chunk.error === 'string'
          ? chunk.error
          : chunk.error.message ?? 'Upstream returned an error'
      throw new ChatError(200, chunk, msg)
    }
    if (chunk.model && !model) model = chunk.model
    const choice = chunk.choices?.[0]
    const delta = choice?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) {
      content += delta
      cb?.onContentDelta?.(delta, content.length)
    }
    const reasoning = choice?.delta?.reasoning
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      cb?.onReasoningDelta?.(reasoning)
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason
    if (chunk.usage) usage = chunk.usage
  }

  // Read until the upstream closes the stream. The Edge Function forwards
  // OpenRouter's `data: [DONE]` terminator; we just keep reading until EOF.
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      processFrame(frame)
    }
  }
  if (buffer.trim().length > 0) processFrame(buffer)

  return { content, usage, model, finishReason }
}
