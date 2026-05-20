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

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  response_format?: ResponseFormat
  temperature?: number
  max_tokens?: number
  top_p?: number
  seed?: number
  stop?: string | string[]
  // OpenRouter usage accounting. Setting `include: true` makes the response
  // `usage` block include a `cost` field (USD) alongside the token counts.
  usage?: { include: boolean }
}

export interface ChatChoice {
  index: number
  message: ChatMessage
  finish_reason: string | null
}

export interface ChatResponse {
  id: string
  model: string
  choices: ChatChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    // Present when the request was sent with `usage: { include: true }`.
    cost?: number
  }
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

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new ChatError(res.status, text, `Non-JSON response (${res.status})`)
  }

  if (!res.ok) {
    console.error(`/api/chat ${res.status}`, parsed)
    const err = (
      parsed as {
        error?:
          | string
          | { message?: string; metadata?: { raw?: unknown; provider_name?: string } }
      } | null
    )?.error
    let message: string
    if (typeof err === 'string') {
      message = err
    } else if (err && typeof err === 'object') {
      const base = err.message ?? `Request failed (${res.status})`
      const raw = err.metadata?.raw
      const provider = err.metadata?.provider_name
      const rawStr =
        typeof raw === 'string'
          ? raw
          : raw != null
            ? JSON.stringify(raw)
            : ''
      message =
        rawStr.length > 0
          ? `${base}${provider ? ` (${provider})` : ''}: ${rawStr.slice(0, 600)}`
          : base
    } else {
      message = `Request failed (${res.status}): ${text.slice(0, 400)}`
    }
    throw new ChatError(res.status, parsed, message)
  }

  return parsed as ChatResponse
}
